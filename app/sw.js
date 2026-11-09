/* ==========================================================================
   Reparo — Service worker (offline-first + notificaciones)
   --------------------------------------------------------------------------
   · La app es un único index.html autocontenido: es el "app shell".
   · Navegación → responde AL INSTANTE desde caché y revalida en segundo plano.
     Si el servidor tiene un index.html distinto, lo guarda y avisa a las
     ventanas con postMessage({ type: 'UPDATE_READY' }).
   · Sólo intercepta GET del MISMO origen y dentro del scope. Nunca toca /api/*,
     ni enlaces externos (https://wa.me/…, mapas, etc.), ni blob:/data: (Web
     Share con archivos funciona igual que sin service worker).
   · Notificaciones: push (Web Push), locales (SHOW_NOTIFICATION) y
     recordatorios por periodic background sync ('reparo-checks').
   El build reemplaza la constante VERSION por un hash de index.html.
   ========================================================================== */
'use strict';

const VERSION = '7dc88e7129';

const PREFIX = 'reparo-';
const SHELL_CACHE = PREFIX + 'shell-' + VERSION;
const RUNTIME_CACHE = PREFIX + 'runtime-' + VERSION;
/** Caché estable entre versiones: configuración que envía la página. */
const META_CACHE = PREFIX + 'meta';
const RUNTIME_MAX_ENTRIES = 60;
const REVALIDATE_THROTTLE_MS = 30 * 1000;
const REMINDER_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000;

const SCOPE = new URL(self.registration.scope);
const abs = (p) => new URL(p, SCOPE).href;

/** Clave única del app shell en caché (sirve "./" y "./index.html"). */
const SHELL_KEY = abs('./index.html');
const CONFIG_KEY = abs('./__reparo/sw-config.json');

const ICON = abs('./icons/icon-192.png');
const BADGE = abs('./icons/badge-96.png');

/** Recursos estáticos que se precachean junto al shell (tolerante a faltantes). */
const PRECACHE_ASSETS = [
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/badge-96.png',
  './icons/shortcut-cliente.png',
  './icons/shortcut-gasto.png',
  './icons/shortcut-pedir.png',
  './icons/shortcut-reportes.png',
].map(abs);
const PRECACHE_SET = new Set(PRECACHE_ASSETS);

/* ------------------------------ Utilidades ------------------------------ */

function isApi(url) {
  return /\/api(\/|$)/.test(url.pathname);
}

/** ¿La navegación debe resolverse con el app shell? (raíz, index.html o rutas sin extensión). */
function isShellNavigation(url) {
  const path = url.pathname;
  if (path === SCOPE.pathname || path === SCOPE.pathname + 'index.html') return true;
  const last = path.slice(path.lastIndexOf('/') + 1);
  return path.startsWith(SCOPE.pathname) && last !== '' && !last.includes('.');
}

async function sha256Hex(buf) {
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Copia "limpia" de una respuesta (sin `redirected`, apta para navegaciones)
 * con su huella digital en `x-reparo-digest`.
 */
async function stamp(res) {
  const buf = await res.arrayBuffer();
  const headers = new Headers(res.headers);
  headers.set('x-reparo-digest', await sha256Hex(buf));
  headers.set('x-reparo-cached-at', String(Date.now()));
  if (!headers.has('content-type')) headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(buf, { status: 200, statusText: 'OK', headers });
}

/** Descarga el index.html (prueba "./" y luego "./index.html"). */
async function fetchShell(cacheMode) {
  let lastError = null;
  for (const p of ['./', './index.html']) {
    try {
      const res = await fetch(new Request(abs(p), { cache: cacheMode, credentials: 'same-origin' }));
      const type = res.headers.get('content-type') || '';
      if (res.ok && (!type || type.includes('html'))) return res;
      lastError = new Error('HTTP ' + res.status + ' en ' + p);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('No se pudo descargar la app');
}

async function windowClients() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
}

async function broadcast(message) {
  for (const client of await windowClients()) {
    try {
      client.postMessage(message);
    } catch (_) {
      /* ventana cerrándose */
    }
  }
}

function reply(event, message) {
  const port = event.ports && event.ports[0];
  if (port) port.postMessage(message);
  else if (event.source) event.source.postMessage(message);
}

async function readConfig() {
  try {
    const cache = await caches.open(META_CACHE);
    const res = await cache.match(CONFIG_KEY);
    return res ? await res.json() : {};
  } catch (_) {
    return {};
  }
}

async function writeConfig(patch) {
  const current = await readConfig();
  const next = Object.assign({}, current, patch || {});
  const cache = await caches.open(META_CACHE);
  await cache.put(
    CONFIG_KEY,
    new Response(JSON.stringify(next), { headers: { 'content-type': 'application/json' } }),
  );
  return next;
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

function offlineResponse() {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#06070a"><title>Reparo · Sin conexión</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#06070a;color:#eef0f6;
       font:15px/1.5 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;padding:24px;box-sizing:border-box}
  .card{max-width:420px;padding:32px;border-radius:20px;background:#0e1015;border:1px solid rgba(255,255,255,.08);
        box-shadow:0 24px 64px -12px rgba(0,0,0,.7);text-align:center}
  .logo{width:56px;height:56px;border-radius:14px;margin:0 auto 20px;
        background:linear-gradient(135deg,#8b7bff,#5b8cff 48%,#22d3ee)}
  h1{font-size:20px;margin:0 0 8px;letter-spacing:-.02em}
  p{margin:0 0 24px;color:#a7adbb}
  button{font:inherit;font-weight:600;color:#fff;background:#7c6cff;border:0;border-radius:10px;padding:10px 20px;cursor:pointer}
</style></head><body><main class="card">
  <div class="logo" aria-hidden="true"></div>
  <h1>Reparo todavía no está guardado en este dispositivo</h1>
  <p>Ábrelo una vez con internet y quedará disponible sin conexión para siempre.</p>
  <button onclick="location.reload()">Reintentar</button>
</main></body></html>`;
  return new Response(html, {
    status: 503,
    statusText: 'Sin conexion',
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/* ------------------------------ Instalación ----------------------------- */

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // 1) El shell es crítico: si no se puede descargar, la instalación falla
      //    y se conserva el service worker anterior (nunca queda una app rota).
      const shell = await fetchShell('reload');
      await cache.put(SHELL_KEY, await stamp(shell));
      // 2) Íconos y manifest: tolerante a faltantes.
      await Promise.all(
        PRECACHE_ASSETS.map(async (url) => {
          try {
            const res = await fetch(new Request(url, { cache: 'reload' }));
            if (res.ok) await cache.put(url, res);
          } catch (_) {
            /* se reintentará en tiempo de ejecución */
          }
        }),
      );
    })(),
  );
  // No hacemos skipWaiting automático: la página muestra "Actualizar" y
  // envía SKIP_WAITING cuando el usuario lo decide.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, RUNTIME_CACHE, META_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith(PREFIX) && !keep.has(n)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.disable();
        } catch (_) {
          /* no soportado */
        }
      }
      await self.clients.claim();
      await broadcast({ type: 'SW_ACTIVATED', version: VERSION });
    })(),
  );
});

/* -------------------------------- Fetch --------------------------------- */

/** Huella del index.html que se entregó a cada ventana (resultingClientId → digest). */
const servedDigest = new Map();
let revalidating = null;
let lastRevalidate = 0;

async function currentShellDigest() {
  const cache = await caches.open(SHELL_CACHE);
  const res = await cache.match(SHELL_KEY);
  return res ? res.headers.get('x-reparo-digest') : null;
}

/** Revalida el shell contra la red; si cambió lo guarda y avisa. */
function revalidateShell(force) {
  if (revalidating) return revalidating;
  const now = Date.now();
  if (!force && now - lastRevalidate < REVALIDATE_THROTTLE_MS) return Promise.resolve(false);
  lastRevalidate = now;
  revalidating = (async () => {
    try {
      // 'no-cache' = petición condicional: si no cambió, el servidor responde 304.
      const fresh = await stamp(await fetchShell('no-cache'));
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(SHELL_KEY);
      const oldDigest = cached ? cached.headers.get('x-reparo-digest') : null;
      const newDigest = fresh.headers.get('x-reparo-digest');
      if (oldDigest === newDigest) return false;
      await cache.put(SHELL_KEY, fresh);
      if (cached) {
        await broadcast({ type: 'UPDATE_READY', version: VERSION, digest: newDigest });
        // Si hay un sw.js nuevo, que el navegador lo instale ya.
        self.registration.update().catch(() => {});
      }
      return true;
    } catch (_) {
      return false; // sin conexión o servidor caído: seguimos con la caché
    } finally {
      revalidating = null;
    }
  })();
  return revalidating;
}

async function handleShellNavigation(event) {
  const cache = await caches.open(SHELL_CACHE);
  let cached = await cache.match(SHELL_KEY);
  if (!cached) cached = await caches.match(SHELL_KEY); // caché de una versión anterior
  if (cached) {
    if (event.resultingClientId) servedDigest.set(event.resultingClientId, cached.headers.get('x-reparo-digest'));
    event.waitUntil(revalidateShell(false));
    return cached;
  }
  // Primera visita (o caché borrada): red, y guardamos para la próxima.
  try {
    const fresh = await stamp(await fetchShell('no-cache'));
    event.waitUntil(cache.put(SHELL_KEY, fresh.clone()));
    if (event.resultingClientId) servedDigest.set(event.resultingClientId, fresh.headers.get('x-reparo-digest'));
    return fresh;
  } catch (_) {
    return offlineResponse();
  }
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return offlineResponse();
    throw err;
  }
}

/** Precacheados: caché primero. Resto del mismo origen: stale-while-revalidate. */
async function handleAsset(event) {
  const request = event.request;
  const url = request.url.split('#')[0];
  if (PRECACHE_SET.has(url)) {
    const cached = await caches.match(url);
    if (cached) return cached;
    const res = await fetch(request);
    if (res.ok) {
      const copy = res.clone();
      event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.put(url, copy)));
    }
    return res;
  }
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (res) => {
      const cc = res.headers.get('cache-control') || '';
      if (res.ok && res.type === 'basic' && !/no-store/i.test(cc)) {
        await cache.put(request, res.clone());
        await trimCache(RUNTIME_CACHE, RUNTIME_MAX_ENTRIES);
      }
      return res;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  const res = await network;
  return res || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }
  // Otros orígenes (wa.me, servidor de sincronización en otro dominio…): sin tocar.
  if (url.origin !== self.location.origin) return;
  // La API jamás se cachea ni se intercepta.
  if (isApi(url)) return;
  if (!url.href.startsWith(SCOPE.href)) return;
  if (url.pathname.endsWith('/sw.js')) return;
  if (request.headers.has('range')) return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  if (request.mode === 'navigate') {
    event.respondWith(isShellNavigation(url) ? handleShellNavigation(event) : networkFirst(request));
    return;
  }
  event.respondWith(handleAsset(event));
});

/* ---------------------------- Notificaciones ---------------------------- */

const ACTIONS = {
  stock_bajo: [
    { action: 'open', title: 'Ver repuesto' },
    { action: 'pedir', title: 'Lista por pedir' },
  ],
  listo_sin_entregar: [
    { action: 'open', title: 'Ver equipo' },
    { action: 'dismiss', title: 'Más tarde' },
  ],
  pago_pendiente: [
    { action: 'open', title: 'Ver saldo' },
    { action: 'dismiss', title: 'Más tarde' },
  ],
  garantia: [
    { action: 'open', title: 'Ver servicio' },
    { action: 'dismiss', title: 'Más tarde' },
  ],
  resumen: [
    { action: 'open', title: 'Ver resumen' },
    { action: 'reportes', title: 'Reportes' },
  ],
  respaldo: [
    { action: 'open', title: 'Respaldar ahora' },
    { action: 'dismiss', title: 'Más tarde' },
  ],
  meta: [{ action: 'reportes', title: 'Ver reportes' }],
};

const ACTION_HREF = {
  pedir: '#/inventario?filtro=pedir',
  reportes: '#/reportes',
};

/**
 * Muestra una notificación del sistema con la estética de Reparo.
 * @param {{ title?: string, body?: string, href?: string, tag?: string, kind?: string, silent?: boolean }} n
 */
async function showAppNotification(n) {
  const title = (n && n.title) || 'Reparo';
  const options = {
    body: (n && n.body) || '',
    icon: ICON,
    badge: BADGE,
    lang: 'es',
    dir: 'ltr',
    timestamp: Date.now(),
    vibrate: [90, 50, 90],
    data: { href: (n && n.href) || '#/panel', kind: (n && n.kind) || 'sistema' },
  };
  if (n && n.tag) {
    options.tag = String(n.tag);
    options.renotify = true;
  }
  if (n && n.silent) options.silent = true;
  const actions = ACTIONS[options.data.kind];
  const maxActions = (self.Notification && self.Notification.maxActions) || 0;
  if (actions && maxActions > 0) options.actions = actions.slice(0, maxActions);
  try {
    await self.registration.showNotification(title, options);
  } catch (_) {
    // Navegadores estrictos con opciones no soportadas: versión mínima.
    delete options.actions;
    delete options.renotify;
    delete options.vibrate;
    await self.registration.showNotification(title, options);
  }
}

/** Convierte un href ("#/x", "./#/x", "https://…") en una URL absoluta. */
function resolveHref(href) {
  const value = String(href || '#/panel');
  if (value.startsWith('#')) return new URL(SCOPE.href + value);
  return new URL(value, SCOPE);
}

async function openHref(href) {
  const target = resolveHref(href);
  // Enlaces externos (p. ej. https://wa.me/…): se abren tal cual.
  if (target.origin !== self.location.origin) return self.clients.openWindow(target.href);
  const hash = target.hash || '#/panel';
  const clients = (await windowClients()).filter((c) => c.url.startsWith(SCOPE.href));
  const client =
    clients.find((c) => c.focused) || clients.find((c) => c.visibilityState === 'visible') || clients[0];
  if (client) {
    try {
      await client.focus();
    } catch (_) {
      /* algunos navegadores no permiten enfocar */
    }
    client.postMessage({ type: 'NAVIGATE', href: hash });
    return client;
  }
  return self.clients.openWindow(SCOPE.href + hash);
}

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json() || {};
    } catch (_) {
      payload = { body: event.data.text() };
    }
  }
  event.waitUntil(
    (async () => {
      await showAppNotification({
        title: payload.title || 'Reparo',
        body: payload.body || 'Tienes novedades en tu taller.',
        href: payload.href || '#/panel',
        tag: payload.tag,
        kind: payload.kind || 'sistema',
      });
      await broadcast({ type: 'PUSH_RECEIVED', payload });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  notification.close();
  if (event.action === 'dismiss') return;
  const data = notification.data || {};
  const href = ACTION_HREF[event.action] || data.href || '#/panel';
  event.waitUntil(openHref(href));
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const cfg = await readConfig();
      const old = event.oldSubscription || null;
      let sub = event.newSubscription || null;
      if (!sub) {
        const key = (old && old.options && old.options.applicationServerKey) || null;
        if (!key) return;
        sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }
      if (!cfg.pushServer || !cfg.deviceId) return;
      const post = (path, body) =>
        fetch(cfg.pushServer + path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      await post('/api/push/subscribe', { deviceId: cfg.deviceId, subscription: sub.toJSON() });
      if (old && old.endpoint) await post('/api/push/unsubscribe', { endpoint: old.endpoint }).catch(() => {});
    })().catch(() => {}),
  );
});

/* ------------------------- Periodic background sync --------------------- */

self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'reparo-checks') return;
  event.waitUntil(
    (async () => {
      const clients = await windowClients();
      if (clients.length) {
        // Con la app abierta, ella evalúa las reglas reales (stock, entregas, cobros…).
        for (const c of clients) c.postMessage({ type: 'RUN_CHECKS', reason: 'periodicsync' });
        return;
      }
      const cfg = await readConfig();
      if (cfg.notificationsEnabled === false) return;
      if (self.Notification && self.Notification.permission !== 'granted') return;
      if (Date.now() - (cfg.lastReminderAt || 0) < REMINDER_MIN_INTERVAL_MS) return;
      const hour = new Date().getHours();
      if (hour < 8 || hour >= 21) return;
      await showAppNotification({
        title: 'Tu taller te espera en Reparo',
        body: 'Revisa repuestos por pedir, equipos listos para entregar y tu resumen del día.',
        href: '#/panel',
        tag: 'reparo-recordatorio',
        kind: 'resumen',
        silent: true,
      });
      await writeConfig({ lastReminderAt: Date.now() });
    })(),
  );
});

/* ------------------------------- Mensajes ------------------------------- */

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  switch (msg.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'SHOW_NOTIFICATION':
      event.waitUntil(
        showAppNotification({
          title: msg.title,
          body: msg.body,
          href: msg.href,
          tag: msg.tag,
          kind: msg.kind,
          silent: msg.silent,
        }),
      );
      break;
    case 'GET_STATUS':
      event.waitUntil(
        (async () => {
          const digest = await currentShellDigest();
          const id = event.source && event.source.id;
          const served = id ? servedDigest.get(id) : undefined;
          reply(event, {
            type: 'STATUS',
            version: VERSION,
            updateReady: !!(served && digest && served !== digest),
          });
        })(),
      );
      break;
    case 'GET_VERSION':
      reply(event, { type: 'VERSION', version: VERSION });
      break;
    case 'CHECK_UPDATE':
      event.waitUntil(revalidateShell(true));
      break;
    case 'CONFIG':
      event.waitUntil(writeConfig(msg.config));
      break;
    case 'CLEAR_CACHES':
      event.waitUntil(
        (async () => {
          const names = await caches.keys();
          await Promise.all(names.filter((n) => n.startsWith(PREFIX)).map((n) => caches.delete(n)));
          reply(event, { type: 'CACHES_CLEARED' });
        })(),
      );
      break;
    default:
      break;
  }
});

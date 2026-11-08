/* ==========================================================================
   Registro del service worker, ciclo de actualización y mensajes SW → página.
   - Sólo registra en http(s) con contexto seguro y en builds de producción
     (`import.meta.env.PROD`). Abriendo index.html desde file:// NO registra.
   - Los listeners se instalan al importar el módulo para no perder mensajes
     que el SW envíe antes de que React monte la capa PWA.
   ========================================================================== */
import { navigate } from '@/app/router';
import { createStore } from './store';
import { hasServiceWorker, isBrowser, isHttp, isSecure, safeStorage } from './env';

export type SwStatus = 'unsupported' | 'disabled' | 'registering' | 'ready' | 'error';

export interface SwState {
  status: SwStatus;
  registration: ServiceWorkerRegistration | null;
  /** Hay una versión nueva lista para aplicar. */
  updateReady: boolean;
  /** Se está aplicando la actualización (recarga en curso). */
  updating: boolean;
  /** La app quedó guardada para usarse sin internet por primera vez. */
  offlineReady: boolean;
  /** Versión del service worker que controla la página (hash del build). */
  version: string | null;
  error: string | null;
}

export const swStore = createStore<SwState>({
  status: hasServiceWorker() ? 'registering' : 'unsupported',
  registration: null,
  updateReady: false,
  updating: false,
  offlineReady: false,
  version: null,
  error: null,
});

const patch = (p: Partial<SwState>) => swStore.set((s) => ({ ...s, ...p }));

/* ----------------------- Suscriptores a mensajes del SW ------------------- */

const runChecksListeners = new Set<() => void>();
/** El SW pide evaluar las reglas de notificación (periodic background sync). */
export function onRunChecksRequest(cb: () => void): () => void {
  runChecksListeners.add(cb);
  return () => runChecksListeners.delete(cb);
}

const pushListeners = new Set<(payload: unknown) => void>();
/** Llegó un Web Push mientras la app estaba abierta. */
export function onPushReceived(cb: (payload: unknown) => void): () => void {
  pushListeners.add(cb);
  return () => pushListeners.delete(cb);
}

let hadController = hasServiceWorker() && !!navigator.serviceWorker.controller;
let userRequestedUpdate = false;
let reloading = false;
const OFFLINE_READY_KEY = 'reparo.offlineReadyShown';

function markUpdateReady() {
  if (!swStore.get().updateReady) patch({ updateReady: true });
}

function reloadOnce() {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

function handleMessage(event: MessageEvent) {
  const msg = event.data as { type?: string; [k: string]: unknown } | null;
  if (!msg || typeof msg !== 'object') return;
  switch (msg.type) {
    case 'UPDATE_READY':
      markUpdateReady();
      break;
    case 'STATUS':
      if (msg.updateReady) markUpdateReady();
      if (typeof msg.version === 'string') patch({ version: msg.version });
      break;
    case 'VERSION':
    case 'SW_ACTIVATED':
      if (typeof msg.version === 'string') patch({ version: msg.version });
      break;
    case 'NAVIGATE':
      if (typeof msg.href === 'string' && msg.href.startsWith('#/')) {
        navigate(msg.href);
        try {
          window.focus();
        } catch {
          /* noop */
        }
      }
      break;
    case 'RUN_CHECKS':
      runChecksListeners.forEach((cb) => cb());
      break;
    case 'PUSH_RECEIVED':
      pushListeners.forEach((cb) => cb(msg.payload));
      break;
    default:
      break;
  }
}

if (hasServiceWorker()) {
  navigator.serviceWorker.addEventListener('message', handleMessage);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (userRequestedUpdate) {
      reloadOnce();
      return;
    }
    // Primera instalación: el SW reclamó la página → la app ya funciona offline.
    if (!hadController) {
      hadController = true;
      if (!safeStorage.get(OFFLINE_READY_KEY)) {
        safeStorage.set(OFFLINE_READY_KEY, String(Date.now()));
        patch({ offlineReady: true });
      }
    }
  });
  try {
    navigator.serviceWorker.startMessages();
  } catch {
    /* navegadores antiguos: los mensajes se entregan igual */
  }
}

/* ------------------------------ Registro ---------------------------------- */

let started = false;
let lastUpdateCheck = 0;
const UPDATE_INTERVAL_MS = 30 * 60 * 1000;
const UPDATE_MIN_GAP_MS = 5 * 60 * 1000;

function watchRegistration(reg: ServiceWorkerRegistration) {
  if (reg.waiting && navigator.serviceWorker.controller) markUpdateReady();
  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    if (!sw) return;
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed' && navigator.serviceWorker.controller) markUpdateReady();
    });
  });
}

/** Pide al SW su estado (versión y si el index.html cambió desde que se cargó esta ventana). */
function askStatus() {
  const ctrl = navigator.serviceWorker.controller;
  if (ctrl) ctrl.postMessage({ type: 'GET_STATUS' });
}

/** Busca una versión nueva de Reparo (sw.js e index.html). */
export async function checkForUpdates(force = false): Promise<void> {
  const reg = swStore.get().registration;
  if (!reg || !navigator.onLine) return;
  const now = Date.now();
  if (!force && now - lastUpdateCheck < UPDATE_MIN_GAP_MS) return;
  lastUpdateCheck = now;
  try {
    await reg.update();
  } catch {
    /* sin conexión o servidor caído */
  }
  navigator.serviceWorker.controller?.postMessage({ type: 'CHECK_UPDATE' });
}

/**
 * Registra el service worker (idempotente). Sólo en http(s) seguro y en
 * producción; en `vite dev` y en file:// queda deshabilitado a propósito.
 */
export function registerServiceWorker(): void {
  if (started || !isBrowser) return;
  started = true;
  if (!hasServiceWorker()) {
    patch({ status: 'unsupported' });
    return;
  }
  if (!isHttp() || !isSecure() || !import.meta.env.PROD) {
    patch({ status: 'disabled' });
    return;
  }
  const doRegister = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      patch({ registration: reg, status: 'ready', error: null });
      watchRegistration(reg);
      askStatus();
      lastUpdateCheck = Date.now();
      window.setInterval(() => {
        if (document.visibilityState === 'visible') void checkForUpdates();
      }, UPDATE_INTERVAL_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void checkForUpdates();
      });
      window.addEventListener('online', () => void checkForUpdates());
    } catch (err) {
      patch({
        status: 'error',
        error: 'No se pudo activar el modo sin conexión: ' + (err instanceof Error ? err.message : String(err)),
      });
    }
  };
  if (document.readyState === 'complete') void doRegister();
  else window.addEventListener('load', () => void doRegister(), { once: true });
}

function waitForInstalled(sw: ServiceWorker, timeoutMs: number): Promise<ServiceWorker | null> {
  return new Promise((resolve) => {
    if (sw.state === 'installed') return resolve(sw);
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed') {
        window.clearTimeout(timer);
        resolve(sw);
      } else if (sw.state === 'redundant') {
        window.clearTimeout(timer);
        resolve(null);
      }
    });
  });
}

/**
 * Aplica la versión nueva: activa el SW en espera (SKIP_WAITING) y recarga
 * una sola vez cuando toma el control. Si sólo cambió el index.html, recarga.
 */
export async function applyUpdate(): Promise<void> {
  if (reloading || swStore.get().updating) return;
  patch({ updating: true });
  userRequestedUpdate = true;
  const reg =
    swStore.get().registration ?? (hasServiceWorker() ? await navigator.serviceWorker.getRegistration() : undefined);
  let waiting: ServiceWorker | null = reg?.waiting ?? null;
  if (!waiting && reg?.installing) waiting = await waitForInstalled(reg.installing, 8000);
  if (waiting && navigator.serviceWorker.controller) {
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // Red de seguridad por si controllerchange no llega.
    window.setTimeout(reloadOnce, 4000);
    return;
  }
  reloadOnce();
}

/** Versión (hash del build) del SW activo, o null si no hay SW. */
export function getServiceWorkerVersion(timeoutMs = 2000): Promise<string | null> {
  const ctrl = hasServiceWorker() ? navigator.serviceWorker.controller : null;
  if (!ctrl) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (e) => {
      window.clearTimeout(timer);
      const v = (e.data as { version?: string })?.version ?? null;
      if (v) patch({ version: v });
      resolve(v);
    };
    ctrl.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
  });
}

/** Envía al SW la configuración que necesita cuando la app está cerrada. */
export function sendServiceWorkerConfig(config: Record<string, unknown>): void {
  const { status } = swStore.get();
  if (!hasServiceWorker() || (status !== 'ready' && status !== 'registering')) return;
  // En la primera visita el SW aún se está instalando: esperamos a que esté activo.
  void navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'CONFIG', config }));
}

/** Borra las cachés de Reparo (no toca los datos). Útil como "reparar app". */
export async function clearAppCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.startsWith('reparo-')).map((n) => caches.delete(n)));
}

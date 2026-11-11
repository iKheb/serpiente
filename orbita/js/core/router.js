// =============================================================================
// Router hash con páginas y capas superpuestas (overlays) — compartido.
//
// Rutas:
//   #/inicio  #/envivo  #/peliculas  #/series  #/deportes  #/infantil  #/milista
//   #/buscar  #/guia  #/ajustes  #/perfiles
//   #/titulo/:id                 (overlay detalle)
//   #/ver/:id[/:ep]              (overlay reproductor VOD; ep = "s1e2")
//   #/canal/:id                  (overlay reproductor en vivo)
//
// Contrato de módulo de pantalla (export default):
//   { async mount(root, params, ctx), unmount(), onBack?() -> boolean, onParams?(params) }
//   root: <section class="screen screen-NAME"> (páginas, dentro de #view)
//         <div class="overlay overlay-NAME">     (overlays, dentro de #overlays)
//   ctx:  { router, store, nav, bus, device }
// Eventos bus: 'route' { page, overlays:[names], name, params }
// =============================================================================
import { bus } from './bus.js';
import { nav } from './nav.js';
import { store } from './store.js';
import { device } from './device.js';

const PAGES = {
  inicio: { load: () => import('../ui/home.js'), params: { section: 'inicio' } },
  envivo: { load: () => import('../ui/live.js') },
  peliculas: { load: () => import('../ui/home.js'), params: { section: 'peliculas' } },
  series: { load: () => import('../ui/home.js'), params: { section: 'series' } },
  deportes: { load: () => import('../ui/home.js'), params: { section: 'deportes' } },
  infantil: { load: () => import('../ui/home.js'), params: { section: 'infantil' } },
  milista: { load: () => import('../ui/home.js'), params: { section: 'milista' } },
  buscar: { load: () => import('../ui/search.js') },
  guia: { load: () => import('../ui/guide.js') },
  ajustes: { load: () => import('../ui/settings.js') },
  perfiles: { load: () => import('../ui/profiles.js'), shell: false },
};
const OVERLAYS = {
  titulo: { load: () => import('../ui/detail.js'), keys: ['id'] },
  ver: { load: () => import('../ui/player.js'), keys: ['id', 'ep'], params: { mode: 'vod' }, player: true },
  canal: { load: () => import('../ui/player.js'), keys: ['id'], params: { mode: 'live' }, player: true },
};

const view = () => document.getElementById('view');
const overlaysEl = () => document.getElementById('overlays');

let page = null;           // { name, key, mod, root, params }
const stack = [];          // [{ name, key, mod, root, params }]
let idx = 0;               // índice en el historial propio
let busy = Promise.resolve();

function parse(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const name = parts[0] || 'inicio';
  if (OVERLAYS[name]) {
    const def = OVERLAYS[name];
    const params = { ...(def.params || {}) };
    def.keys.forEach((k, i) => { if (parts[i + 1] != null) params[k] = parts[i + 1]; });
    return { kind: 'overlay', name, params };
  }
  if (PAGES[name]) return { kind: 'page', name, params: { ...(PAGES[name].params || {}) } };
  return { kind: 'page', name: 'inicio', params: { section: 'inicio' } };
}

const ctx = () => ({ router, store, nav, bus, device });

async function mountPage(name, params) {
  const def = PAGES[name];
  const key = name + JSON.stringify(params);
  if (page && page.key === key) return;
  const old = page;
  const mod = (await def.load()).default;
  const root = document.createElement('section');
  root.className = `screen screen-${name} screen-enter`;
  root.dataset.screen = name;
  document.documentElement.classList.toggle('no-shell', def.shell === false);
  view().append(root);
  page = { name, key, mod, root, params };
  if (old) {
    old.root.classList.add('screen-leave');
    try { old.mod.unmount?.(); } catch (e) { console.error(e); }
    setTimeout(() => old.root.remove(), 280);
  }
  view().scrollTop = 0;
  await mod.mount(root, params, ctx());
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('screen-enter')));
  if (!stack.length) requestAnimationFrame(() => nav.refresh());
}

function closeOverlay(entry) {
  try { entry.mod.unmount?.(); } catch (e) { console.error(e); }
  nav.popScope(entry.root);
  entry.root.classList.remove('is-open');
  entry.root.classList.add('is-closing');
  setTimeout(() => entry.root.remove(), 320);
}

async function pushOverlay(name, params) {
  const def = OVERLAYS[name];
  const key = name + JSON.stringify(params);
  // ¿Ya está en la pila? Cerrar lo que haya encima.
  const at = stack.findIndex((e) => e.name === name);
  if (at >= 0) {
    while (stack.length > at + 1) closeOverlay(stack.pop());
    const top = stack[at];
    if (top.key === key) return;
    if (top.mod.onParams) { top.key = key; top.params = params; await top.mod.onParams(params); return; }
    closeOverlay(stack.pop());
  }
  const mod = (await def.load()).default;
  const root = document.createElement('div');
  root.className = `overlay overlay-${name}${def.player ? ' overlay-player' : ''}`;
  root.dataset.overlay = name;
  overlaysEl().append(root);
  const entry = { name, key, mod, root, params };
  stack.push(entry);
  nav.pushScope(root, { focus: false });
  await mod.mount(root, params, ctx());
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.classList.add('is-open');
    if (!nav.current() || !root.contains(nav.current())) nav.focusFirst(root);
  }));
}

async function resolve() {
  const r = parse(location.hash);
  if (r.kind === 'page') {
    while (stack.length) closeOverlay(stack.pop());
    await mountPage(r.name, r.params);
  } else {
    if (!page) await mountPage('inicio', PAGES.inicio.params);
    await pushOverlay(r.name, r.params);
  }
  bus.emit('route', {
    page: page?.name, section: page?.params?.section, overlays: stack.map((e) => e.name),
    name: r.name, params: r.params, player: stack.some((e) => OVERLAYS[e.name].player),
  });
}

function schedule() { busy = busy.then(resolve).catch((e) => console.error('[router]', e)); return busy; }

export const router = {
  start() {
    window.addEventListener('popstate', (e) => { idx = e.state?.idx ?? 0; schedule(); });
    bus.on('key:back', () => router.back());
    try { history.replaceState({ idx: 0 }, ''); } catch { /* */ }
    return schedule();
  },
  /** Navega: router.go('titulo/t-abc') · {replace:true} para no apilar historial */
  go(path, { replace = false } = {}) {
    const hash = '#/' + String(path).replace(/^#?\/?/, '');
    if (hash === location.hash && !replace) return busy;
    try {
      if (replace) history.replaceState({ idx }, '', hash);
      else history.pushState({ idx: ++idx }, '', hash);
    } catch { location.hash = hash; return busy; }
    return schedule();
  },
  back() {
    const top = stack[stack.length - 1];
    if (top?.mod.onBack?.() === true) return;
    if (!top && page?.mod.onBack?.() === true) return;
    if (idx > 0) { history.back(); return; }
    if (top) {
      const below = stack[stack.length - 2];
      router.go(below ? below.key.replace(/\{.*$/, '') + '/' + (below.params.id || '') : (page?.name || 'inicio'), { replace: true });
      return;
    }
    if (page && page.name !== 'inicio' && page.name !== 'perfiles') { router.go('inicio', { replace: true }); return; }
    bus.emit('app:exit-request');
  },
  get page() { return page?.name; },
  get section() { return page?.params?.section; },
  get overlays() { return stack.map((e) => e.name); },
  isPlayerOpen() { return stack.some((e) => OVERLAYS[e.name].player); },
};

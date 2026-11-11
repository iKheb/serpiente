// =============================================================================
// Navegación espacial (mando de TV / teclado / gamepad) — compartido.
//
// Marcado:
//   .focusable                     elemento navegable (botón, tarjeta, tecla…)
//   data-nav-group                 contenedor con memoria de foco (p. ej. una fila)
//   data-nav-default               elemento preferido al entrar en el grupo/ámbito
//   data-nav-up|down|left|right    "none" bloquea esa dirección · selector CSS fuerza destino
//   data-nav-scroll="x|y|x-start|y-center"  contenedor desplazable que sigue al foco
//   data-nav-pad="48"              margen (px) al desplazar
//
// API:
//   nav.init()                      instala listeners
//   nav.focus(el, {scroll:true})    enfoca (añade .is-focus, emite 'nav:focus')
//   nav.current()                   elemento enfocado
//   nav.pushScope(root) / popScope(root)  ámbitos modales (overlays)
//   nav.intercept(fn) -> off        fn(action, ev) devuelve true si consume la acción
//                                   action ∈ up|down|left|right|enter|back|play|pause|playpause|
//                                            stop|ff|rw|chup|chdown|info|menu|digit0..digit9
//   nav.focusFirst(root?)           enfoca el elemento por defecto del ámbito
//
// Eventos DOM (burbujean) en el elemento: 'nav:focus', 'nav:blur'.
// Eventos bus: 'key:back', 'key:action' {action}.
// =============================================================================
import { bus } from './bus.js';
import { device } from './device.js';

const SEL = '.focusable';
let current = null;
const scopes = []; // { root, restore }
const interceptors = [];
let lastKeyAt = 0;

const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Up: 'up', Down: 'down', Left: 'left', Right: 'right',
  Enter: 'enter', ' ': null, // espacio solo en reproductor (vía interceptor)
  Escape: 'back', Backspace: 'back', GoBack: 'back', BrowserBack: 'back', XF86Back: 'back',
  MediaPlayPause: 'playpause', MediaPlay: 'play', MediaPause: 'pause', MediaStop: 'stop',
  MediaFastForward: 'ff', MediaRewind: 'rw', MediaTrackNext: 'ff', MediaTrackPrevious: 'rw',
  ChannelUp: 'chup', ChannelDown: 'chdown', PageUp: 'chup', PageDown: 'chdown',
  Info: 'info', ContextMenu: 'menu',
};
const KEYCODES = {
  37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter', 27: 'back', 8: 'back',
  10009: 'back',  // Samsung Tizen
  461: 'back',    // LG webOS
  166: 'back',    // Android TV / navegador
  179: 'playpause', 415: 'play', 19: 'pause', 413: 'stop', 417: 'ff', 412: 'rw',
  427: 'chup', 428: 'chdown', 33: 'chup', 34: 'chdown', 457: 'info', 18: null,
};

function actionFor(ev) {
  if (ev.key && ev.key in KEYMAP) return KEYMAP[ev.key];
  if (ev.keyCode in KEYCODES) return KEYCODES[ev.keyCode];
  if (/^[0-9]$/.test(ev.key)) return `digit${ev.key}`;
  return null;
}

function isTextInput(el) {
  return el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'submit'].includes(el.type)) || el.isContentEditable);
}

function scopeRoot() {
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i].root.isConnected) return scopes[i].root;
    scopes.splice(i, 1);
  }
  return document.body;
}

function visible(el) {
  if (!el.isConnected || el.disabled || el.closest('[aria-hidden="true"], .hidden, [inert]')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

function candidates(root = scopeRoot()) {
  return Array.from(root.querySelectorAll(SEL)).filter(visible);
}

function rectOf(el) {
  const r = el.getBoundingClientRect();
  return { l: r.left, r: r.right, t: r.top, b: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2, w: r.width, h: r.height };
}

function groupOf(el) { return el?.closest('[data-nav-group]') || null; }

function remembered(group) {
  const last = group.__navLast;
  if (last && last.isConnected && group.contains(last) && visible(last)) return last;
  const def = group.querySelector('[data-nav-default]');
  if (def && visible(def)) return def;
  return null;
}

function best(from, dir, list) {
  const a = rectOf(from);
  let win = null, winScore = Infinity;
  for (const el of list) {
    if (el === from) continue;
    const b = rectOf(el);
    let primary, secondary, overlap;
    if (dir === 'right') {
      if (b.cx <= a.cx + 1 || b.l < a.l + 2) continue;
      primary = Math.max(0, b.l - a.r); secondary = Math.abs(b.cy - a.cy);
      overlap = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    } else if (dir === 'left') {
      if (b.cx >= a.cx - 1 || b.r > a.r - 2) continue;
      primary = Math.max(0, a.l - b.r); secondary = Math.abs(b.cy - a.cy);
      overlap = Math.min(a.b, b.b) - Math.max(a.t, b.t);
    } else if (dir === 'down') {
      if (b.cy <= a.cy + 1 || b.t < a.t + 2) continue;
      primary = Math.max(0, b.t - a.b); secondary = Math.abs(b.cx - a.cx);
      overlap = Math.min(a.r, b.r) - Math.max(a.l, b.l);
    } else {
      if (b.cy >= a.cy - 1 || b.b > a.b - 2) continue;
      primary = Math.max(0, a.t - b.b); secondary = Math.abs(b.cx - a.cx);
      overlap = Math.min(a.r, b.r) - Math.max(a.l, b.l);
    }
    const horizontal = dir === 'left' || dir === 'right';
    // Bonificación por solapamiento en el eje perpendicular (misma fila/columna).
    const aligned = overlap > 0 ? 0 : 1;
    const score = primary + secondary * (horizontal ? 2.2 : 0.9) + aligned * (horizontal ? 400 : 60);
    if (score < winScore) { winScore = score; win = el; }
  }
  return win;
}

function move(dir) {
  const root = scopeRoot();
  if (!current || !current.isConnected || !root.contains(current) || !visible(current)) {
    return nav.focusFirst();
  }
  // Destino explícito
  const forced = current.getAttribute(`data-nav-${dir}`);
  if (forced === 'none') return false;
  if (forced) {
    const t = root.querySelector(forced);
    if (t) {
      const g = t.matches(SEL) ? null : t;
      const target = g ? (remembered(g) || g.querySelector(SEL)) : t;
      if (target) { nav.focus(target); return true; }
    }
  }
  let target = best(current, dir, candidates(root));
  if (!target) { bus.emit('nav:edge', { dir, from: current }); return false; }
  // Memoria de grupo: al entrar en otro grupo, ir al último elemento enfocado en él.
  const g1 = groupOf(current), g2 = groupOf(target);
  if (g2 && g2 !== g1) {
    const mem = remembered(g2);
    if (mem) target = mem;
  }
  nav.focus(target);
  return true;
}

// ---------------------------------------------------------------------------
// Desplazamiento que sigue al foco
function smoothScroll(el, prop, to) {
  to = Math.max(0, Math.round(to));
  if (Math.abs(el[prop] - to) < 1) return;
  const opts = prop === 'scrollLeft' ? { left: to } : { top: to };
  if (device.reducedMotion) { el[prop] = to; return; }
  try { el.scrollTo({ ...opts, behavior: 'smooth' }); } catch { el[prop] = to; }
}

function follow(el) {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const mode = node.getAttribute && node.getAttribute('data-nav-scroll');
    if (mode) {
      const pad = Number(node.getAttribute('data-nav-pad') || 48);
      const c = node.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (mode.startsWith('x')) {
        if (mode === 'x-start') smoothScroll(node, 'scrollLeft', node.scrollLeft + (r.left - c.left) - pad);
        else if (r.left < c.left + pad) smoothScroll(node, 'scrollLeft', node.scrollLeft - (c.left + pad - r.left));
        else if (r.right > c.right - pad) smoothScroll(node, 'scrollLeft', node.scrollLeft + (r.right - (c.right - pad)));
      } else {
        const topPad = Number(node.getAttribute('data-nav-pad-top') || pad);
        if (mode === 'y-center') smoothScroll(node, 'scrollTop', node.scrollTop + (r.top + r.height / 2) - (c.top + c.height / 2));
        else if (r.top < c.top + topPad) smoothScroll(node, 'scrollTop', node.scrollTop - (c.top + topPad - r.top));
        else if (r.bottom > c.bottom - pad) smoothScroll(node, 'scrollTop', node.scrollTop + (r.bottom - (c.bottom - pad)));
      }
    }
    node = node.parentElement;
  }
}

// ---------------------------------------------------------------------------
function onKey(ev) {
  const action = actionFor(ev);
  const active = document.activeElement;
  const typing = isTextInput(active);

  // En campos de texto: las flechas laterales/borrar pertenecen al campo.
  if (typing) {
    if (action === 'back' && ev.key === 'Backspace') return;
    if ((action === 'left' && active.selectionStart > 0) || (action === 'right' && active.selectionEnd < (active.value || '').length)) return;
    if (action === 'enter') return;
  }
  // Espacio también disponible para interceptores (reproductor)
  const act = action || (ev.key === ' ' ? 'space' : null);
  if (!act) return;

  if (['up', 'down', 'left', 'right', 'enter'].includes(act)) {
    document.documentElement.classList.add('kbd-nav');
  }
  lastKeyAt = performance.now();

  for (let i = interceptors.length - 1; i >= 0; i--) {
    try { if (interceptors[i](act, ev) === true) { ev.preventDefault(); return; } } catch (e) { console.error(e); }
  }

  switch (act) {
    case 'up': case 'down': case 'left': case 'right':
      ev.preventDefault();
      move(act);
      break;
    case 'enter':
      if (current && current.isConnected) {
        ev.preventDefault();
        current.classList.add('is-pressed');
        setTimeout(() => current && current.classList.remove('is-pressed'), 160);
        current.click();
      }
      break;
    case 'back':
      ev.preventDefault();
      bus.emit('key:back', { ev });
      break;
    case 'space':
      break;
    default:
      bus.emit('key:action', { action: act, ev });
  }
}

export const nav = {
  init() {
    window.addEventListener('keydown', onKey, true);
    // Ratón: el puntero también mueve el foco lógico (sin anillo visible)
    if (!device.isTV) {
      window.addEventListener('mousemove', () => {
        if (performance.now() - lastKeyAt > 300) document.documentElement.classList.remove('kbd-nav');
      }, { passive: true });
      document.addEventListener('pointerover', (e) => {
        const el = e.target.closest && e.target.closest(SEL);
        if (el && e.pointerType === 'mouse' && !document.documentElement.classList.contains('kbd-nav')) nav.focus(el, { scroll: false, silent: true });
      });
    }
    // Gamepad (consolas / mandos Bluetooth en TV)
    if ('getGamepads' in navigator) {
      let prev = {};
      const poll = () => {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = pads && Array.from(pads).find(Boolean);
        if (gp) {
          const b = (i) => gp.buttons[i]?.pressed;
          const state = { up: b(12) || gp.axes[1] < -0.6, down: b(13) || gp.axes[1] > 0.6, left: b(14) || gp.axes[0] < -0.6, right: b(15) || gp.axes[0] > 0.6, enter: b(0), back: b(1) };
          for (const k of Object.keys(state)) {
            if (state[k] && !prev[k]) onKey({ key: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', enter: 'Enter', back: 'Escape' }[k], preventDefault() {} });
          }
          prev = state;
        }
        requestAnimationFrame(poll);
      };
      window.addEventListener('gamepadconnected', () => requestAnimationFrame(poll), { once: true });
    }
  },

  current() { return current && current.isConnected ? current : null; },

  focus(el, { scroll = true, silent = false } = {}) {
    if (!el) return;
    if (current === el) { if (scroll) follow(el); return; }
    const prev = current;
    if (prev) {
      prev.classList.remove('is-focus');
      prev.dispatchEvent(new CustomEvent('nav:blur', { bubbles: true }));
    }
    current = el;
    el.classList.add('is-focus');
    const g = groupOf(el);
    if (g) g.__navLast = el;
    try { el.focus({ preventScroll: true }); } catch { /* */ }
    if (scroll) follow(el);
    el.dispatchEvent(new CustomEvent('nav:focus', { bubbles: true, detail: { silent } }));
    if (!silent) bus.emit('nav:focus', { el, prev });
  },

  focusFirst(root = scopeRoot()) {
    const list = candidates(root);
    if (!list.length) return false;
    const def = list.find((el) => el.hasAttribute('data-nav-default'));
    nav.focus(def || list[0]);
    return true;
  },

  pushScope(root, { focus = true } = {}) {
    scopes.push({ root, restore: current });
    if (focus) requestAnimationFrame(() => { if (!current || !root.contains(current)) nav.focusFirst(root); });
  },

  popScope(root) {
    const i = scopes.findIndex((s) => s.root === root);
    if (i < 0) return;
    const [s] = scopes.splice(i, 1);
    if (s.restore && s.restore.isConnected && visible(s.restore)) nav.focus(s.restore);
    else nav.focusFirst();
  },

  intercept(fn) {
    interceptors.push(fn);
    return () => { const i = interceptors.indexOf(fn); if (i >= 0) interceptors.splice(i, 1); };
  },

  /** Re-enfoca si el elemento actual desapareció (tras re-render) */
  refresh() {
    if (!current || !current.isConnected || !visible(current)) nav.focusFirst();
  },

  move,
};

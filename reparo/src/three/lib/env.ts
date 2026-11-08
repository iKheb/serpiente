/**
 * Utilidades de entorno para las escenas 3D: detección de WebGL, tema,
 * movimiento reducido, DPR y planificación diferida (no bloquear el montaje).
 */
import { useSyncExternalStore } from 'react';

export type ThemeName = 'dark' | 'light';

/* ------------------------------------------------------------------ WebGL */

let webglCache: boolean | null = null;

/** ¿El navegador puede crear un contexto WebGL? (se cachea; libera el contexto de prueba). */
export function isWebGLAvailable(): boolean {
  if (webglCache !== null) return webglCache;
  if (typeof document === 'undefined') return (webglCache = false);
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    webglCache = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

/** Marca WebGL como no disponible (p. ej. si crear el renderer lanzó una excepción). */
export function markWebGLUnavailable() {
  webglCache = false;
}

/* --------------------------------------------------------------- Dispositivo */

export function isCoarsePointer(): boolean {
  if (typeof matchMedia === 'undefined') return false;
  return matchMedia('(pointer: coarse)').matches;
}

/** DPR máximo: 2 en escritorio, 1.5 en móvil / pantallas pequeñas. */
export function maxPixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  const mobile = isCoarsePointer() || window.innerWidth < 768;
  return Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
}

/* -------------------------------------------------------------------- Tema */

export function readTheme(): ThemeName {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

const themeListeners = new Set<() => void>();
let themeObserver: MutationObserver | null = null;

function subscribeTheme(cb: () => void) {
  themeListeners.add(cb);
  if (!themeObserver && typeof MutationObserver !== 'undefined') {
    themeObserver = new MutationObserver(() => themeListeners.forEach((l) => l()));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  return () => {
    themeListeners.delete(cb);
    if (themeListeners.size === 0 && themeObserver) {
      themeObserver.disconnect();
      themeObserver = null;
    }
  };
}

/** Tema actual leído de `document.documentElement.dataset.theme` (reactivo). */
export function useDocumentTheme(): ThemeName {
  return useSyncExternalStore(subscribeTheme, readTheme, () => 'dark');
}

/* ------------------------------------------------------ Movimiento reducido */

const RM_QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  if (typeof matchMedia === 'undefined') return false;
  return matchMedia(RM_QUERY).matches;
}

function subscribeReducedMotion(cb: () => void) {
  if (typeof matchMedia === 'undefined') return () => {};
  const mq = matchMedia(RM_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
}

/* ------------------------------------------------------------ Planificación */

/**
 * Ejecuta `cb` después del siguiente frame y cuando el hilo esté libre
 * (requestIdleCallback con tope), para no bloquear el montaje de React.
 * Devuelve una función que cancela.
 */
export function scheduleIdle(cb: () => void, timeout = 220): () => void {
  let cancelled = false;
  let idleId = 0;
  let timeoutId = 0;
  const raf = requestAnimationFrame(() => {
    if (cancelled) return;
    const w = window as Window & {
      requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number;
    };
    if (w.requestIdleCallback) {
      idleId = w.requestIdleCallback(() => !cancelled && cb(), { timeout });
    } else {
      timeoutId = window.setTimeout(() => !cancelled && cb(), 16);
    }
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    const w = window as Window & { cancelIdleCallback?: (id: number) => void };
    if (idleId && w.cancelIdleCallback) w.cancelIdleCallback(idleId);
    if (timeoutId) clearTimeout(timeoutId);
  };
}

/** Espera a que la fuente de la app esté lista (sin bloquear si no existe). */
export function whenFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const loads = [
    document.fonts.load('600 40px "Geist Variable"'),
    document.fonts.load('400 40px "Geist Variable"'),
    document.fonts.load('500 20px "Geist Mono Variable"'),
  ];
  return Promise.race([
    Promise.all(loads).then(() => undefined),
    new Promise<void>((r) => setTimeout(r, 1500)),
  ]).catch(() => undefined);
}

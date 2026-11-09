import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { isTypingTarget } from './utils';

export const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/* ------------------------------ Media queries ----------------------------- */

const mqCache = new Map<string, MediaQueryList>();
function getMql(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  let m = mqCache.get(query);
  if (!m) {
    m = window.matchMedia(query);
    mqCache.set(query, m);
  }
  return m;
}

/** Suscripción reactiva a una media query. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = getMql(query);
      if (!m) return () => {};
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => getMql(query)?.matches ?? false,
    () => false,
  );
}

/** Layout móvil de la app (< 900 px): barra inferior, hojas, header compacto. */
export const MOBILE_QUERY = '(max-width: 899px)';
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}

/** true si el usuario pidió reducir el movimiento. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/* ---------------------------- Reloj compartido ---------------------------- */

type Tick = { now: number; listeners: Set<() => void>; timer: ReturnType<typeof setTimeout> | null };
const ticks = new Map<number, Tick>();

function subscribeTick(interval: number, cb: () => void) {
  let t = ticks.get(interval);
  if (!t) {
    t = { now: Date.now(), listeners: new Set(), timer: null };
    ticks.set(interval, t);
  }
  const tick = t;
  tick.listeners.add(cb);
  if (!tick.timer) {
    const schedule = () => {
      // Alinea al siguiente múltiplo del intervalo (el reloj cambia justo al cambiar el minuto).
      const now = Date.now();
      const delay = interval - (now % interval) + 5;
      tick.timer = setTimeout(() => {
        tick.now = Date.now();
        tick.listeners.forEach((l) => l());
        schedule();
      }, delay);
    };
    tick.now = Date.now();
    schedule();
  }
  return () => {
    tick.listeners.delete(cb);
    if (tick.listeners.size === 0 && tick.timer) {
      clearTimeout(tick.timer);
      tick.timer = null;
    }
  };
}

/**
 * Hora actual que se actualiza cada `interval` ms (alineada al reloj).
 * Todos los componentes con el mismo intervalo comparten un solo temporizador.
 */
export function useNow(interval = 60_000): number {
  return useSyncExternalStore(
    (cb) => subscribeTick(interval, cb),
    () => ticks.get(interval)?.now ?? Date.now(),
    () => Date.now(),
  );
}

/* --------------------------------- Atajos -------------------------------- */

export interface HotkeyOptions {
  /** Permite el atajo aunque el foco esté en un campo de texto. */
  allowInInputs?: boolean;
  /** Requiere ⌘ (Mac) o Ctrl (resto). */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  enabled?: boolean;
  preventDefault?: boolean;
}

/**
 * Atajo global de teclado. `key` se compara sin distinguir mayúsculas
 * (p. ej. 'k', '/', 'Escape'). No se dispara mientras se escribe en inputs
 * salvo `allowInInputs`, ni con modificadores que no se pidieron.
 */
export function useHotkey(key: string, handler: (e: KeyboardEvent) => void, opts: HotkeyOptions = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  const { allowInInputs = false, mod = false, shift, alt = false, enabled = true, preventDefault = true } = opts;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (e.key.toLowerCase() !== key.toLowerCase()) return;
      const hasMod = e.metaKey || e.ctrlKey;
      if (mod !== hasMod) return;
      if (alt !== e.altKey) return;
      if (shift !== undefined && shift !== e.shiftKey) return;
      if (!allowInInputs && isTypingTarget(e.target)) return;
      if (!mod && document.querySelector('[data-ui-modal="true"]') && !allowInInputs) return;
      if (preventDefault) e.preventDefault();
      ref.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, allowInInputs, mod, shift, alt, enabled, preventDefault]);
}

/* ------------------------------ Estado mixto ------------------------------ */

/** Estado controlado/no controlado. */
export function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (v: T) => void) {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? (value as T) : inner;
  const set = useCallback(
    (v: T) => {
      if (!controlled) setInner(v);
      onChange?.(v);
    },
    [controlled, onChange],
  );
  return [current, set] as const;
}

/* --------------------------- Bloqueo de scroll ---------------------------- */

let lockCount = 0;
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lockCount++;
    const root = document.documentElement;
    if (lockCount === 1) {
      // Compensa el ancho de la barra de desplazamiento para que nada salte.
      const comp = window.innerWidth - root.clientWidth;
      root.style.setProperty('--scrollbar-comp', `${Math.max(0, comp)}px`);
    }
    root.setAttribute('data-scroll-locked', '');
    return () => {
      lockCount--;
      if (lockCount <= 0) {
        lockCount = 0;
        document.documentElement.removeAttribute('data-scroll-locked');
        document.documentElement.style.removeProperty('--scrollbar-comp');
      }
    };
  }, [active]);
}

/* ------------------------------ localStorage ----------------------------- */

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible (modo privado): se ignora */
  }
}

/** Estado persistido por usuario en localStorage (con try/catch). */
export function useLocalState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => readLocal(key, initial));
  const set = useCallback(
    (next: T) => {
      setV(next);
      writeLocal(key, next);
    },
    [key],
  );
  return [v, set] as const;
}

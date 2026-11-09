/* Hooks compartidos por los gráficos: medición, movimiento reducido, tween e ids. */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export interface Size {
  width: number;
  height: number;
}

/**
 * Mide el contenedor con ResizeObserver para que los gráficos sean fluidos.
 * Devuelve un ref callback y el tamaño (0×0 hasta la primera medición).
 */
export function useMeasure<T extends Element = HTMLDivElement>(): [(node: T | null) => void, Size] {
  const [node, setNode] = useState<T | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const ref = useCallback((n: T | null) => setNode(n), []);

  useIsoLayoutEffect(() => {
    if (!node) return;
    const read = (w: number, h: number) =>
      setSize((prev) => {
        const width = Math.round(w);
        const height = Math.round(h);
        return prev.width === width && prev.height === height ? prev : { width, height };
      });
    const rect = node.getBoundingClientRect();
    read(rect.width, rect.height);
    if (typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => read(box.width, box.height));
    });
    ro.observe(node);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [node]);

  return [ref, size];
}

const RM_QUERY = '(prefers-reduced-motion: reduce)';

/** `true` si el sistema pide reducir el movimiento. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(RM_QUERY).matches : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(RM_QUERY);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Curva equivalente a --ease-out (expo out suavizada). */
export const easeOut = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Interpola suavemente un arreglo numérico cuando cambia `target`.
 * Si la longitud cambia (otra forma de datos) salta directo al nuevo valor.
 * `target` debe ser estable (useMemo).
 */
export function useTweenedArray(target: readonly number[], duration = 520, enabled = true): readonly number[] {
  const [current, setCurrent] = useState<readonly number[]>(target);
  const currentRef = useRef<readonly number[]>(target);

  useEffect(() => {
    const from = currentRef.current;
    if (!enabled || from.length !== target.length) {
      currentRef.current = target;
      setCurrent(target);
      return;
    }
    let same = true;
    for (let i = 0; i < target.length; i++) {
      if (from[i] !== target[i]) {
        same = false;
        break;
      }
    }
    if (same) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const e = easeOut(t);
      const next = target.map((v, i) => from[i] + (v - from[i]) * e);
      currentRef.current = next;
      setCurrent(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Red de seguridad: si no llegan frames (pestaña oculta, visor embebido o
    // equipo saturado) el gráfico nunca debe quedar a medio camino.
    const settle = window.setTimeout(() => {
      cancelAnimationFrame(raf);
      currentRef.current = target;
      setCurrent(target);
    }, duration + 250);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
    };
  }, [target, duration, enabled]);

  return current.length === target.length ? current : target;
}

/** Anima un número (contador) desde 0 al montar y luego entre valores. */
export function useCountUp(target: number, duration = 900, enabled = true): number {
  const [ready, setReady] = useState(!enabled);
  useEffect(() => {
    if (ready) return;
    const r = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(r);
  }, [ready]);
  const goal = useMemo(() => [ready ? target : 0], [ready, target]);
  return useTweenedArray(goal, duration, enabled)[0];
}

/** id seguro para usar en `url(#id)` dentro de SVG. */
export function useSvgId(prefix: string): string {
  const raw = useId();
  return `${prefix}-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

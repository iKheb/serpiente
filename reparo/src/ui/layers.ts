/**
 * Pila de capas flotantes (diálogos, hojas, popovers, menús).
 * Sólo la capa superior reacciona a Escape y a los clics fuera, así un
 * Select abierto dentro de un Sheet se cierra sin cerrar el Sheet.
 */
import { useEffect, useRef, type RefObject } from 'react';

interface Layer {
  id: number;
  onEscape?: () => void;
  onOutside?: (e: PointerEvent) => void;
  /** Elementos que cuentan como "dentro" de la capa. */
  refs: RefObject<HTMLElement | null>[];
}

const stack: Layer[] = [];
let seq = 0;
let installed = false;

function install() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Campos que consumen Escape (p. ej. un buscador con texto lo limpia primero).
      if ((e.target as Element | null)?.closest?.('[data-ui-escape-local="true"]')) return;
      const top = stack[stack.length - 1];
      if (top?.onEscape) {
        e.preventDefault();
        e.stopPropagation();
        top.onEscape();
      }
    },
    true,
  );
  document.addEventListener(
    'pointerdown',
    (e) => {
      const top = stack[stack.length - 1];
      if (!top?.onOutside) return;
      const target = e.target as Node | null;
      if (!target) return;
      const inside = top.refs.some((r) => r.current && r.current.contains(target));
      if (inside) return;
      // Un clic dentro de una capa superior no registrada (p. ej. un toast) no cierra.
      if ((target as Element).closest?.('[data-ui-ignore-outside]')) return;
      top.onOutside(e);
    },
    true,
  );
}

/** Registra una capa mientras `active` sea true. */
export function useLayer(
  active: boolean,
  opts: { onEscape?: () => void; onOutside?: (e: PointerEvent) => void; refs?: RefObject<HTMLElement | null>[] },
) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  useEffect(() => {
    if (!active) return;
    install();
    const layer: Layer = {
      id: ++seq,
      onEscape: () => optsRef.current.onEscape?.(),
      onOutside: (e) => optsRef.current.onOutside?.(e),
      refs: [],
    };
    // refs se leen en vivo para soportar portales montados después.
    Object.defineProperty(layer, 'refs', { get: () => optsRef.current.refs ?? [] });
    stack.push(layer);
    return () => {
      const i = stack.indexOf(layer);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [active]);
}

/** true si hay alguna capa abierta (los atajos globales lo consultan). */
export function hasOpenLayer(): boolean {
  return stack.length > 0;
}

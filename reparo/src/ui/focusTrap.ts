import { useEffect, type RefObject } from 'react';
import { getFocusable } from './utils';

/**
 * Atrapa el foco dentro de `ref` mientras `active` sea true. Enfoca el primer
 * elemento con [data-autofocus] (o el primer enfocable, o el contenedor) y
 * devuelve el foco al elemento previo al desactivarse.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const root = ref.current;
      if (!root || root.contains(document.activeElement)) return;
      const auto = root.querySelector<HTMLElement>('[data-autofocus]');
      const target = auto ?? root;
      target.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const root = ref.current;
      if (!root) return;
      // Sólo si el foco está dentro (o en el body); los popovers en portal gestionan el suyo.
      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl && activeEl !== document.body && !root.contains(activeEl)) return;
      const items = getFocusable(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (activeEl === first || activeEl === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      if (previous && previous.isConnected && typeof previous.focus === 'function') {
        requestAnimationFrame(() => previous.focus({ preventScroll: true }));
      }
    };
  }, [active, ref]);
}

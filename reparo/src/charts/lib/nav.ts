/* Navegación de gráficos: puntero (ratón/táctil con arrastre) y teclado (flechas). */
import { useCallback, useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react';

export interface NavState {
  index: number;
  /** Posición del puntero relativa a la capa (sólo si `trackPointer`). */
  x: number;
  y: number;
  source: 'pointer' | 'keyboard';
}

interface Options {
  count: number;
  /** Índice más cercano a una x (px relativos a la capa). */
  indexAt: (x: number, y: number) => number;
  /** Actualiza el estado en cada movimiento (para tooltips que siguen al puntero). */
  trackPointer?: boolean;
  onChange?: (index: number | null) => void;
}

export function useChartNav({ count, indexAt, trackPointer = false, onChange }: Options) {
  const [state, setState] = useState<NavState | null>(null);
  const touchTimer = useRef<number | undefined>(undefined);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const index = state?.index ?? null;
  useEffect(() => {
    onChangeRef.current?.(index);
  }, [index]);

  // Si cambian los datos y el índice queda fuera de rango, se limpia.
  useEffect(() => {
    if (state && state.index >= count) setState(null);
  }, [count, state]);

  useEffect(() => () => window.clearTimeout(touchTimer.current), []);

  const fromPointer = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (!count) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const i = Math.max(0, Math.min(count - 1, indexAt(x, y)));
      setState((prev) => {
        if (!trackPointer && prev && prev.index === i && prev.source === 'pointer') return prev;
        return { index: i, x, y, source: 'pointer' };
      });
    },
    [count, indexAt, trackPointer],
  );

  const clear = useCallback(() => setState(null), []);

  const handlers = {
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      window.clearTimeout(touchTimer.current);
      fromPointer(e);
    },
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      window.clearTimeout(touchTimer.current);
      fromPointer(e);
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'touch') clear();
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'touch') {
        window.clearTimeout(touchTimer.current);
        touchTimer.current = window.setTimeout(clear, 2400);
      }
    },
    onPointerCancel: () => {
      window.clearTimeout(touchTimer.current);
      touchTimer.current = window.setTimeout(clear, 600);
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (!count) return;
      const cur = state?.index ?? -1;
      let next: number | null = null;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          next = cur < 0 ? 0 : Math.min(count - 1, cur + 1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          next = cur < 0 ? count - 1 : Math.max(0, cur - 1);
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = count - 1;
          break;
        case 'PageUp':
          next = Math.max(0, (cur < 0 ? count - 1 : cur) - 7);
          break;
        case 'PageDown':
          next = Math.min(count - 1, (cur < 0 ? 0 : cur) + 7);
          break;
        case 'Escape':
          if (state) {
            e.preventDefault();
            clear();
          }
          return;
        default:
          return;
      }
      e.preventDefault();
      setState({ index: next, x: 0, y: 0, source: 'keyboard' });
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      let visible = false;
      try {
        visible = e.currentTarget.matches(':focus-visible');
      } catch {
        visible = false;
      }
      if (visible && count) setState((prev) => prev ?? { index: count - 1, x: 0, y: 0, source: 'keyboard' });
    },
    onBlur: () => clear(),
  };

  return { state, setState, clear, handlers };
}

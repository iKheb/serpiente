/**
 * Posicionamiento de elementos flotantes (popover, menú, tooltip, listbox)
 * relativo a un ancla, con volteo y ajuste al viewport. Sin dependencias.
 */
import { useCallback, useState, type CSSProperties, type RefObject } from 'react';
import { useIsoLayoutEffect } from './hooks';

export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Align = 'start' | 'center' | 'end';

export interface FloatingOptions {
  open: boolean;
  side?: Side;
  align?: Align;
  offset?: number;
  /** Margen mínimo respecto a los bordes de la ventana. */
  padding?: number;
  /** Iguala el ancho del flotante al del ancla (listbox de Select/Combobox). */
  matchWidth?: boolean;
}

export interface FloatingResult {
  style: CSSProperties;
  side: Side;
  /** Origen de transformación para animar desde el ancla. */
  origin: string;
  update: () => void;
}

export function useFloating(
  anchorRef: RefObject<HTMLElement | null>,
  floatingRef: RefObject<HTMLElement | null>,
  { open, side = 'bottom', align = 'start', offset = 6, padding = 8, matchWidth = false }: FloatingOptions,
): FloatingResult {
  const [state, setState] = useState<{ top: number; left: number; side: Side; width?: number; maxHeight?: number; ready: boolean }>({
    top: -9999,
    left: -9999,
    side,
    ready: false,
  });

  const update = useCallback(() => {
    const a = anchorRef.current;
    const f = floatingRef.current;
    if (!a || !f) return;
    const ar = a.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fw = matchWidth ? Math.max(ar.width, f.offsetWidth) : f.offsetWidth;
    const fh = f.offsetHeight;

    let s: Side = side;
    const spaceBelow = vh - ar.bottom - offset - padding;
    const spaceAbove = ar.top - offset - padding;
    const spaceRight = vw - ar.right - offset - padding;
    const spaceLeft = ar.left - offset - padding;
    if (s === 'bottom' && fh > spaceBelow && spaceAbove > spaceBelow) s = 'top';
    else if (s === 'top' && fh > spaceAbove && spaceBelow > spaceAbove) s = 'bottom';
    else if (s === 'right' && fw > spaceRight && spaceLeft > spaceRight) s = 'left';
    else if (s === 'left' && fw > spaceLeft && spaceRight > spaceLeft) s = 'right';

    let top = 0;
    let left = 0;
    if (s === 'bottom' || s === 'top') {
      top = s === 'bottom' ? ar.bottom + offset : ar.top - offset - fh;
      if (align === 'start') left = ar.left;
      else if (align === 'end') left = ar.right - fw;
      else left = ar.left + ar.width / 2 - fw / 2;
    } else {
      left = s === 'right' ? ar.right + offset : ar.left - offset - fw;
      if (align === 'start') top = ar.top;
      else if (align === 'end') top = ar.bottom - fh;
      else top = ar.top + ar.height / 2 - fh / 2;
    }
    left = Math.min(Math.max(padding, left), Math.max(padding, vw - fw - padding));
    if (s === 'left' || s === 'right') top = Math.min(Math.max(padding, top), Math.max(padding, vh - fh - padding));
    else top = Math.max(padding, top);

    const maxHeight = s === 'bottom' ? vh - top - padding : s === 'top' ? ar.top - offset - padding : undefined;

    setState((prev) => {
      const next = { top, left, side: s, width: matchWidth ? ar.width : undefined, maxHeight, ready: true };
      if (
        prev.top === next.top &&
        prev.left === next.left &&
        prev.side === next.side &&
        prev.width === next.width &&
        prev.maxHeight === next.maxHeight &&
        prev.ready
      )
        return prev;
      return next;
    });
  }, [anchorRef, floatingRef, side, align, offset, padding, matchWidth]);

  useIsoLayoutEffect(() => {
    if (!open) {
      setState((p) => (p.ready ? { ...p, ready: false } : p));
      return;
    }
    update();
    const raf = requestAnimationFrame(update);
    const onScroll = () => update();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => update());
      if (anchorRef.current) ro.observe(anchorRef.current);
      if (floatingRef.current) ro.observe(floatingRef.current);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      ro?.disconnect();
    };
  }, [open, update]);

  const origin =
    state.side === 'bottom'
      ? `${align === 'end' ? 'right' : align === 'center' ? 'center' : 'left'} top`
      : state.side === 'top'
        ? `${align === 'end' ? 'right' : align === 'center' ? 'center' : 'left'} bottom`
        : state.side === 'right'
          ? 'left center'
          : 'right center';

  return {
    style: {
      position: 'fixed',
      top: state.top,
      left: state.left,
      minWidth: matchWidth ? state.width : undefined,
      maxHeight: state.maxHeight,
      visibility: state.ready ? 'visible' : 'hidden',
    },
    side: state.side,
    origin,
    update,
  };
}

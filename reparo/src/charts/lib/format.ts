/* Formateadores por defecto (las páginas pasan los suyos por props). */
import type { ValueFormatter } from './types';

const plain = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

export const defaultFormatValue: ValueFormatter = (n) => plain.format(n);

/** 12450 → "12.4 k", 1250000 → "1.3 M". */
export const defaultFormatCompact: ValueFormatter = (n) => compact(n);

export function compact(n: number, prefix = ''): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const trim = (v: number) => {
    const s = v.toFixed(v >= 100 ? 0 : 1);
    return s.endsWith('.0') ? s.slice(0, -2) : s;
  };
  if (abs >= 1e6) return `${sign}${prefix}${trim(abs / 1e6)} M`;
  if (abs >= 1e3) return `${sign}${prefix}${trim(abs / 1e3)} k`;
  return `${sign}${prefix}${plain.format(abs)}`;
}

const pct = new Intl.NumberFormat('es-MX', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatPercent = (ratio: number) => pct.format(ratio);

/* ---- Medición de texto para evitar solapamientos ---- */
let ctx: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();

export function measureText(text: string, font = '500 11px "Geist Variable", system-ui, sans-serif'): number {
  const key = font + '|' + text;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (ctx === undefined) {
    try {
      ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    } catch {
      ctx = null;
    }
  }
  let w: number;
  if (ctx) {
    ctx.font = font;
    w = ctx.measureText(text).width;
  } else {
    w = text.length * 6.4;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, w);
  return w;
}

export function numberAt(d: unknown, key: string): number {
  const v = (d as Record<string, unknown>)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function labelAt<T>(d: T, i: number, xKey?: string, getLabel?: (d: T, i: number) => string): string {
  if (getLabel) return getLabel(d, i);
  const v = (d as Record<string, unknown>)[xKey ?? 'label'];
  return v == null ? String(i + 1) : String(v);
}

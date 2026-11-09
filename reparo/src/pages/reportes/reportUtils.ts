/* Utilidades locales de la página de Reportes: CSV del período, etiquetas y modo impresión. */
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { currencyFractionDigits, dayKey, getCachedSettings, type Period, type SeriesPoint } from '@/data';

/** "sábado 7 de nov 2026" */
export function longDayLabel(ts: number): string {
  return format(new Date(ts), "EEEE d 'de' MMM yyyy", { locale: es });
}

/** Etiqueta corta para el eje de la tendencia: "2 nov" (semana) / "nov" o "ene 26" (mes). */
export function trendLabel(p: Period): string {
  const d = new Date(p.start);
  if (p.kind === 'week') return format(d, 'd MMM', { locale: es });
  return d.getMonth() === 0 ? format(d, 'MMM yy', { locale: es }) : format(d, 'MMM', { locale: es });
}

/** Rango legible del período: "2 nov 2026 – 8 nov 2026". */
export function rangeLabel(p: Period): string {
  const f = (ts: number) => format(new Date(ts), 'd MMM yyyy', { locale: es });
  return `${f(p.start)} – ${f(p.end - 1)}`;
}

/** Centavos → número plano para hojas de cálculo ("1250.50"). */
function plain(cents: number): string {
  const digits = currencyFractionDigits(getCachedSettings().currency);
  return (cents / 100).toFixed(digits);
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV del período (UTF-8 con BOM, separador ","): día, cobrado, gastado, ganancia + fila de total. */
export function buildPeriodCsv(period: Period, points: readonly SeriesPoint[]): Blob {
  const currency = getCachedSettings().currency;
  const rows: string[][] = [[`Día`, `Cobrado (${currency})`, `Gastado (${currency})`, `Ganancia (${currency})`, 'Servicios']];
  let c = 0;
  let g = 0;
  let s = 0;
  for (const p of points) {
    rows.push([dayKey(p.start), plain(p.cobradoCents), plain(p.gastadoCents), plain(p.gananciaCents), String(p.servicios)]);
    c += p.cobradoCents;
    g += p.gastadoCents;
    s += p.servicios;
  }
  rows.push(['Total', plain(c), plain(g), plain(c - g), String(s)]);
  const body = [`# ${period.label}`, ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n');
  return new Blob(['﻿' + body + '\r\n'], { type: 'text/csv;charset=utf-8' });
}

export function csvFilename(period: Period): string {
  return `reporte-${period.kind === 'week' ? 'semana' : 'mes'}-${dayKey(period.start)}.csv`;
}

/**
 * Prepara la página para imprimir: tema claro y gráficos SVG escalables (viewBox)
 * para que se ajusten al ancho del papel. Devuelve la función que lo revierte.
 */
export function enterPrintMode(root: HTMLElement | null): () => void {
  const html = document.documentElement;
  const prevTheme = html.dataset.theme;
  html.dataset.theme = 'light';
  const touched: SVGSVGElement[] = [];
  root?.querySelectorAll<SVGSVGElement>('[data-print-fit] svg').forEach((svg) => {
    if (svg.hasAttribute('viewBox')) return;
    const w = Number(svg.getAttribute('width'));
    const h = Number(svg.getAttribute('height'));
    if (!w || !h) return;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    svg.dataset.printFit = '1';
    touched.push(svg);
  });
  return () => {
    if (prevTheme) html.dataset.theme = prevTheme;
    else delete html.dataset.theme;
    touched.forEach((svg) => {
      svg.removeAttribute('viewBox');
      svg.removeAttribute('preserveAspectRatio');
      delete svg.dataset.printFit;
    });
  };
}

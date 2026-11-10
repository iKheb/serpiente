/* Piezas compartidas de los gráficos cartesianos (área y barras). */
import { useCallback, useState } from 'react';
import s from '../Chart.module.css';
import { measureText } from './format';
import type { ChartSeries, ReferenceLine, ValueFormatter } from './types';

export const AXIS_FONT = '500 12px "Geist Variable", ui-sans-serif, system-ui, sans-serif';

/** Estado de series ocultas desde la leyenda (nunca permite ocultarlas todas). */
export function useSeriesToggle(all: readonly ChartSeries[]) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback(
    (key: string) =>
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        if (next.size >= all.length) return prev;
        return next;
      }),
    [all.length],
  );
  return [hidden, toggle] as const;
}

export interface XLabel {
  index: number;
  x: number;
  text: string;
}

/**
 * Etiquetas del eje X sin solapamientos: adelgaza según el ancho disponible,
 * conserva siempre la última y evita que se salgan del SVG.
 */
export function computeXLabels(labels: readonly string[], xs: readonly number[], width: number, gap = 16): XLabel[] {
  const n = labels.length;
  if (!n || !width) return [];
  const widths = labels.map((l) => measureText(l, AXIS_FONT));
  const maxW = Math.max(...widths);
  const px = n > 1 ? Math.abs(xs[n - 1] - xs[0]) / (n - 1) : width;
  const step = Math.max(1, Math.ceil((maxW + gap) / Math.max(1, px)));
  const picked: XLabel[] = [];
  for (let i = n - 1; i >= 0; i -= step) {
    const w = widths[i];
    const x = Math.min(width - w / 2 - 1, Math.max(w / 2 + 1, xs[i]));
    picked.push({ index: i, x, text: labels[i] });
  }
  // Pasada de colisiones (derecha → izquierda); la última siempre se queda.
  const out: XLabel[] = [];
  let leftEdge = Infinity;
  for (const l of picked) {
    const w = widths[l.index];
    if (l.x + w / 2 <= leftEdge - 8) {
      out.push(l);
      leftEdge = l.x - w / 2;
    }
  }
  return out.reverse();
}

export interface AxesProps {
  width: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  ticks: readonly number[];
  y: (v: number) => number;
  formatAxisValue: ValueFormatter;
  xLabels: readonly XLabel[];
  showZero: boolean;
  activeIndex?: number | null;
}

const crisp = (v: number) => Math.round(v) + 0.5;

/** Cuadrícula horizontal tenue + etiquetas de ejes + línea base del cero. */
export function Axes({ left, right, top, bottom, ticks, y, formatAxisValue, xLabels, showZero }: AxesProps) {
  return (
    <g>
      <g>
        {ticks.map((t) => {
          const yy = y(t);
          if (yy < top - 1 || yy > bottom + 1) return null;
          return <line key={'g' + t} className={s.gridLine} x1={left} x2={right} y1={crisp(yy)} y2={crisp(yy)} style={t === 0 ? { opacity: 0 } : undefined} />;
        })}
      </g>
      <g>
        {ticks.map((t) => {
          const yy = y(t);
          if (yy < top - 6 || yy > bottom + 6) return null;
          return (
            <text key={'t' + t} className={s.axisText} x={left - 10} y={yy} dy="0.34em" textAnchor="end">
              {formatAxisValue(t)}
            </text>
          );
        })}
      </g>
      {showZero && <line className={s.zeroLine} x1={left} x2={right} y1={crisp(y(0))} y2={crisp(y(0))} />}
      <g>
        {xLabels.map((l) => (
          <text key={'x' + l.index} className={s.axisText} x={l.x} y={bottom + 19} textAnchor="middle">
            {l.text}
          </text>
        ))}
      </g>
    </g>
  );
}

/** Ancho del eje Y según la etiqueta más larga. */
export function yAxisWidth(ticks: readonly number[], fmt: ValueFormatter): number {
  let w = 0;
  for (const t of ticks) w = Math.max(w, measureText(fmt(t), AXIS_FONT));
  return Math.ceil(w) + 16;
}

export function RefLines({
  lines,
  y,
  left,
  right,
  top,
  formatAxisValue,
  part,
}: {
  lines: readonly ReferenceLine[];
  y: (v: number) => number;
  left: number;
  right: number;
  top: number;
  formatAxisValue: ValueFormatter;
  /** `line` se dibuja bajo las series; `label` encima de todo. */
  part: 'line' | 'label';
}) {
  return (
    <g>
      {lines.map((r, i) => {
        const yy = crisp(y(r.value));
        const color = r.color ?? 'var(--text-3)';
        const text = r.label ? `${r.label} · ${formatAxisValue(r.value)}` : formatAxisValue(r.value);
        const tw = measureText(text, AXIS_FONT) + 14;
        const ph = 18;
        const above = yy - ph - 4 >= top - 6;
        const py = above ? yy - ph - 4 : yy + 4;
        const px = right - tw;
        return (
          <g key={i}>
            {part === 'line' ? (
              <line className={s.refLine} x1={left} x2={right} y1={yy} y2={yy} style={{ stroke: color }} />
            ) : (
              <>
                <rect className={s.refPill} x={px} y={py} width={tw} height={ph} rx={6} />
                <circle cx={px + 9} cy={py + ph / 2} r={2.5} style={{ fill: color }} />
                <text className={s.refText} x={px + 15} y={py + ph / 2} dy="0.34em">
                  {text}
                </text>
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Resumen textual para `aria-label`. */
export function describeSeries(
  series: readonly ChartSeries[],
  values: readonly (readonly number[])[],
  labels: readonly string[],
  fmt: ValueFormatter,
): string {
  const n = labels.length;
  if (!n) return 'Sin datos.';
  const parts = series.map((sr, si) => {
    const v = values[si] ?? [];
    let max = -Infinity;
    let maxI = 0;
    let sum = 0;
    v.forEach((x, i) => {
      sum += x;
      if (x > max) {
        max = x;
        maxI = i;
      }
    });
    return `${sr.label}: total ${fmt(sum)}, máximo ${fmt(max)} (${labels[maxI]}), último ${fmt(v[n - 1] ?? 0)}`;
  });
  return `${n} ${n === 1 ? 'periodo' : 'periodos'}, de ${labels[0]} a ${labels[n - 1]}. ${parts.join('. ')}.`;
}

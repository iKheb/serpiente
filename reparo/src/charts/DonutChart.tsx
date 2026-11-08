import { useMemo, type ReactNode } from 'react';
import cs from './Chart.module.css';
import s from './DonutChart.module.css';
import { SrTable } from './SrTable';
import { useMeasure, useReducedMotion, useSvgId, useTweenedArray } from './lib/hooks';
import { donutSlicePath } from './lib/paths';
import { defaultFormatValue, formatPercent as defaultFormatPercent } from './lib/format';
import { useChartNav } from './lib/nav';
import type { ValueFormatter } from './lib/types';

export interface DonutDatum {
  key: string;
  label: string;
  value: number;
  /** Token de color: `var(--chart-1)`. */
  color: string;
}

export interface DonutCenterContext {
  /** Segmento activo (hover/teclado) o `null`. */
  active: DonutDatum | null;
  total: number;
  /** Proporción 0–1 del segmento activo. */
  share: number | null;
}

export interface DonutChartProps {
  data: readonly DonutDatum[];
  /** Diámetro en px. Por defecto 196. */
  size?: number;
  /** Grosor del anillo. Por defecto 13 % del diámetro. */
  thickness?: number;
  /** Separación constante entre segmentos (px). Por defecto 3. */
  gap?: number;
  /** Radio de las esquinas suavizadas. Por defecto 4. */
  cornerRadius?: number;
  formatValue?: ValueFormatter;
  formatPercent?: (ratio: number) => string;
  /** Etiqueta del centro cuando no hay segmento activo. Por defecto "Total". */
  centerLabel?: string;
  /** Contenido del centro personalizado. */
  center?: (ctx: DonutCenterContext) => ReactNode;
  /** Leyenda integrada: `auto` (a la derecha si cabe, si no debajo), `right`, `bottom` o `none`. */
  legend?: 'auto' | 'right' | 'bottom' | 'none';
  /** Máximo de segmentos; el resto se agrupa en "Otros". Por defecto 6. */
  maxSegments?: number;
  otherLabel?: string;
  emptyMessage?: string;
  ariaLabel?: string;
  onActiveChange?: (index: number | null) => void;
  animate?: boolean;
  className?: string;
}

/** Dona con separación entre segmentos, esquinas suavizadas y centro interactivo. */
export function DonutChart({
  data,
  size = 196,
  thickness,
  gap = 3,
  cornerRadius = 4,
  formatValue = defaultFormatValue,
  formatPercent = defaultFormatPercent,
  centerLabel = 'Total',
  center,
  legend = 'auto',
  maxSegments = 6,
  otherLabel = 'Otros',
  emptyMessage = 'Sin datos en este periodo',
  ariaLabel,
  onActiveChange,
  animate = true,
  className,
}: DonutChartProps) {
  const reduced = useReducedMotion();
  const motionOn = animate && !reduced;
  const [measureRef, { width }] = useMeasure<HTMLDivElement>();
  const maskId = useSvgId('dn');

  // Agrupa la cola en "Otros" (el color sigue a la entidad; "Otros" es neutro).
  const items = useMemo<DonutDatum[]>(() => {
    const clean = data.filter((d) => d.value > 0);
    if (clean.length <= maxSegments) return clean;
    const head = clean.slice(0, maxSegments - 1);
    const rest = clean.slice(maxSegments - 1).reduce((a, d) => a + d.value, 0);
    return [...head, { key: '__otros', label: otherLabel, value: rest, color: 'var(--chart-8)' }];
  }, [data, maxSegments, otherLabel]);

  const total = items.reduce((a, d) => a + d.value, 0);
  const isEmpty = total <= 0;
  const target = useMemo(() => items.map((d) => d.value), [items]);
  const tw = useTweenedArray(target, 640, motionOn);

  const nav = useChartNav({ count: items.length, indexAt: () => 0, onChange: onActiveChange });
  const active = nav.state && nav.state.index < items.length ? nav.state.index : null;

  const thick = thickness ?? Math.round(size * 0.13);
  const pad = 8; // espacio para el realce del segmento activo
  const outer = size / 2 - pad;
  const inner = Math.max(0, outer - thick);
  const c = size / 2;

  const slices = useMemo(() => {
    const sum = tw.reduce((a, v) => a + v, 0) || 1;
    let acc = 0;
    return tw.map((v, i) => {
      const a0 = (acc / sum) * Math.PI * 2;
      acc += v;
      const a1 = (acc / sum) * Math.PI * 2;
      return { i, d: donutSlicePath(c, c, inner, outer, a0, a1, items.length > 1 ? gap : 0, cornerRadius) };
    });
  }, [tw, c, inner, outer, gap, cornerRadius, items.length]);

  const legendPos = legend === 'auto' ? (width >= size + 260 ? 'right' : 'bottom') : legend;
  const act = active != null ? items[active] : null;
  const share = act && total ? act.value / total : null;

  const centerNode = center ? (
    center({ active: act, total, share })
  ) : isEmpty ? (
    <>
      <span className={s.centerLabel}>{centerLabel}</span>
      <span className={s.centerValue}>{formatValue(0)}</span>
      <span className={s.emptyText}>{emptyMessage}</span>
    </>
  ) : act ? (
    <>
      <span className={s.centerLabel}>
        <i className={s.centerDot} style={{ background: act.color }} />
        <span>{act.label}</span>
      </span>
      <span className={s.centerValue}>{formatValue(act.value)}</span>
      <span className={s.centerSub}>{formatPercent(share ?? 0)} del total</span>
    </>
  ) : (
    <>
      <span className={s.centerLabel}>{centerLabel}</span>
      <span className={s.centerValue}>{formatValue(total)}</span>
      <span className={s.centerSub}>
        {items.length} {items.length === 1 ? 'categoría' : 'categorías'}
      </span>
    </>
  );

  const summary = `${ariaLabel ?? 'Gráfico de dona'}. Total ${formatValue(total)}. ${items
    .map((d) => `${d.label}: ${formatValue(d.value)} (${formatPercent(total ? d.value / total : 0)})`)
    .join('; ')}.`;
  const live = nav.state?.source === 'keyboard' && act ? `${act.label}: ${formatValue(act.value)}, ${formatPercent(share ?? 0)}` : '';

  const ringR = (outer + inner) / 2;

  return (
    <div ref={measureRef} className={[cs.root, className].filter(Boolean).join(' ')}>
      <div className={[s.layout, legendPos === 'right' ? s.layoutRight : s.layoutBottom].join(' ')}>
        <div className={s.figure} style={{ width: size, height: size }}>
          <svg className={s.svg} width={size} height={size} aria-hidden focusable="false">
            {motionOn && !isEmpty && (
              <defs>
                <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={size} height={size}>
                  <circle
                    key={items.map((d) => d.key).join(',')}
                    className={s.sweep}
                    cx={c}
                    cy={c}
                    r={ringR}
                    fill="none"
                    stroke="white"
                    strokeWidth={thick + pad * 2 + 4}
                    pathLength={1}
                    transform={`rotate(-90 ${c} ${c})`}
                  />
                </mask>
              </defs>
            )}
            {isEmpty ? (
              <path className={s.track} d={donutSlicePath(c, c, inner, outer, 0, Math.PI * 2, 0, 0)} fillRule="evenodd" />
            ) : (
              <g mask={motionOn ? `url(#${maskId})` : undefined}>
                {slices.map((sl) => (
                  <path
                    key={items[sl.i].key}
                    className={[s.slice, active != null && active !== sl.i ? s.sliceDim : '', active === sl.i ? s.sliceActive : ''].join(' ')}
                    style={{ fill: items[sl.i].color, transformOrigin: `${c}px ${c}px` }}
                    d={sl.d}
                    fillRule="evenodd"
                    onPointerEnter={() => nav.setState({ index: sl.i, x: 0, y: 0, source: 'pointer' })}
                    onPointerLeave={(e) => e.pointerType !== 'touch' && nav.clear()}
                    onPointerDown={() => nav.setState({ index: sl.i, x: 0, y: 0, source: 'pointer' })}
                  />
                ))}
              </g>
            )}
          </svg>
          <div className={s.center}>{centerNode}</div>
          <div
            className={s.focusable}
            role="img"
            aria-label={summary}
            tabIndex={isEmpty ? -1 : 0}
            onKeyDown={nav.handlers.onKeyDown}
            onFocus={nav.handlers.onFocus}
            onBlur={nav.handlers.onBlur}
            style={{ pointerEvents: 'none' }}
          />
          <span className={cs.srOnly} aria-live="polite">
            {live}
          </span>
        </div>
        {legendPos !== 'none' && !isEmpty && (
          <ul className={s.legend} aria-hidden>
            {items.map((d, i) => (
              <li
                key={d.key}
                className={[s.row, active != null && active !== i ? s.rowDim : '', active === i ? s.rowActive : ''].join(' ')}
                onPointerEnter={() => nav.setState({ index: i, x: 0, y: 0, source: 'pointer' })}
                onPointerLeave={() => nav.clear()}
              >
                <span className={s.swatch}>
                  <i style={{ background: d.color }} />
                </span>
                <span className={s.rowLabel}>{d.label}</span>
                <span className={s.rowValue}>{formatValue(d.value)}</span>
                <span className={s.rowPct}>{formatPercent(d.value / total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {!isEmpty && (
        <SrTable
          caption={ariaLabel ?? 'Distribución'}
          columns={['Categoría', 'Valor', 'Porcentaje']}
          rows={items.map((d) => [d.label, formatValue(d.value), formatPercent(d.value / total)])}
        />
      )}
    </div>
  );
}

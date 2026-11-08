import { memo, useCallback, useMemo, type ReactNode } from 'react';
import s from './Chart.module.css';
import { Legend, type LegendItem } from './Legend';
import { ChartTooltip, type TooltipRow } from './ChartTooltip';
import { SrTable } from './SrTable';
import { ChartEmpty } from './ChartEmpty';
import { useMeasure, useReducedMotion, useSvgId, useTweenedArray } from './lib/hooks';
import { clamp, linearY, niceDomain } from './lib/scale';
import { areaPath, linePath, type CurveKind, type Pt } from './lib/paths';
import { defaultFormatCompact, defaultFormatValue, labelAt, numberAt } from './lib/format';
import { Axes, RefLines, computeXLabels, describeSeries, useSeriesToggle, yAxisWidth } from './lib/cartesian';
import { useChartNav } from './lib/nav';
import type { CartesianProps, ChartSeries, ValueFormatter } from './lib/types';

export interface AreaChartProps<T> extends CartesianProps<T> {
  /** `monotone` (por defecto, sin sobreoscilación) o `linear`. */
  curve?: CurveKind;
  /** Puntos en cada dato. Por defecto sólo con ≤ 14 puntos. */
  showDots?: boolean;
}

interface SeriesGeo {
  series: ChartSeries;
  visible: boolean;
  ys: number[];
  line: string;
  fill: string;
  gTop: number;
  gBottom: number;
  zero: number;
}

interface Geometry {
  left: number;
  right: number;
  top: number;
  bottom: number;
  xs: number[];
  y: (v: number) => number;
  ticks: number[];
  series: SeriesGeo[];
}

const MARGIN_TOP = 10;
const MARGIN_RIGHT = 8;
const AXIS_BAND = 28;

/**
 * Gráfico de área multiserie (cobrado vs gastado vs ganancia) con curvas
 * monotónicas, degradado que se desvanece, crosshair + tooltip, teclado y táctil.
 */
export function AreaChart<T>(props: AreaChartProps<T>) {
  const {
    data,
    series,
    xKey,
    getLabel,
    height = 260,
    formatValue = defaultFormatValue,
    formatAxisValue = defaultFormatCompact,
    formatTooltipLabel,
    tooltipFooter,
    emptyMessage = 'Todavía no hay movimientos en este periodo',
    ariaLabel,
    legend,
    toggleable = true,
    referenceLines,
    onActiveChange,
    animate = true,
    curve = 'monotone',
    showDots,
    className,
  } = props;

  const reduced = useReducedMotion();
  const motionOn = animate && !reduced;
  const [measureRef, { width }] = useMeasure<HTMLDivElement>();
  const [hidden, toggle] = useSeriesToggle(series);
  const gid = useSvgId('ar');

  const n = data.length;
  const labels = useMemo(() => data.map((d, i) => labelAt(d, i, xKey, getLabel)), [data, xKey, getLabel]);
  const raw = useMemo(() => series.map((sr) => data.map((d) => numberAt(d, sr.key))), [data, series]);
  const isEmpty = n === 0 || raw.every((row) => row.every((v) => v === 0));

  const tickCount = clamp(Math.round((height - AXIS_BAND) / 56), 2, 6);
  const domain = useMemo(() => {
    const vals: number[] = [];
    series.forEach((sr, si) => {
      if (!hidden.has(sr.key)) vals.push(...raw[si]);
    });
    referenceLines?.forEach((r) => vals.push(r.value));
    return niceDomain(vals, tickCount);
  }, [series, hidden, raw, referenceLines, tickCount]);

  const target = useMemo(() => [domain.min, domain.max, ...raw.flat()], [domain, raw]);
  const tw = useTweenedArray(target, 620, motionOn);
  const shapeKey = `${n}|${series.map((x) => x.key).join(',')}`;

  const geo = useMemo<Geometry | null>(() => {
    if (!width || !n) return null;
    const left = yAxisWidth(domain.ticks, formatAxisValue);
    const right = width - MARGIN_RIGHT;
    const top = MARGIN_TOP;
    const bottom = height - AXIS_BAND;
    const plotW = Math.max(1, right - left);
    const y = linearY(tw[0], tw[1], top, bottom);
    const xs = Array.from({ length: n }, (_, i) => (n === 1 ? left + plotW / 2 : left + (i * plotW) / (n - 1)));
    const y0 = y(0);
    const geoSeries = series.map<SeriesGeo>((sr, si) => {
      const pts: Pt[] = [];
      for (let i = 0; i < n; i++) pts.push([xs[i], y(tw[2 + si * n + i])]);
      let gTop = y0;
      let gBottom = y0;
      for (const p of pts) {
        if (p[1] < gTop) gTop = p[1];
        if (p[1] > gBottom) gBottom = p[1];
      }
      const span = gBottom - gTop;
      return {
        series: sr,
        visible: !hidden.has(sr.key),
        ys: pts.map((p) => p[1]),
        line: linePath(pts, curve),
        fill: sr.area === false ? '' : areaPath(pts, y0, curve),
        gTop,
        gBottom: span < 1 ? gTop + 1 : gBottom,
        zero: span < 1 ? 1 : (y0 - gTop) / span,
      };
    });
    return { left, right, top, bottom, xs, y, ticks: domain.ticks, series: geoSeries };
  }, [width, n, height, tw, series, hidden, curve, domain.ticks, formatAxisValue]);

  const xLabels = useMemo(() => (geo ? computeXLabels(labels, geo.xs, width) : []), [geo, labels, width]);

  const summary = useMemo(
    () =>
      `${ariaLabel ?? 'Gráfico de área'}. ${describeSeries(
        series,
        raw,
        labels,
        formatValue,
      )}`,
    [ariaLabel, series, raw, labels, formatValue],
  );

  const legendItems = useMemo<LegendItem[]>(
    () =>
      series.map((sr) => ({
        key: sr.key,
        label: sr.label,
        color: sr.color,
        marker: sr.dashed ? 'dashed' : sr.area === false ? 'line' : 'square',
      })),
    [series],
  );
  const legendPos = legend ?? (series.length >= 2 ? 'top' : 'none');
  const legendEl =
    legendPos !== 'none' ? (
      <Legend
        items={legendItems}
        hidden={hidden}
        onToggle={toggleable && series.length > 1 ? toggle : undefined}
        style={legendPos === 'top' ? { marginBottom: 14 } : { marginTop: 10 }}
      />
    ) : null;

  const dots = showDots ?? n <= 14;

  const base = useMemo(() => {
    if (!geo) return null;
    return (
      <svg className={s.svg} width={width} height={height} aria-hidden focusable="false">
        <defs>
          {geo.series.map((g, si) => {
            const z = clamp(g.zero, 0, 1);
            return (
              <linearGradient key={g.series.key} id={`${gid}-${si}`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={g.gTop} y2={g.gBottom}>
                {z >= 0.999 ? (
                  <>
                    <stop offset="0" style={{ stopColor: g.series.color, stopOpacity: 'var(--chart-area-top)' }} />
                    <stop offset="1" style={{ stopColor: g.series.color, stopOpacity: 'var(--chart-area-bottom)' }} />
                  </>
                ) : z <= 0.001 ? (
                  <>
                    <stop offset="0" style={{ stopColor: g.series.color, stopOpacity: 0 }} />
                    <stop offset="1" style={{ stopColor: g.series.color, stopOpacity: 'var(--chart-area-top)' }} />
                  </>
                ) : (
                  <>
                    <stop offset="0" style={{ stopColor: g.series.color, stopOpacity: 'var(--chart-area-top)' }} />
                    <stop offset={z} style={{ stopColor: g.series.color, stopOpacity: 0 }} />
                    <stop offset="1" style={{ stopColor: g.series.color, stopOpacity: 'var(--chart-area-top)' }} />
                  </>
                )}
              </linearGradient>
            );
          })}
        </defs>
        <Axes
          width={width}
          left={geo.left}
          right={geo.right}
          top={geo.top}
          bottom={geo.bottom}
          ticks={isEmpty ? [] : geo.ticks}
          y={geo.y}
          formatAxisValue={formatAxisValue}
          xLabels={xLabels}
          showZero
        />
        {isEmpty ? (
          <EmptyGrid left={geo.left} right={geo.right} top={geo.top} bottom={geo.bottom} />
        ) : (
          <g key={shapeKey}>
            {geo.series.map((g, si) =>
              g.fill ? (
                <path
                  key={'a' + g.series.key}
                  className={[s.area, motionOn ? s.fadeIn : '', g.visible ? '' : s.isHidden].join(' ')}
                  d={g.fill}
                  fill={`url(#${gid}-${si})`}
                />
              ) : null,
            )}
            {referenceLines && referenceLines.length > 0 && (
              <RefLines lines={referenceLines} y={geo.y} left={geo.left} right={geo.right} top={geo.top} formatAxisValue={formatAxisValue} />
            )}
            {geo.series.map((g) => (
              <path
                key={'l' + g.series.key}
                className={[
                  s.line,
                  g.series.dashed ? s.lineDashed : '',
                  motionOn ? (g.series.dashed ? s.fadeInFast : s.drawIn) : '',
                  g.visible ? '' : s.isHidden,
                ].join(' ')}
                d={g.line}
                pathLength={g.series.dashed ? undefined : 1}
                style={{ stroke: g.series.color }}
              />
            ))}
            {dots &&
              geo.series.map((g) =>
                g.visible ? (
                  <g key={'d' + g.series.key} className={motionOn ? s.fadeIn : undefined}>
                    {g.ys.map((yy, i) => (
                      <circle key={i} className={s.dot} cx={geo.xs[i]} cy={yy} r={3} style={{ fill: g.series.color }} />
                    ))}
                  </g>
                ) : null,
              )}
          </g>
        )}
      </svg>
    );
  }, [geo, width, height, gid, isEmpty, formatAxisValue, xLabels, shapeKey, motionOn, referenceLines, dots]);

  return (
    <div className={[s.root, className].filter(Boolean).join(' ')}>
      {legendPos === 'top' && legendEl}
      <div ref={measureRef} className={s.plot} style={{ height }}>
        {base}
        {geo && isEmpty && <ChartEmpty message={emptyMessage} />}
        {geo && !isEmpty && (
          <AreaOverlay
            geo={geo}
            width={width}
            height={height}
            labels={labels}
            data={data as readonly unknown[]}
            raw={raw}
            formatValue={formatValue}
            formatTooltipLabel={formatTooltipLabel as AreaOverlayProps['formatTooltipLabel']}
            tooltipFooter={tooltipFooter as AreaOverlayProps['tooltipFooter']}
            ariaLabel={summary}
            onActiveChange={onActiveChange}
          />
        )}
        {geo && isEmpty && <div className={s.overlay} role="img" aria-label={`${ariaLabel ?? 'Gráfico de área'}. ${emptyMessage}.`} />}
      </div>
      {legendPos === 'bottom' && legendEl}
      {!isEmpty && (
        <SrTable
          caption={ariaLabel ?? 'Datos del gráfico'}
          columns={['Periodo', ...series.map((x) => x.label)]}
          rows={labels.map((l, i) => [l, ...raw.map((row) => formatValue(row[i]))])}
        />
      )}
    </div>
  );
}

function EmptyGrid({ left, right, top, bottom }: { left: number; right: number; top: number; bottom: number }) {
  const rows = 4;
  return (
    <g>
      {Array.from({ length: rows }, (_, i) => {
        const yy = Math.round(top + ((bottom - top) * i) / rows) + 0.5;
        return <line key={i} className={s.gridLine} x1={left} x2={right} y1={yy} y2={yy} />;
      })}
    </g>
  );
}

/* --------------------------- Capa interactiva --------------------------- */

interface AreaOverlayProps {
  geo: Geometry;
  width: number;
  height: number;
  labels: readonly string[];
  data: readonly unknown[];
  raw: readonly (readonly number[])[];
  formatValue: ValueFormatter;
  formatTooltipLabel?: (label: string, datum: unknown, index: number) => string;
  tooltipFooter?: (datum: unknown, index: number) => ReactNode;
  ariaLabel: string;
  onActiveChange?: (index: number | null) => void;
}

/**
 * Sólo esta capa se vuelve a renderizar al mover el puntero: crosshair,
 * puntos activos y tooltip. Las rutas del gráfico quedan memoizadas.
 */
const AreaOverlay = memo(function AreaOverlay({
  geo,
  width,
  height,
  labels,
  data,
  raw,
  formatValue,
  formatTooltipLabel,
  tooltipFooter,
  ariaLabel,
  onActiveChange,
}: AreaOverlayProps) {
  const n = geo.xs.length;
  const indexAt = useCallback(
    (x: number) => {
      if (n <= 1) return 0;
      const stepPx = (geo.right - geo.left) / (n - 1);
      return Math.round((x - geo.left) / stepPx);
    },
    [n, geo.left, geo.right],
  );
  const { state, handlers } = useChartNav({ count: n, indexAt, trackPointer: true, onChange: onActiveChange });

  const i = state?.index ?? null;
  const active = i != null && i < n ? i : null;
  const visible = geo.series.filter((g) => g.visible);

  let title = '';
  let rows: TooltipRow[] = [];
  if (active != null) {
    title = formatTooltipLabel ? formatTooltipLabel(labels[active], data[active], active) : labels[active];
    rows = geo.series
      .map((g, si) => ({ g, si }))
      .filter(({ g }) => g.visible)
      .map(({ g, si }) => ({
        key: g.series.key,
        label: g.series.label,
        value: formatValue(raw[si][active]),
        color: g.series.color,
        dashed: g.series.dashed,
      }));
  }

  const ax = active != null ? geo.xs[active] : 0;
  const minY = active != null ? Math.min(...visible.map((g) => g.ys[active])) : 0;
  const anchorY = state?.source === 'pointer' ? clamp(state.y, geo.top, geo.bottom) : minY;
  const live = state?.source === 'keyboard' && active != null ? `${title}. ${rows.map((r) => `${r.label}: ${r.value}`).join(', ')}` : '';

  return (
    <>
      <svg className={s.overlaySvg} width={width} height={height} aria-hidden focusable="false">
        {active != null && (
          <g>
            <line className={s.crosshair} x1={Math.round(ax) + 0.5} x2={Math.round(ax) + 0.5} y1={geo.top} y2={geo.bottom} />
            {visible.map((g) => (
              <g key={g.series.key}>
                <circle className={s.dotHalo} cx={ax} cy={g.ys[active]} r={9} style={{ fill: g.series.color }} />
                <circle className={s.dot} cx={ax} cy={g.ys[active]} r={4.5} style={{ fill: g.series.color }} />
              </g>
            ))}
          </g>
        )}
      </svg>
      <div className={s.overlay} role="img" aria-label={ariaLabel} tabIndex={0} {...handlers} />
      <ChartTooltip
        open={active != null}
        anchor={active != null ? { x: ax, y: anchorY } : null}
        bounds={{ width, height }}
        title={title}
        rows={rows}
        footer={active != null && tooltipFooter ? tooltipFooter(data[active], active) : undefined}
      />
      <span className={s.srOnly} aria-live="polite">
        {live}
      </span>
    </>
  );
});

import { useCallback, useMemo } from 'react';
import s from './Chart.module.css';
import { Legend, type LegendItem } from './Legend';
import { ChartTooltip, type TooltipRow } from './ChartTooltip';
import { SrTable } from './SrTable';
import { ChartEmpty } from './ChartEmpty';
import { useMeasure, useReducedMotion, useTweenedArray } from './lib/hooks';
import { clamp, linearY, niceDomain } from './lib/scale';
import { barPath, linePath, type CurveKind, type Pt } from './lib/paths';
import { defaultFormatCompact, defaultFormatValue, labelAt, numberAt } from './lib/format';
import { Axes, RefLines, computeXLabels, describeSeries, useSeriesToggle, yAxisWidth } from './lib/cartesian';
import { useChartNav } from './lib/nav';
import type { CartesianProps, ChartSeries } from './lib/types';

export interface BarChartProps<T> extends CartesianProps<T> {
  /** `grouped` (lado a lado, por defecto) o `stacked` (apiladas). */
  mode?: 'grouped' | 'stacked';
  /** Series dibujadas como línea sobre las barras (gráfico combinado), mismo eje. */
  lineSeries?: readonly ChartSeries[];
  /** Grosor máximo de cada barra en px. Por defecto 24. */
  maxBarWidth?: number;
  /** Separación entre barras de un mismo grupo. Por defecto 2 px. */
  barGap?: number;
  /** Fracción de cada banda que queda libre (aire entre grupos). Por defecto 0.3. */
  bandPadding?: number;
  /** Radio del extremo de datos. Por defecto 4 px. */
  radius?: number;
  /** Curva de las series de línea. */
  curve?: CurveKind;
  /** Etiqueta de la fila de total en el tooltip (apiladas). `null` la oculta. */
  totalLabel?: string | null;
}

interface BarGeo {
  key: string;
  d: string;
  color: string;
  up: boolean;
}

interface GroupGeo {
  index: number;
  cx: number;
  width: number;
  topY: number;
  bars: BarGeo[];
}

const MARGIN_TOP = 10;
const MARGIN_RIGHT = 8;
const AXIS_BAND = 28;
const STACK_GAP = 2;

/**
 * Barras agrupadas o apiladas (ingresos vs gastos por día/semana/mes) con
 * extremo redondeado, negativos hacia abajo y línea opcional superpuesta.
 */
export function BarChart<T>(props: BarChartProps<T>) {
  const {
    data,
    series,
    lineSeries = EMPTY,
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
    mode = 'grouped',
    maxBarWidth = 24,
    barGap = 2,
    bandPadding = 0.3,
    radius = 4,
    curve = 'monotone',
    totalLabel = 'Total',
    className,
  } = props;

  const reduced = useReducedMotion();
  const motionOn = animate && !reduced;
  const [measureRef, { width }] = useMeasure<HTMLDivElement>();
  const all = useMemo(() => [...series, ...lineSeries], [series, lineSeries]);
  const [hidden, toggle] = useSeriesToggle(all);

  const n = data.length;
  const nb = series.length;
  const labels = useMemo(() => data.map((d, i) => labelAt(d, i, xKey, getLabel)), [data, xKey, getLabel]);
  const raw = useMemo(() => all.map((sr) => data.map((d) => numberAt(d, sr.key))), [data, all]);
  const isEmpty = n === 0 || raw.every((row) => row.every((v) => v === 0));

  const tickCount = clamp(Math.round((height - AXIS_BAND) / 56), 2, 6);
  const domain = useMemo(() => {
    const vals: number[] = [];
    if (mode === 'stacked') {
      for (let i = 0; i < n; i++) {
        let pos = 0;
        let neg = 0;
        for (let si = 0; si < nb; si++) {
          if (hidden.has(series[si].key)) continue;
          const v = raw[si][i];
          if (v >= 0) pos += v;
          else neg += v;
        }
        vals.push(pos, neg);
      }
    } else {
      series.forEach((sr, si) => {
        if (!hidden.has(sr.key)) vals.push(...raw[si]);
      });
    }
    lineSeries.forEach((sr, li) => {
      if (!hidden.has(sr.key)) vals.push(...raw[nb + li]);
    });
    referenceLines?.forEach((r) => vals.push(r.value));
    return niceDomain(vals, tickCount);
  }, [mode, n, nb, series, lineSeries, hidden, raw, referenceLines, tickCount]);

  const target = useMemo(
    () => [domain.min, domain.max, ...raw.flat(), ...all.map((sr) => (hidden.has(sr.key) ? 0 : 1))],
    [domain, raw, all, hidden],
  );
  const tw = useTweenedArray(target, 620, motionOn);
  const shapeKey = `${n}|${all.map((x) => x.key).join(',')}|${mode}`;

  const geo = useMemo(() => {
    if (!width || !n) return null;
    const left = yAxisWidth(domain.ticks, formatAxisValue);
    const right = width - MARGIN_RIGHT;
    const top = MARGIN_TOP;
    const bottom = height - AXIS_BAND;
    const plotW = Math.max(1, right - left);
    const y = linearY(tw[0], tw[1], top, bottom);
    const y0 = y(0);
    const band = plotW / n;
    const val = (si: number, i: number) => tw[2 + si * n + i];
    const pres = (si: number) => clamp(tw[2 + all.length * n + si], 0, 1);
    const groupMax = Math.max(1, band * (1 - bandPadding));

    const groups: GroupGeo[] = [];
    for (let i = 0; i < n; i++) {
      const cx = left + band * (i + 0.5);
      const bars: BarGeo[] = [];
      let topY = y0;
      let groupW = 0;
      if (mode === 'stacked') {
        const w = Math.min(maxBarWidth, groupMax);
        groupW = w;
        const x = cx - w / 2;
        // Último segmento no nulo en cada dirección: ése lleva el extremo redondeado.
        let lastPos = -1;
        let lastNeg = -1;
        for (let si = 0; si < nb; si++) {
          const v = val(si, i) * pres(si);
          if (v > 0) lastPos = si;
          else if (v < 0) lastNeg = si;
        }
        let pos = 0;
        let neg = 0;
        for (let si = 0; si < nb; si++) {
          const sr = series[si];
          const v = val(si, i) * pres(si);
          if (Math.abs(v) < 1e-9) continue;
          const up = v > 0;
          const base = up ? pos : neg;
          const end = base + v;
          if (up) pos = end;
          else neg = end;
          let yb = y(base);
          const ye = y(end);
          if (base !== 0) yb += up ? -STACK_GAP : STACK_GAP;
          if (up ? ye >= yb : ye <= yb) continue;
          topY = Math.min(topY, ye);
          bars.push({
            key: sr.key,
            d: barPath(x, w, yb, ye, radius, up ? si === lastPos : si === lastNeg),
            color: v < 0 && sr.negativeColor ? sr.negativeColor : sr.color,
            up,
          });
        }
      } else {
        let k = 0;
        for (let si = 0; si < nb; si++) k += pres(si);
        if (k > 1e-3) {
          const gap = Math.min(barGap, Math.max(1, groupMax / Math.max(1, k) / 5));
          const barW = Math.max(1, Math.min(maxBarWidth, (groupMax - gap * Math.max(0, k - 1)) / k));
          groupW = barW * k + gap * Math.max(0, k - 1);
          let cursor = cx - groupW / 2;
          for (let si = 0; si < nb; si++) {
            const p = pres(si);
            if (p <= 1e-3) continue;
            const sr = series[si];
            const w = barW * p;
            const v = val(si, i);
            const ye = y(v);
            topY = Math.min(topY, ye);
            bars.push({
              key: sr.key,
              d: barPath(cursor, w, y0, ye, radius),
              color: v < 0 && sr.negativeColor ? sr.negativeColor : sr.color,
              up: v >= 0,
            });
            cursor += w + gap * p;
          }
        }
      }
      groups.push({ index: i, cx, width: groupW, topY, bars });
    }

    const lines = lineSeries.map((sr, li) => {
      const si = nb + li;
      const pts: Pt[] = [];
      for (let i = 0; i < n; i++) pts.push([left + band * (i + 0.5), y(val(si, i))]);
      if (!hidden.has(sr.key)) for (let i = 0; i < n; i++) groups[i].topY = Math.min(groups[i].topY, pts[i][1]);
      return { series: sr, visible: !hidden.has(sr.key), pts, d: linePath(pts, curve) };
    });

    return { left, right, top, bottom, band, y, y0, groups, lines, ticks: domain.ticks };
  }, [width, n, height, tw, domain.ticks, formatAxisValue, all.length, bandPadding, mode, maxBarWidth, nb, series, radius, barGap, lineSeries, hidden, curve]);

  const xLabels = useMemo(() => (geo ? computeXLabels(labels, geo.groups.map((g) => g.cx), width) : []), [geo, labels, width]);

  /* ---- Interacción: el índice activo sólo cambia al cruzar de banda ---- */
  const indexAt = useCallback((x: number) => (geo ? Math.floor((x - geo.left) / geo.band) : 0), [geo]);
  const { state, handlers } = useChartNav({ count: n, indexAt, onChange: onActiveChange });
  const active = state && state.index < n ? state.index : null;

  const summary = useMemo(
    () => `${ariaLabel ?? 'Gráfico de barras'}. ${describeSeries(all, raw, labels, formatValue)}`,
    [ariaLabel, all, raw, labels, formatValue],
  );

  const legendItems = useMemo<LegendItem[]>(
    () => [
      ...series.map((sr) => ({ key: sr.key, label: sr.label, color: sr.color, marker: 'square' as const })),
      ...lineSeries.map((sr) => ({ key: sr.key, label: sr.label, color: sr.color, marker: sr.dashed ? ('dashed' as const) : ('line' as const) })),
    ],
    [series, lineSeries],
  );
  const legendPos = legend ?? (all.length >= 2 ? 'top' : 'none');
  const legendEl =
    legendPos !== 'none' ? (
      <Legend
        items={legendItems}
        hidden={hidden}
        onToggle={toggleable && all.length > 1 ? toggle : undefined}
        style={legendPos === 'top' ? { marginBottom: 14 } : { marginTop: 10 }}
      />
    ) : null;

  const showLineDots = n <= 16;

  const base = useMemo(() => {
    if (!geo) return null;
    return (
      <svg className={s.svg} width={width} height={height} aria-hidden focusable="false">
        {active != null && geo.groups[active] && (
          <rect
            className={s.bandHighlight}
            x={geo.left + geo.band * active + Math.min(4, geo.band * 0.08)}
            y={geo.top - 4}
            width={Math.max(1, geo.band - Math.min(8, geo.band * 0.16))}
            height={geo.bottom - geo.top + 4}
            rx={Math.min(8, geo.band / 4)}
          />
        )}
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
        {!isEmpty && (
          <g key={shapeKey}>
            {geo.groups.map((g) => (
              <g key={g.index} className={[s.barGroup, active != null && active !== g.index ? s.barGroupDim : ''].join(' ')}>
                {g.bars.map((b) => (
                  <path
                    key={b.key}
                    className={[s.bar, motionOn ? (b.up ? s.barGrowUp : s.barGrowDown) : ''].join(' ')}
                    d={b.d}
                    style={{ fill: b.color, animationDelay: motionOn ? `${Math.min(g.index * 24, 480)}ms` : undefined }}
                  />
                ))}
              </g>
            ))}
            {referenceLines && referenceLines.length > 0 && (
              <RefLines lines={referenceLines} y={geo.y} left={geo.left} right={geo.right} top={geo.top} formatAxisValue={formatAxisValue} />
            )}
            {geo.lines.map((l) => (
              <g key={l.series.key} className={[s.fade, l.visible ? '' : s.isHidden].join(' ')}>
                <path
                  className={[s.line, l.series.dashed ? s.lineDashed : '', motionOn ? (l.series.dashed ? s.fadeIn : s.drawIn) : ''].join(' ')}
                  d={l.d}
                  pathLength={l.series.dashed ? undefined : 1}
                  style={{ stroke: l.series.color, animationDelay: motionOn ? '260ms' : undefined }}
                />
                {l.pts.map((p, i) =>
                  showLineDots || i === active ? (
                    <circle
                      key={i}
                      className={[s.dot, motionOn ? s.fadeIn : ''].join(' ')}
                      cx={p[0]}
                      cy={p[1]}
                      r={i === active ? 4.5 : 3}
                      style={{ fill: l.series.color, animationDelay: motionOn ? '700ms' : undefined }}
                    />
                  ) : null,
                )}
              </g>
            ))}
          </g>
        )}
      </svg>
    );
  }, [geo, width, height, active, isEmpty, formatAxisValue, xLabels, shapeKey, motionOn, referenceLines, showLineDots]);

  /* ---- Tooltip ---- */
  let rows: TooltipRow[] = [];
  let title = '';
  let total: { label: string; value: string } | undefined;
  if (active != null && geo) {
    title = formatTooltipLabel ? formatTooltipLabel(labels[active], data[active], active) : labels[active];
    rows = all
      .map((sr, si) => ({ sr, si }))
      .filter(({ sr }) => !hidden.has(sr.key))
      .map(({ sr, si }) => ({
        key: sr.key,
        label: sr.label,
        value: formatValue(raw[si][active]),
        color: raw[si][active] < 0 && sr.negativeColor ? sr.negativeColor : sr.color,
        dashed: sr.dashed,
      }));
    if (mode === 'stacked' && totalLabel) {
      let sum = 0;
      series.forEach((sr, si) => {
        if (!hidden.has(sr.key)) sum += raw[si][active];
      });
      total = { label: totalLabel, value: formatValue(sum) };
    }
  }
  const g = active != null && geo ? geo.groups[active] : null;
  const live = state?.source === 'keyboard' && active != null ? `${title}. ${rows.map((r) => `${r.label}: ${r.value}`).join(', ')}` : '';

  return (
    <div className={[s.root, className].filter(Boolean).join(' ')}>
      {legendPos === 'top' && legendEl}
      <div ref={measureRef} className={s.plot} style={{ height }}>
        {base}
        {geo && isEmpty && <ChartEmpty message={emptyMessage} />}
        {geo && !isEmpty && (
          <>
            <div className={s.overlay} role="img" aria-label={summary} tabIndex={0} {...handlers} />
            <ChartTooltip
              open={active != null}
              anchor={g ? { x: g.cx, y: Math.max(geo.top, g.topY) } : null}
              offset={g ? Math.max(g.width / 2, 4) + 10 : 14}
              align="start"
              bounds={{ width, height }}
              title={title}
              rows={rows}
              total={total}
              footer={active != null && tooltipFooter ? tooltipFooter(data[active], active) : undefined}
            />
            <span className={s.srOnly} aria-live="polite">
              {live}
            </span>
          </>
        )}
        {geo && isEmpty && <div className={s.overlay} role="img" aria-label={`${ariaLabel ?? 'Gráfico de barras'}. ${emptyMessage}.`} />}
      </div>
      {legendPos === 'bottom' && legendEl}
      {!isEmpty && (
        <SrTable
          caption={ariaLabel ?? 'Datos del gráfico'}
          columns={['Periodo', ...all.map((x) => x.label)]}
          rows={labels.map((l, i) => [l, ...raw.map((row) => formatValue(row[i]))])}
        />
      )}
    </div>
  );
}

const EMPTY: readonly ChartSeries[] = [];

import { useCallback, useMemo } from 'react';
import cs from './Chart.module.css';
import { ChartTooltip } from './ChartTooltip';
import { useMeasure, useReducedMotion, useSvgId } from './lib/hooks';
import { areaPath, linePath, type CurveKind, type Pt } from './lib/paths';
import { defaultFormatValue } from './lib/format';
import { useChartNav } from './lib/nav';
import { TONE_COLOR, type ChartTone } from './lib/tone';
import type { ValueFormatter } from './lib/types';

export interface SparklineProps {
  data: readonly number[];
  /** Alto en px. Por defecto 40. El ancho es fluido (100 % del contenedor) salvo que se fije. */
  height?: number;
  width?: number;
  /** Tono semántico (`income`, `expense`, `profit`, `pending`, `brand`, `info`, `neutral`). */
  tone?: ChartTone;
  /** Color explícito (token CSS); tiene prioridad sobre `tone`. */
  color?: string;
  variant?: 'area' | 'line';
  /** Punto final destacado. Por defecto `true`. */
  showEndDot?: boolean;
  strokeWidth?: number;
  curve?: CurveKind;
  /** Con `interactive`, al pasar el cursor muestra el valor del punto. */
  interactive?: boolean;
  labels?: readonly string[];
  formatValue?: ValueFormatter;
  ariaLabel?: string;
  animate?: boolean;
  className?: string;
}

/** Mini gráfico sin ejes para tarjetas KPI. */
export function Sparkline({
  data,
  height = 40,
  width: fixedWidth,
  tone = 'brand',
  color,
  variant = 'area',
  showEndDot = true,
  strokeWidth = 1.75,
  curve = 'monotone',
  interactive = false,
  labels,
  formatValue = defaultFormatValue,
  ariaLabel,
  animate = true,
  className,
}: SparklineProps) {
  const reduced = useReducedMotion();
  const motionOn = animate && !reduced;
  const [measureRef, size] = useMeasure<HTMLDivElement>();
  const width = fixedWidth ?? size.width;
  const gid = useSvgId('sp');
  const col = color ?? TONE_COLOR[tone];
  const n = data.length;

  const geo = useMemo(() => {
    if (!width || !n) return null;
    const padX = showEndDot ? 4 : 1;
    const padTop = 4;
    const padBottom = variant === 'area' ? 1 : 4;
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of data) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const span = hi - lo;
    const plotW = width - padX * 2;
    const plotH = height - padTop - padBottom;
    const y = (v: number) => (span === 0 ? padTop + plotH / 2 : padTop + ((hi - v) / span) * plotH);
    const pts: Pt[] = data.map((v, i) => [padX + (n === 1 ? plotW : (i * plotW) / (n - 1)), y(v)]);
    return {
      pts,
      line: linePath(pts, curve),
      area: variant === 'area' && n > 1 ? areaPath(pts, height, curve) : '',
      padX,
      plotW,
    };
  }, [width, n, data, height, variant, curve, showEndDot]);

  const indexAt = useCallback(
    (x: number) => (geo && n > 1 ? Math.round(((x - geo.padX) / geo.plotW) * (n - 1)) : 0),
    [geo, n],
  );
  const nav = useChartNav({ count: interactive ? n : 0, indexAt });
  const active = interactive && nav.state && nav.state.index < n ? nav.state.index : null;

  const last = n ? data[n - 1] : 0;
  const first = n ? data[0] : 0;
  const label = ariaLabel ?? `Tendencia: de ${formatValue(first)} a ${formatValue(last)}`;
  const end = geo?.pts[n - 1];
  const dot = active != null && geo ? geo.pts[active] : end;

  return (
    <div ref={measureRef} className={[cs.root, className].filter(Boolean).join(' ')} style={{ height, width: fixedWidth }}>
      {geo && (
        <svg className={cs.svg} width={width} height={height} aria-hidden focusable="false">
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" style={{ stopColor: col, stopOpacity: 'var(--chart-area-top)' }} />
              <stop offset="1" style={{ stopColor: col, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {geo.area && <path className={[cs.area, motionOn ? cs.fadeIn : ''].join(' ')} d={geo.area} fill={`url(#${gid})`} />}
          <path
            className={[cs.line, motionOn ? cs.drawIn : ''].join(' ')}
            d={geo.line}
            pathLength={1}
            style={{ stroke: col, strokeWidth }}
          />
          {showEndDot && dot && (
            <g className={motionOn && active == null ? cs.fadeIn : undefined} style={{ animationDelay: '700ms' }}>
              <circle cx={dot[0]} cy={dot[1]} r={6.5} className={cs.dotHalo} style={{ fill: col }} />
              <circle cx={dot[0]} cy={dot[1]} r={3} className={cs.dot} style={{ fill: col, strokeWidth: 1.5 }} />
            </g>
          )}
        </svg>
      )}
      {interactive ? (
        <>
          <div className={cs.overlay} role="img" aria-label={label} tabIndex={0} {...nav.handlers} />
          <ChartTooltip
            open={active != null}
            anchor={active != null && dot ? { x: dot[0], y: dot[1] } : null}
            bounds={{ width, height }}
            offset={10}
            placement="top"
            title={active != null && labels ? labels[active] : undefined}
            compactValue={active != null ? formatValue(data[active]) : ''}
          />
        </>
      ) : (
        <span className={cs.srOnly} role="img" aria-label={label} />
      )}
    </div>
  );
}

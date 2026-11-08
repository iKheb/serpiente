import { useEffect, useState, type ReactNode } from 'react';
import s from './ProgressRing.module.css';
import { useCountUp, useReducedMotion, useSvgId } from './lib/hooks';
import { TONE_COLOR, type ChartTone } from './lib/tone';

export interface ProgressRingProps {
  /** Valor actual (p. ej. ganancia del mes en centavos). */
  value: number;
  /** Meta (mismo tipo de unidad que `value`). */
  goal: number;
  /** Diámetro en px. Por defecto 168. */
  size?: number;
  /** Grosor del anillo. Por defecto 12. */
  thickness?: number;
  /** `brand` usa el degradado de marca (iris → cian). */
  tone?: ChartTone;
  /** Color explícito (token CSS); reemplaza el degradado. */
  color?: string;
  /** Texto principal del centro. Por defecto el porcentaje animado. */
  valueLabel?: ReactNode;
  /** Texto secundario bajo el valor (p. ej. "de $50,000"). */
  caption?: ReactNode;
  formatPercent?: (ratio: number) => string;
  /** Reemplaza todo el contenido del centro. */
  children?: ReactNode;
  ariaLabel?: string;
  animate?: boolean;
  className?: string;
}

/** Anillo de progreso hacia una meta, con degradado de marca y contador animado. */
export function ProgressRing({
  value,
  goal,
  size = 168,
  thickness = 12,
  tone = 'brand',
  color,
  valueLabel,
  caption,
  formatPercent = defaultRingPercent,
  children,
  ariaLabel,
  animate = true,
  className,
}: ProgressRingProps) {
  const reduced = useReducedMotion();
  const motionOn = animate && !reduced;
  const gid = useSvgId('pr');
  const ratio = goal > 0 ? Math.max(0, value / goal) : 0;
  const pct = Math.min(1, ratio);
  const [mounted, setMounted] = useState(!motionOn);
  useEffect(() => {
    if (mounted) return;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(r);
  }, [mounted]);
  const shown = useCountUp(ratio, 1300, motionOn);

  const r = (size - thickness) / 2 - 1;
  const c = size / 2;
  const useGradient = !color && tone === 'brand';
  const stroke = color ?? (useGradient ? `url(#${gid})` : TONE_COLOR[tone]);
  const trackColor = useGradient ? 'var(--brand-soft)' : `color-mix(in srgb, ${color ?? TONE_COLOR[tone]} 16%, transparent)`;
  const offset = 100 - (mounted ? pct : 0) * 100;
  const fontSize = Math.max(16, Math.round(size * 0.18));

  return (
    <div
      className={[s.ring, className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel ?? `Progreso: ${formatPercent(ratio)} de la meta`}
    >
      <svg className={s.svg} width={size} height={size} aria-hidden focusable="false">
        {useGradient && (
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--brand-2)' }} />
              <stop offset="1" style={{ stopColor: 'var(--brand)' }} />
            </linearGradient>
          </defs>
        )}
        <circle className={s.track} cx={c} cy={c} r={r} style={{ stroke: trackColor, strokeWidth: thickness }} />
        <circle
          className={s.bar}
          cx={c}
          cy={c}
          r={r}
          pathLength={100}
          strokeDasharray="100 100"
          strokeDashoffset={offset}
          transform={`rotate(-90 ${c} ${c})`}
          style={{ stroke, strokeWidth: thickness, opacity: pct > 0 ? 1 : 0 }}
        />
      </svg>
      <div className={s.center}>
        {children ?? (
          <>
            <span className={s.value} style={{ fontSize }}>
              {valueLabel ?? formatPercent(shown)}
            </span>
            {caption != null && <span className={s.caption}>{caption}</span>}
          </>
        )}
      </div>
    </div>
  );
}

const ringPct = new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 0 });
const defaultRingPercent = (ratio: number) => ringPct.format(ratio);

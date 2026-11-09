import { useId } from 'react';
import { BRAND_GRADIENT, MARK } from '@/app/brand';

export interface BrandMarkProps {
  size?: number;
  className?: string;
  /** Anima el trazo del pulso (splash). */
  animated?: boolean;
  title?: string;
}

/** Isotipo de Reparo (celular con pulso) como SVG con degradado de marca. */
export function BrandMark({ size = 28, className, animated, title }: BrandMarkProps) {
  const uid = useId().replace(/:/g, '');
  const [a, b, c] = BRAND_GRADIENT;
  const { tile: t, phone: p, speaker: s } = MARK;
  return (
    <svg width={size} height={size} viewBox={MARK.viewBox} className={className} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={a} />
          <stop offset=".5" stopColor={b} />
          <stop offset="1" stopColor={c} />
        </linearGradient>
        <radialGradient id={`h${uid}`} cx="20" cy="8" r="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="white" stopOpacity=".35" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={t.r} fill={`url(#g${uid})`} />
      <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={t.r} fill={`url(#h${uid})`} />
      <rect x={t.x + 0.5} y={t.y + 0.5} width={t.w - 1} height={t.h - 1} rx={t.r - 0.5} fill="none" stroke="white" strokeOpacity=".18" />
      <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.r} fill="none" stroke="white" strokeWidth={p.stroke} />
      <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      <polyline
        points={MARK.pulse}
        fill="none"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        style={animated ? { strokeDasharray: 1, strokeDashoffset: 1, animation: 'reparo-pulse-draw 1.6s cubic-bezier(0.65,0,0.35,1) 0.15s infinite' } : undefined}
      />
    </svg>
  );
}

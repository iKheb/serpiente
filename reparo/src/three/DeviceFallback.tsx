/**
 * Fallback estático (SVG) cuando WebGL no está disponible: silueta del
 * teléfono con borde de marca, valor y sparkline. Sin animaciones.
 */
import { useId } from 'react';
import { BRAND_GRADIENT } from '@/app/brand';
import s from './three.module.css';
import { DEFAULT_SCREEN, type ScreenData } from './lib/screenData';

function sparkPath(trend: number[], x: number, y: number, w: number, h: number) {
  const v = trend.length >= 2 ? trend : DEFAULT_SCREEN.trend;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  return v
    .map((n, i) => {
      const px = x + (i / (v.length - 1)) * w;
      const py = y + h - ((n - min) / span) * h;
      return `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(' ');
}

export function DeviceFallback({ screen }: { screen?: ScreenData }) {
  const id = useId().replace(/:/g, '');
  const d: ScreenData = screen ?? DEFAULT_SCREEN;
  const trend = screen?.trend && screen.trend.length >= 2 ? screen.trend : DEFAULT_SCREEN.trend;
  const line = sparkPath(trend, 26, 150, 128, 54);
  const [a, b, c] = BRAND_GRADIENT;
  return (
    <div className={s.fallback} aria-hidden="true">
      <svg viewBox="-40 -30 260 420" role="presentation">
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset=".5" stopColor={b} />
            <stop offset="1" stopColor={c} />
          </linearGradient>
          <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={a} stopOpacity=".38" />
            <stop offset="1" stopColor={c} stopOpacity="0" />
          </linearGradient>
          <filter id={`b${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="22" />
          </filter>
        </defs>
        <ellipse className={s.fbGlow} cx="90" cy="180" rx="120" ry="170" filter={`url(#b${id})`} />
        <rect className={s.fbBody} x="0" y="0" width="180" height="360" rx="30" />
        <rect x="0.5" y="0.5" width="179" height="359" rx="29.5" fill="none" stroke={`url(#g${id})`} strokeOpacity=".7" strokeWidth="1.5" />
        <rect className={s.fbScreen} x="7" y="7" width="166" height="346" rx="24" />
        <rect className={s.fbIsland} x="66" y="15" width="48" height="13" rx="6.5" />
        <text className={s.fbTitle} x="26" y="88">
          {d.title.length > 22 ? d.title.slice(0, 21) + '…' : d.title}
        </text>
        <text className={s.fbValue} x="25" y="118">
          {d.value}
        </text>
        {d.caption && (
          <text className={s.fbCaption} x="26" y="136">
            {d.caption.length > 28 ? d.caption.slice(0, 27) + '…' : d.caption}
          </text>
        )}
        <path d={`${line} L154,204 L26,204 Z`} fill={`url(#f${id})`} />
        <path d={line} fill="none" stroke={`url(#g${id})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="40" y="318" width="100" height="18" rx="9" fill={`url(#g${id})`} opacity=".22" />
        <rect x="68" y="341" width="44" height="3" rx="1.5" fill="#fff" opacity=".6" />
      </svg>
    </div>
  );
}

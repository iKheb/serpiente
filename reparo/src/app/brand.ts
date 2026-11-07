/**
 * Marca Reparo — fuente única del isotipo (lo usan el Shell, el onboarding y
 * los íconos PWA). Concepto: un celular con un pulso de "signos vitales":
 * el taller que le devuelve la vida a tu equipo.
 */
export const BRAND_NAME = 'Reparo';
export const BRAND_TAGLINE = 'Gestión para tu servicio técnico';

/** Colores del degradado del isotipo (de arriba-izquierda a abajo-derecha). */
export const BRAND_GRADIENT = ['#8b7bff', '#5b8cff', '#22d3ee'] as const;

/** Geometría del isotipo en un viewBox 0 0 64 64. */
export const MARK = {
  viewBox: '0 0 64 64',
  tile: { x: 0, y: 0, w: 64, h: 64, r: 15 },
  phone: { x: 20.5, y: 12, w: 23, h: 40, r: 6.5, stroke: 3.2 },
  speaker: { x1: 29, y1: 17.5, x2: 35, y2: 17.5 },
  pulse: '24.5,33.5 28.5,33.5 31,27 34.5,40.5 37,31.5 39.5,33.5',
} as const;

/** SVG completo del ícono (para favicon / íconos PWA). */
export function brandMarkSVG(size = 512): string {
  const [a, b, c] = BRAND_GRADIENT;
  const { phone: p, speaker: s } = MARK;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${a}"/><stop offset=".5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/>
    </linearGradient>
    <radialGradient id="h" cx="20" cy="8" r="48" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="64" height="64" rx="15" fill="url(#g)"/>
  <rect width="64" height="64" rx="15" fill="url(#h)"/>
  <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.r}" fill="none" stroke="#fff" stroke-width="${p.stroke}"/>
  <line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>
  <polyline points="${MARK.pulse}" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

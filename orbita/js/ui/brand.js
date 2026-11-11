// Marca Órbita (compartido). Isotipo: planeta con anillo orbital y luna; logotipo: "órbita".
let uid = 0;

/** Isotipo SVG. size en px (alto). */
export function markSVG({ size = 32, glow = false } = {}) {
  const id = `om${++uid}`;
  return `<svg class="brand-mark" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <linearGradient id="${id}g" x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#7d8bff"/><stop offset=".5" stop-color="#a35bff"/><stop offset="1" stop-color="#ff5c9d"/>
    </linearGradient>
    <radialGradient id="${id}s" cx="24" cy="22" r="26" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="${id}r" x1="4" y1="44" x2="60" y2="20" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffb35c"/><stop offset=".55" stop-color="#ff5c9d"/><stop offset="1" stop-color="#fff"/>
    </linearGradient>
    ${glow ? `<filter id="${id}f" x="-16" y="-16" width="96" height="96" filterUnits="userSpaceOnUse"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : ''}
  </defs>
  <g ${glow ? `filter="url(#${id}f)"` : ''}>
    <g transform="rotate(-22 32 32)">
      <path d="M3.5 32a28.5 8.6 0 0 1 57 0" fill="none" stroke="url(#${id}r)" stroke-width="2.6" stroke-linecap="round" opacity=".5"/>
    </g>
    <circle cx="32" cy="32" r="16.5" fill="url(#${id}g)"/>
    <circle cx="32" cy="32" r="16.5" fill="url(#${id}s)"/>
    <g transform="rotate(-22 32 32)">
      <path d="M60.5 32a28.5 8.6 0 0 1 -57 0" fill="none" stroke="url(#${id}r)" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="58.6" cy="28.4" r="3.1" fill="#fff"/>
    </g>
  </g>
</svg>`;
}

/** Logotipo completo (isotipo + palabra). */
export function logoHTML({ size = 30, glow = false, word = true } = {}) {
  return `<span class="brand-logo" style="--logo-h:${size}px">${markSVG({ size: size * 1.12, glow })}${word ? '<span class="brand-word">órbita</span>' : ''}</span>`;
}

export const BRAND = { name: 'Órbita', tagline: 'Todo tu entretenimiento, en un solo universo.' };

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
    <linearGradient id="${id}r" x1="4" y1="40" x2="60" y2="24" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffb35c"/><stop offset=".55" stop-color="#ff5c9d"/><stop offset="1" stop-color="#fff"/>
    </linearGradient>
    ${glow ? `<filter id="${id}f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : ''}
  </defs>
  <g ${glow ? `filter="url(#${id}f)"` : ''}>
    <path d="M6.5 41.5c-3.2-5.6 9.4-15.5 28.2-22.1 18.8-6.6 34.4-7.4 37.6-1.8" transform="translate(-6 2)" fill="none" stroke="url(#${id}r)" stroke-width="3.2" stroke-linecap="round" opacity=".55"/>
    <circle cx="32" cy="32" r="17" fill="url(#${id}g)"/>
    <circle cx="32" cy="32" r="17" fill="url(#${id}s)"/>
    <path d="M6.5 41.5c3.2 5.6 18.8 4.8 37.6-1.8 18.8-6.6 31.4-16.5 28.2-22.1" transform="translate(-6 2)" fill="none" stroke="url(#${id}r)" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="53.5" cy="16.5" r="3.4" fill="#fff"/>
  </g>
</svg>`;
}

/** Logotipo completo (isotipo + palabra). */
export function logoHTML({ size = 30, glow = false, word = true } = {}) {
  return `<span class="brand-logo" style="--logo-h:${size}px">${markSVG({ size: size * 1.12, glow })}${word ? '<span class="brand-word">órbita</span>' : ''}</span>`;
}

export const BRAND = { name: 'Órbita', tagline: 'Todo tu entretenimiento, en un solo universo.' };

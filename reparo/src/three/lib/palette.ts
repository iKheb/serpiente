/**
 * Paleta para WebGL/Canvas. Los shaders y CanvasTexture necesitan valores
 * concretos (no pueden leer variables CSS), así que se replican aquí los
 * tokens de la mini-interfaz oscura y el degradado de marca de `@/app/brand`.
 */
import { BRAND_GRADIENT } from '@/app/brand';

export const BRAND = {
  iris: BRAND_GRADIENT[0],
  blue: BRAND_GRADIENT[1],
  cyan: BRAND_GRADIENT[2],
  brand: '#7c6cff',
} as const;

/** Tokens del tema oscuro (la pantalla del teléfono siempre usa la UI oscura). */
export const UI = {
  bg: '#06070a',
  bgSubtle: '#0a0c10',
  surface1: '#0e1015',
  surface2: '#13161d',
  surface3: '#191d26',
  surface4: '#20252f',
  border: 'rgba(255,255,255,0.075)',
  borderStrong: 'rgba(255,255,255,0.12)',
  text: '#eef0f6',
  text2: '#a7adbb',
  text3: '#6f7686',
  text4: '#4a505d',
  income: '#34d6a6',
  expense: '#ff6b85',
  pending: '#f5b947',
  diag: '#c084fc',
  info: '#4db5ff',
} as const;

export const FONT_SANS = `"Geist Variable", "Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
export const FONT_MONO = `"Geist Mono Variable", ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

/** Materiales físicos (valores lineales aproximados de un render de producto). */
export const MAT = {
  titanium: '#8c8f97',
  titaniumDark: '#4a4d55',
  backGlass: '#22242a',
  pcb: '#0e1024',
  copper: '#d0a24c',
  flex: '#c27a22',
  steel: '#b9bdc6',
  chip: '#111217',
} as const;

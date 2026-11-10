/* Escalas y "nice ticks" (algoritmo equivalente a d3.ticks). */

function tickStep(min: number, max: number, count: number): number {
  const raw = (max - min) / Math.max(1, count);
  const power = Math.floor(Math.log10(raw));
  const base = 10 ** power;
  const err = raw / base;
  const factor = err >= 7.07 ? 10 : err >= 3.16 ? 5 : err >= 1.41 ? 2 : 1;
  return factor * base;
}

export interface NiceDomain {
  min: number;
  max: number;
  ticks: number[];
}

/**
 * Dominio "bonito" que SIEMPRE incluye el cero (los montos se comparan contra
 * cero) y redondea a pasos 1/2/5 × 10ⁿ.
 */
export function niceDomain(values: Iterable<number>, count = 4): NiceDomain {
  let lo = 0;
  let hi = 0;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === hi) return { min: 0, max: 1, ticks: [0] };
  let step = tickStep(lo, hi, count);
  let min = Math.floor(lo / step) * step;
  let max = Math.ceil(hi / step) * step;
  // Segunda pasada: el redondeo puede cambiar el paso óptimo.
  const step2 = tickStep(min, max, count);
  if (step2 !== step) {
    step = step2;
    min = Math.floor(lo / step) * step;
    max = Math.ceil(hi / step) * step;
  }
  // Excursiones mínimas al otro lado del cero (p. ej. −$200 con pasos de $5k):
  // en lugar de reservar un paso entero vacío, el dominio se ajusta a los datos
  // con un margen pequeño y el eje no rotula ese tramo.
  const pad = (hi - lo) * 0.06;
  if (lo < 0 && hi > 0 && -lo < step * 0.5) min = lo - pad;
  if (hi > 0 && lo < 0 && hi < step * 0.5) max = hi + pad;
  const ticks: number[] = [];
  const first = Math.ceil(roundFloat(min / step)) * step;
  for (let t = first; t <= max + step * 1e-9; t += step) ticks.push(roundFloat(t));
  return { min: roundFloat(min), max: roundFloat(max), ticks };
}

function roundFloat(v: number): number {
  return Math.round(v * 1e9) / 1e9;
}

/** Escala lineal y = f(v) en píxeles (y crece hacia abajo). */
export function linearY(min: number, max: number, top: number, bottom: number) {
  const span = max - min || 1;
  return (v: number) => top + ((max - v) / span) * (bottom - top);
}

/**
 * Elige qué etiquetas del eje X mostrar para que no se solapen.
 * Siempre conserva la última (lo más reciente es lo más relevante).
 */
export function thinLabels(count: number, available: number, labelWidth: number, gap = 14): Set<number> {
  const shown = new Set<number>();
  if (count <= 0) return shown;
  const max = Math.max(1, Math.floor((available + gap) / (labelWidth + gap)));
  const step = Math.max(1, Math.ceil(count / max));
  for (let i = count - 1; i >= 0; i -= step) shown.add(i);
  return shown;
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

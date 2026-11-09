/**
 * Miniaturas 3D de repuestos. Un único WebGLRenderer fuera de pantalla
 * (cargado de forma diferida) renderiza todas, en cola, con caché por
 * (categoría, tamaño, tema, devicePixelRatio). Devuelve un data URL PNG
 * con fondo transparente.
 */
import type { ExpenseCategory } from '@/data/types';

export interface PartThumbnailOptions {
  size: number;
  theme: 'dark' | 'light';
}

const cache = new Map<string, Promise<string>>();
const resolved = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

function keyOf(kind: ExpenseCategory, o: PartThumbnailOptions) {
  const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 3);
  return `${kind}|${Math.round(o.size)}|${o.theme}|${dpr}`;
}

/** Devuelve la miniatura si ya está en caché (para evitar parpadeos). */
export function peekPartThumbnail(kind: ExpenseCategory, opts: PartThumbnailOptions): string | null {
  return resolved.get(keyOf(kind, opts)) ?? null;
}

export function renderPartThumbnail(kind: ExpenseCategory, opts: PartThumbnailOptions): Promise<string> {
  const key = keyOf(kind, opts);
  const hit = cache.get(key);
  if (hit) return hit;
  const job = queue
    .catch(() => undefined)
    .then(() => new Promise<void>((r) => setTimeout(r, 0)))
    .then(() => import('./lib/thumbRenderer'))
    .then(({ renderThumb }) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      return renderThumb(kind, Math.round(opts.size), opts.theme, dpr);
    });
  queue = job;
  const p = job.then(
    (url) => {
      resolved.set(key, url);
      return url;
    },
    (err) => {
      cache.delete(key);
      throw err;
    },
  );
  cache.set(key, p);
  return p;
}

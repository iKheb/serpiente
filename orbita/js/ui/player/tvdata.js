// =============================================================================
// A5 · Utilidades de TV compartidas por reproductor, En vivo y Guía.
// Solo consume el contrato público de catalog.js / artwork.js.
// =============================================================================
import { CHANNELS, programsFor, getChannel, getTitle } from '../../data/catalog.js';
import { fmtTime, clamp } from '../../core/dom.js';

export const SLOT = 30 * 60 * 1000;
export const MIN = 60 * 1000;

/** Canales ordenados por número (para CH+/CH− y listas) */
export function channelsSorted() {
  return [...CHANNELS].sort((a, b) => (a.number || 0) - (b.number || 0));
}

/** Canales de una categoría ('Todos' = todos). Perfil infantil → solo Infantil. */
export function channelsIn(category = 'Todos', { kids = false } = {}) {
  let list = channelsSorted();
  if (kids) list = list.filter((c) => /infantil/i.test(c.category || ''));
  if (!category || category === 'Todos') return list;
  return list.filter((c) => (c.category || '') === category);
}

/** { now, next, later[] } para un canal */
export function nowNext(channelId, at = Date.now()) {
  const list = programsFor(channelId, at - 6 * SLOT, at + 10 * SLOT);
  const i = list.findIndex((p) => p.start <= at && p.end > at);
  if (i < 0) return { now: null, next: list.find((p) => p.start > at) || null, later: [] };
  return { now: list[i], next: list[i + 1] || null, later: list.slice(i + 1, i + 5) };
}

export const progressOf = (p, at = Date.now()) => (p ? clamp((at - p.start) / (p.end - p.start), 0, 1) : 0);
export const fmtRange = (p) => (p ? `${fmtTime(p.start)} – ${fmtTime(p.end)}` : '');
export const minutesLeft = (p, at = Date.now()) => (p ? Math.max(1, Math.round((p.end - at) / MIN)) : 0);
export const durationMin = (p) => (p ? Math.round((p.end - p.start) / MIN) : 0);
export const isLive = (p, at = Date.now()) => !!p && p.start <= at && p.end > at;

export function leftLabel(p, at = Date.now()) {
  const m = minutesLeft(p, at);
  return m >= 60 ? `Quedan ${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim() : `Quedan ${m} min`;
}

/** Hash FNV-1a → entero sin signo (semillas deterministas) */
export function hashStr(s) {
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Icono para un género de programa/categoría */
export function genreIcon(g = '') {
  const n = String(g).toLowerCase();
  if (/deport|fútbol|futbol|motor/.test(n)) return 'sport';
  if (/notic|informa/.test(n)) return 'news';
  if (/cine|pel/.test(n)) return 'film';
  if (/serie/.test(n)) return 'series';
  if (/infan|niñ|kids/.test(n)) return 'kids';
  if (/docu/.test(n)) return 'globe';
  if (/músic|music/.test(n)) return 'music';
  if (/internac/.test(n)) return 'globe';
  if (/todos/.test(n)) return 'grid';
  return 'tv';
}

/** Asigna una URL (Promise<string>) a un <img> con fundido al cargar */
export function setImg(img, promise) {
  if (!img || !promise) return;
  Promise.resolve(promise).then((url) => {
    if (!url) return;
    img.onload = () => img.classList.add('is-loaded');
    img.src = url;
  }).catch(() => {});
}

/** Busca un título del catálogo con el mismo nombre que un programa (para enlazar ficha) */
export function titleForProgram(p) {
  if (!p) return null;
  try {
    const n = p.title.toLowerCase();
    return getTitle('t-' + n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) || null;
  } catch { return null; }
}

export { getChannel, programsFor, fmtTime };

/** Paleta segura (al menos 3 colores) */
export function palette3(p = []) {
  const a = p[0] || '#1b1f3a', b = p[1] || '#6d7cff', c = p[2] || b;
  return [a, b, c];
}

/** Color hexadecimal → rgba con alfa */
export function rgba(hex, a = 1) {
  const m = String(hex || '').replace('#', '');
  const v = m.length === 3 ? m.split('').map((x) => x + x).join('') : m.padEnd(6, '0');
  const n = parseInt(v.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Orden de clasificación por edades */
export const RATINGS = ['TP', '7', '12', '16', '18'];
export const ratingAllowed = (rating, max) => RATINGS.indexOf(String(rating || 'TP')) <= RATINGS.indexOf(String(max || '18'));
/** Límite efectivo para el perfil (perfil infantil → como mucho 7) */
export function parentalLimit(store) {
  const set = store.setting('parental') || '18';
  const kids = !!store.profile()?.kids;
  if (kids && RATINGS.indexOf(set) > 1) return '7';
  return set;
}
export const ratingLabel = (r) => (r === 'TP' ? 'TP' : `${r}+`);

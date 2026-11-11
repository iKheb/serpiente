// =============================================================================
// Órbita · Formato de metadatos (A4) — funciones puras reutilizables.
// =============================================================================
import { fmtDuration } from '../../core/dom.js';
import { rowsFor, TITLES } from '../../data/catalog.js';

export const TYPE_LABEL = { movie: 'Película', series: 'Serie', event: 'Evento' };
export const TYPE_PLURAL = { movie: 'películas', series: 'series', event: 'eventos' };

/** "16+" · "TP" */
export const ratingLabel = (r) => (!r ? '' : r === 'TP' ? 'TP' : `${r}+`);

/** Duración legible según el tipo: "1 h 58 min" · "2 temporadas" · "8 episodios" · "En directo" */
export function durationLabel(t) {
  if (!t) return '';
  if (t.type === 'series') {
    const n = t.seasons?.length || 0;
    if (n > 1) return `${n} temporadas`;
    const eps = t.seasons?.[0]?.episodes?.length || 0;
    return eps ? `${eps} episodio${eps === 1 ? '' : 's'}` : '1 temporada';
  }
  if (t.type === 'event') return 'En directo';
  return fmtDuration(t.duration);
}

/** "S1E2" | "s1e2" → { s:1, e:2 } */
export function parseEp(ep) {
  const m = /s(\d+)\s*e(\d+)/i.exec(String(ep || ''));
  return m ? { s: Number(m[1]), e: Number(m[2]) } : null;
}
/** { s, e } → "s1e2" (formato de ruta) */
export const epRoute = (s, e) => `s${s}e${e}`;
/** "T1:E2" */
export const epShort = (s, e) => `T${s}:E${e}`;

export function episodeOf(t, s, e) {
  return t?.seasons?.find((x) => x.n === s)?.episodes?.find((x) => x.n === e) || null;
}

/** Minutos restantes a partir de un progreso { t, d } en segundos */
export function remainingLabel(p) {
  if (!p || !p.d) return '';
  const min = Math.max(1, Math.round((p.d - p.t) / 60));
  return `Quedan ${fmtDuration(min)}`;
}
export const progressPct = (p) => (p && p.d ? Math.max(0, Math.min(100, (p.t / p.d) * 100)) : 0);

/** Ruta de reproducción considerando el progreso guardado */
export function playRoute(t, prog) {
  if (!t) return 'inicio';
  const ep = parseEp(prog?.ep);
  if (t.type === 'series') {
    if (ep) return `ver/${t.id}/${epRoute(ep.s, ep.e)}`;
    return `ver/${t.id}/${epRoute(1, 1)}`;
  }
  return `ver/${t.id}`;
}

// Ranking "Top 10" (posición en la fila top10 de Inicio)
let RANK = null;
export function rankOf(id) {
  if (!RANK) {
    RANK = new Map();
    try {
      const row = rowsFor('inicio').find((r) => r.kind === 'top10');
      (row?.items || []).forEach((t, i) => RANK.set(t.id, i + 1));
    } catch { /* catálogo sin filas */ }
  }
  return RANK.get(id) || 0;
}

/** Títulos similares: comparten género, ordenados por coincidencia */
export function similarTo(t, { kids = false, limit = 12 } = {}) {
  const pool = TITLES.filter((x) => x.id !== t.id && (!kids || x.kids));
  const score = (x) => x.genres.filter((g) => t.genres.includes(g)).length * 100 + (x.type === t.type ? 20 : 0) + (x.match || 0) / 10;
  const same = pool.filter((x) => x.genres.some((g) => t.genres.includes(g))).sort((a, b) => score(b) - score(a));
  const rest = pool.filter((x) => !same.includes(x)).sort((a, b) => (b.match || 0) - (a.match || 0));
  return same.concat(rest).slice(0, limit);
}

export const joinDot = (arr) => arr.filter(Boolean).join(' · ');

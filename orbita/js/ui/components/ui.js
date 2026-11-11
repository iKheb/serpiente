// =============================================================================
// Órbita · Primitivas de interfaz (A4): botones, chips e insignias.
// Todas devuelven cadenas HTML para componer con innerHTML + delegación de eventos.
//
//   button({ label, icon, variant, size, act, attrs, cls, iconFill, disabled })
//     variant: 'primary' | 'secondary' | 'ghost' | 'brand' | 'danger'
//     size:    'sm' | 'md' | 'lg'
//   iconButton({ icon, label, act, variant='glass', size, pressed, cls, attrs, showLabel })
//   chip({ label, active, act, attrs, icon })
//   badges: qualityBadges(t) · ratingBadge(r) · originalBadge(t) · top10Badge(rank, t)
//           newBadge(text) · liveBadge(text) · matchLabel(n)
// =============================================================================
import { icon } from '../icons.js';
import { markSVG } from '../brand.js';
import { esc } from '../../core/dom.js';
import { ratingLabel, TYPE_PLURAL } from './format.js';

const attrsOf = (attrs = {}) => Object.entries(attrs)
  .filter(([, v]) => v != null && v !== false)
  .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${esc(v)}"`)).join('');

export function button({ label = '', icon: ic, variant = 'secondary', size = 'md', act, attrs, cls = '', iconFill = false, disabled = false, sub } = {}) {
  const a = { ...(attrs || {}) };
  if (act) a['data-act'] = act;
  if (disabled) a.disabled = true;
  return `<button class="btn btn-${variant} btn-${size} focusable ${cls}"${attrsOf(a)}>`
    + (ic ? icon(ic, { size: 22, fill: iconFill, cls: 'btn-ico' }) : '')
    + `<span class="btn-label">${esc(label)}</span>`
    + (sub ? `<span class="btn-sub">${sub}</span>` : '')
    + `</button>`;
}

/** Botón redondo de icono. showLabel → etiqueta visible (TV/móvil) además del tooltip. */
export function iconButton({ icon: ic, label, act, variant = 'glass', size = 'md', pressed, cls = '', attrs, iconFill = false, showLabel = false } = {}) {
  const a = { 'aria-label': label, 'data-tip': label, ...(attrs || {}) };
  if (act) a['data-act'] = act;
  if (pressed != null) a['aria-pressed'] = pressed ? 'true' : 'false';
  return `<button class="ibtn ibtn-${variant} ibtn-${size} focusable ${showLabel ? 'has-label' : ''} ${cls}"${attrsOf(a)}>`
    + `<span class="ibtn-disc">${icon(ic, { size: 22, fill: iconFill })}</span>`
    + (showLabel ? `<span class="ibtn-label">${esc(label)}</span>` : '')
    + `</button>`;
}

export function chip({ label, active = false, act, attrs, icon: ic } = {}) {
  const a = { 'aria-pressed': active ? 'true' : 'false', ...(attrs || {}) };
  if (act) a['data-act'] = act;
  return `<button class="chip focusable${active ? ' is-active' : ''}"${attrsOf(a)}>${ic ? icon(ic, { size: 16 }) : ''}<span>${esc(label)}</span></button>`;
}

// -----------------------------------------------------------------------------
// Insignias
export function qualityBadges(t, { compact = false } = {}) {
  if (!t) return '';
  const out = [];
  if (t.quality) out.push(`<span class="badge badge-q${t.quality === '4K' ? ' is-uhd' : ''}" title="Calidad ${esc(t.quality)}">${esc(t.quality === 'FHD' ? 'HD' : t.quality)}</span>`);
  if (t.hdr) out.push('<span class="badge badge-q" title="Alto rango dinámico">HDR</span>');
  if (t.dolby && !compact) out.push(`<span class="badge badge-q badge-audio" title="Sonido envolvente espacial">${icon('audio', { size: 12, stroke: 2.4 })}5.1</span>`);
  return out.join('');
}

export const ratingBadge = (r) => (r ? `<span class="badge badge-rating" title="Edad recomendada: ${esc(ratingLabel(r))}">${esc(ratingLabel(r))}</span>` : '');

/** "ÓRBITA ORIGINAL · SERIE" — isotipo + texto espaciado */
export function originalBadge(t) {
  if (!t?.tags?.includes('original') && !t?.tags?.includes('exclusivo')) return '';
  const kind = t.tags.includes('original') ? 'Original' : 'Exclusivo';
  const type = { movie: 'Película', series: 'Serie', event: 'Evento' }[t.type] || '';
  return `<span class="badge-original">${markSVG({ size: 22 })}<span class="bo-text"><b>Órbita ${kind}</b>${type ? `<i>${type}</i>` : ''}</span></span>`;
}

export function top10Badge(rank, t) {
  if (!rank) return '';
  const where = t ? ` en ${TYPE_PLURAL[t.type] || 'Órbita'}` : '';
  return `<span class="badge-top10"><span class="bt-box" aria-hidden="true"><b>TOP</b><b>10</b></span><span class="bt-text">Nº ${rank}${where} hoy</span></span>`;
}

export const newBadge = (text = 'Estreno') => `<span class="badge badge-new">${esc(text)}</span>`;
export const liveBadge = (text = 'En vivo') => `<span class="badge-live">${esc(text)}</span>`;
export const matchLabel = (n) => (n ? `<span class="meta-match">${n} % para ti</span>` : '');

/** Mini insignia TOP 10 para esquinas de tarjeta */
export const top10Corner = () => '<span class="corner-top10" aria-label="Top 10"><b>TOP</b><b>10</b></span>';
export const originalCorner = () => `<span class="corner-mark" aria-hidden="true">${markSVG({ size: 18 })}</span>`;

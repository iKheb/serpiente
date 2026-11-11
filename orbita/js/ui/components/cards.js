// =============================================================================
// Órbita · Tarjetas (A4)
//   posterCard(t)                    2:3, insignias de esquina, leyenda en foco TV
//   landscapeCard(t, { live })       16:9 fondo + logo de título
//   top10Card(t, rank)               número gigante con contorno + póster solapado
//   continueCard(t, prog)            16:9 con barra de progreso y "Quedan…"
//   channelCard(c, program)          logo de canal, EN VIVO, programa actual + progreso
//   updateChannelCard(el, program)   refresca programa/progreso sin re-render
// Todas son <button class="card … focusable" data-id> (canales: data-channel).
// =============================================================================
import { icon } from '../icons.js';
import { esc, fmtTime } from '../../core/dom.js';
import { artTag } from './art.js';
import { durationLabel, ratingLabel, joinDot, remainingLabel, progressPct, parseEp, epShort, episodeOf } from './format.js';
import { top10Corner, originalCorner, newBadge, liveBadge } from './ui.js';

function corners(t) {
  const tags = t.tags || [];
  let html = '';
  if (tags.includes('original')) html += originalCorner();
  if (tags.includes('top10')) html += top10Corner();
  if (tags.includes('nuevo')) html += `<span class="corner-ribbon">${newBadge(t.type === 'series' ? 'Nuevos episodios' : 'Estreno')}</span>`;
  return html;
}

/** Leyenda (visible en foco TV) */
function caption(t) {
  return `<span class="card-cap" aria-hidden="true"><span class="cc-title">${esc(t.title)}</span>`
    + `<span class="cc-meta">${t.match ? `<b>${t.match} %</b>` : ''}${esc(joinDot([String(t.year || ''), ratingLabel(t.rating), durationLabel(t)]))}</span></span>`;
}

export function posterCard(t, { cls = '' } = {}) {
  return `<button class="card card-poster focusable ${cls}" data-id="${esc(t.id)}" aria-label="${esc(t.title)}">`
    + `<span class="card-art skeleton">${artTag('poster', t.id)}<span class="card-sheen"></span>${corners(t)}</span>`
    + caption(t)
    + `</button>`;
}

export function landscapeCard(t, { live = false, cls = '' } = {}) {
  return `<button class="card card-landscape focusable ${cls}" data-id="${esc(t.id)}" aria-label="${esc(t.title)}">`
    + `<span class="card-art skeleton">${artTag('backdrop', t.id)}<span class="card-shade"></span>`
    + `<span class="card-logo">${artTag('logo', t.id, { alt: t.title })}<span class="card-logo-text">${esc(t.title)}</span></span>`
    + (live ? `<span class="corner-live">${liveBadge()}</span>` : '')
    + corners(t) + `<span class="card-sheen"></span></span>`
    + caption(t)
    + `</button>`;
}

let numId = 0;
function rankSVG(rank) {
  const id = `r10_${++numId}`;
  const txt = String(rank);
  const two = txt.length > 1;
  return `<svg class="t10-svg" viewBox="0 0 ${two ? 150 : 100} 150" preserveAspectRatio="xMaxYMax meet" aria-hidden="true">
<defs>
<linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2f5c"/><stop offset=".55" stop-color="#0d1024"/><stop offset="1" stop-color="#05060d"/></linearGradient>
<linearGradient id="${id}s" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#c9c2ff" stop-opacity=".7"/><stop offset="1" stop-color="#8b7bff" stop-opacity=".25"/></linearGradient>
</defs>
<text x="${two ? 150 : 100}" y="147" text-anchor="end" font-family="Outfit, Inter, sans-serif" font-weight="900" font-size="178" letter-spacing="${two ? -14 : 0}" fill="url(#${id}f)" stroke="url(#${id}s)" stroke-width="3.2" paint-order="stroke" stroke-linejoin="round">${txt}</text>
</svg>`;
}

export function top10Card(t, rank, { cls = '' } = {}) {
  return `<button class="card card-top10 focusable ${rank >= 10 ? 'is-two' : ''} ${cls}" data-id="${esc(t.id)}" aria-label="Número ${rank}: ${esc(t.title)}">`
    + `<span class="t10-num">${rankSVG(rank)}</span>`
    + `<span class="card-art skeleton">${artTag('poster', t.id)}<span class="card-sheen"></span></span>`
    + caption(t)
    + `</button>`;
}

export function continueCard(t, prog, { cls = '' } = {}) {
  const ep = parseEp(prog?.ep);
  const epi = ep ? episodeOf(t, ep.s, ep.e) : null;
  const pct = progressPct(prog);
  const sub = ep ? `${epShort(ep.s, ep.e)}${epi ? ` · ${esc(epi.title)}` : ''}` : esc(remainingLabel(prog) || durationLabel(t));
  const art = ep ? artTag('thumb', t.id, { s: ep.s, e: ep.e }) : artTag('backdrop', t.id);
  return `<button class="card card-continue focusable ${cls}" data-id="${esc(t.id)}" data-resume="1" aria-label="Seguir viendo ${esc(t.title)}">`
    + `<span class="card-art skeleton">${art}<span class="card-shade"></span>`
    + `<span class="cont-play" aria-hidden="true">${icon('play', { size: 26, fill: true })}</span>`
    + `<span class="cont-title">${esc(t.title)}</span>`
    + `<span class="pbar"><i style="width:${pct.toFixed(1)}%"></i></span><span class="card-sheen"></span></span>`
    + `<span class="card-info"><span class="ci-sub">${sub}</span>${ep ? `<span class="ci-rem">${esc(remainingLabel(prog))}</span>` : ''}</span>`
    + `</button>`;
}

function programInfo(program) {
  if (!program) return { title: 'Programación continua', time: '', pct: 0 };
  const pct = Math.max(0, Math.min(100, ((Date.now() - program.start) / (program.end - program.start)) * 100));
  return { title: program.title, time: `${fmtTime(program.start)} – ${fmtTime(program.end)}`, pct };
}

export function channelCard(c, program, { cls = '' } = {}) {
  const p = programInfo(program);
  const [c1, c2] = c.art?.palette || ['#6d7cff', '#ff5c9d'];
  return `<button class="card card-channel focusable ${cls}" data-channel="${esc(c.id)}" style="--c1:${esc(c1)};--c2:${esc(c2)}" aria-label="${esc(c.name)}, en vivo: ${esc(p.title)}">`
    + `<span class="card-art ch-art"><span class="ch-glow" aria-hidden="true"></span><span class="ch-grain" aria-hidden="true"></span>`
    + `<span class="ch-logo skeleton">${artTag('channel', c.id, { alt: c.name })}</span>`
    + `<span class="ch-top">${liveBadge()}<span class="ch-num">${String(c.number).padStart(2, '0')}</span></span>`
    + `<span class="ch-q">${esc(c.quality || '')}</span>`
    + `<span class="pbar pbar-live"><i style="width:${p.pct.toFixed(1)}%"></i></span><span class="card-sheen"></span></span>`
    + `<span class="card-info"><span class="ci-title">${esc(p.title)}</span><span class="ci-sub">${esc(joinDot([c.name, p.time]))}</span></span>`
    + `</button>`;
}

export function updateChannelCard(el, c, program) {
  const p = programInfo(program);
  const t = el.querySelector('.ci-title'); if (t && t.textContent !== p.title) t.textContent = p.title;
  const s = el.querySelector('.ci-sub'); if (s) s.textContent = joinDot([c.name, p.time]);
  const bar = el.querySelector('.pbar i'); if (bar) bar.style.width = p.pct.toFixed(1) + '%';
}

/** Tarjeta de esqueleto (para filas aún sin datos) */
export const skeletonCard = (kind = 'poster') => `<span class="card card-${kind} card-ghost" aria-hidden="true"><span class="card-art skeleton"></span></span>`;

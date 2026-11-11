// =============================================================================
// Órbita · Filas de contenido (A4)
//   rowHTML(row, { device, progress, nowOn })  Row { id, title, kind, items }
//       kind ∈ poster | landscape | top10 | continue | channels | live
//   bindRows(root, { device })  → flechas de desplazamiento (escritorio), estado de flechas,
//       fila activa (foco), arrastre con rueda horizontal. Devuelve función de limpieza.
// Marcado: section.row[data-lazy] > .row-head + .row-viewport > .row-track[data-nav-group][data-nav-scroll]
// =============================================================================
import { icon } from '../icons.js';
import { esc } from '../../core/dom.js';
import { posterCard, landscapeCard, top10Card, continueCard, channelCard } from './cards.js';

export function cardFor(kind, item, i, ctx = {}) {
  switch (kind) {
    case 'landscape': return landscapeCard(item);
    case 'live': return landscapeCard(item, { live: true });
    case 'top10': return top10Card(item, i + 1);
    case 'continue': return continueCard(item.title, item.progress);
    case 'channels': return channelCard(item, ctx.nowOn ? ctx.nowOn(item.id) : null);
    default: return posterCard(item);
  }
}

export function rowHTML(row, { device, nowOn } = {}) {
  const kind = row.kind || 'poster';
  const scroll = device?.isTV ? 'x-start' : 'x';
  const icn = { channels: 'live', top10: 'trending', continue: 'history' }[kind];
  return `<section class="row row-${kind}" data-row="${esc(row.id)}" data-lazy>`
    + `<header class="row-head"><h2 class="row-title">${icn ? `<span class="row-ico">${icon(icn, { size: 18 })}</span>` : ''}${esc(row.title)}</h2>`
    + (kind === 'channels' ? '<span class="row-hint">Directo</span>' : '')
    + `</header>`
    + `<div class="row-viewport">`
    + `<button class="row-arrow is-prev" tabindex="-1" aria-label="Anteriores" data-dir="-1">${icon('left', { size: 30, stroke: 2.5 })}</button>`
    + `<div class="row-track" data-nav-group data-nav-scroll="${scroll}" data-nav-pad="${device?.isTV ? 0 : 64}">`
    + row.items.map((it, i) => cardFor(kind, it, i, { nowOn })).join('')
    + `</div>`
    + `<button class="row-arrow is-next" tabindex="-1" aria-label="Siguientes" data-dir="1">${icon('right', { size: 30, stroke: 2.5 })}</button>`
    + `</div></section>`;
}

function updateArrows(track) {
  const vp = track.parentElement;
  const max = track.scrollWidth - track.clientWidth - 2;
  vp.classList.toggle('can-prev', track.scrollLeft > 2);
  vp.classList.toggle('can-next', track.scrollLeft < max);
}

export function bindRows(root) {
  const offs = [];
  const tracks = Array.from(root.querySelectorAll('.row-track'));
  const onScroll = (e) => updateArrows(e.currentTarget);
  for (const tr of tracks) {
    tr.addEventListener('scroll', onScroll, { passive: true });
    updateArrows(tr);
    offs.push(() => tr.removeEventListener('scroll', onScroll));
  }
  const onClick = (e) => {
    const a = e.target.closest('.row-arrow');
    if (!a || !root.contains(a)) return;
    e.preventDefault(); e.stopPropagation();
    const track = a.parentElement.querySelector('.row-track');
    const dir = Number(a.dataset.dir);
    const step = Math.max(200, track.clientWidth - 120);
    track.scrollBy({ left: dir * step, behavior: 'smooth' });
  };
  root.addEventListener('click', onClick, true);
  offs.push(() => root.removeEventListener('click', onClick, true));

  // Fila activa (TV / teclado): resalta la fila que contiene el foco
  let activeRow = null;
  const onFocus = (e) => {
    const row = e.target.closest?.('.row');
    if (row === activeRow) return;
    activeRow?.classList.remove('is-active');
    activeRow = row && root.contains(row) ? row : null;
    activeRow?.classList.add('is-active');
    root.classList.toggle('has-active-row', !!activeRow && !e.detail?.silent);
  };
  root.addEventListener('nav:focus', onFocus);
  offs.push(() => root.removeEventListener('nav:focus', onFocus));

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => tracks.forEach(updateArrows)) : null;
  tracks.forEach((t) => ro?.observe(t));
  offs.push(() => ro?.disconnect());
  return () => offs.forEach((f) => f());
}

// =============================================================================
// Órbita · Tarjeta expandida al pasar el ratón (A4, solo puntero fino)
//   const hc = createHoverCard(host, { ctx, onAction })   host = contenedor con scroll
//   hc.hide() · hc.destroy()
// onAction(act, title, { resume }) con act ∈ play | info | list | like
// La tarjeta crece desde la posición de la original, muestra fondo + logo, acciones y meta.
// =============================================================================
import { icon } from '../icons.js';
import { esc } from '../../core/dom.js';
import { getTitle } from '../../data/catalog.js';
import { artTag, loadArt } from './art.js';
import { qualityBadges, ratingBadge, matchLabel } from './ui.js';
import { durationLabel, parseEp, epShort, episodeOf, progressPct, remainingLabel } from './format.js';

const ENTER_DELAY = 480;

export function createHoverCard(host, { ctx, onAction }) {
  const { store } = ctx;
  const el = document.createElement('div');
  el.className = 'hovercard';
  el.setAttribute('aria-hidden', 'true');
  host.append(el);
  let timer = 0, hideT = 0, card = null, title = null, open = false, resume = false;

  function html(t) {
    const prog = store.progressOf(t.id);
    const ep = parseEp(prog?.ep);
    const epi = ep ? episodeOf(t, ep.s, ep.e) : null;
    const inList = store.inList(t.id);
    const liked = store.likeOf(t.id) > 0;
    const media = ep && resume ? artTag('thumb', t.id, { s: ep.s, e: ep.e }) : artTag('backdrop', t.id);
    const genres = (t.genres || []).slice(0, 3).map((g) => `<span>${esc(g)}</span>`).join('<i class="dot"></i>');
    return `<div class="hc-media skeleton" data-act="info">${media}<span class="hc-shade"></span>`
      + `<span class="hc-logo">${artTag('logo', t.id, { alt: t.title })}<span class="hc-logo-text">${esc(t.title)}</span></span>`
      + (prog ? `<span class="pbar"><i style="width:${progressPct(prog).toFixed(1)}%"></i></span>` : '')
      + `</div><div class="hc-body">`
      + `<div class="hc-actions">`
      + `<button class="hc-btn is-play" tabindex="-1" data-act="play" aria-label="${prog ? 'Reanudar' : 'Reproducir'}">${icon('play', { size: 20, fill: true })}</button>`
      + `<button class="hc-btn${inList ? ' is-on' : ''}" tabindex="-1" data-act="list" data-tip="${inList ? 'Quitar de Mi lista' : 'Añadir a Mi lista'}" aria-label="Mi lista">${icon(inList ? 'check' : 'plus', { size: 20, stroke: 2.4 })}</button>`
      + `<button class="hc-btn${liked ? ' is-on' : ''}" tabindex="-1" data-act="like" data-tip="Me gusta" aria-label="Me gusta">${icon('thumbUp', { size: 18, fill: liked })}</button>`
      + `<span class="hc-flex"></span>`
      + `<button class="hc-btn" tabindex="-1" data-act="info" data-tip="Más información" aria-label="Más información">${icon('down', { size: 22, stroke: 2.4 })}</button>`
      + `</div>`
      + (prog ? `<div class="hc-resume">${ep ? `<b>${epShort(ep.s, ep.e)}</b> ${esc(epi?.title || '')} · ` : ''}${esc(remainingLabel(prog))}</div>` : '')
      + `<div class="hc-meta">${matchLabel(t.match)}${ratingBadge(t.rating)}<span>${esc(durationLabel(t))}</span>${qualityBadges(t, { compact: true })}</div>`
      + `<div class="hc-genres">${genres}</div>`
      + `</div>`;
  }

  function place(c) {
    const art = c.querySelector('.card-art') || c;
    const r = art.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    const portrait = r.height > r.width;
    const W = Math.round(Math.min(Math.max(portrait ? r.width * 1.9 : r.width * 1.42, 300), 440));
    const mediaH = W * 9 / 16;
    const pad = Math.max(16, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-x')) || 16);
    const cx = r.left + r.width / 2 - hr.left;
    const cy = r.top + r.height / 2 - hr.top + host.scrollTop;
    let left = cx - W / 2;
    left = Math.max(pad, Math.min(hr.width - pad - W - 12, left));
    const top = Math.max(host.scrollTop + 76, cy - mediaH / 2 - (portrait ? 0 : 6));
    el.style.width = W + 'px';
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.transformOrigin = `${cx - left}px ${cy - top}px`;
    el.style.setProperty('--s0', (r.width / W).toFixed(3));
  }

  function show(c) {
    const id = c.dataset.id;
    const t = getTitle(id);
    if (!t) return;
    card = c; title = t; resume = c.hasAttribute('data-resume');
    el.innerHTML = html(t);
    el.querySelectorAll('img[data-art]').forEach((i) => loadArt(i, { priority: true }));
    place(c);
    el.classList.remove('is-open');
    void el.offsetWidth;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    c.classList.add('is-hovered');
    open = true;
  }

  function hide() {
    clearTimeout(timer); clearTimeout(hideT);
    if (!open) { card = null; return; }
    open = false;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    card?.classList.remove('is-hovered');
    card = null;
  }

  const fine = () => !document.documentElement.classList.contains('kbd-nav');

  const onOver = (e) => {
    if (e.pointerType !== 'mouse' || !fine()) return;
    if (el.contains(e.target)) { clearTimeout(hideT); return; }
    const c = e.target.closest('.card[data-id]');
    if (!c || !host.contains(c) || c.closest('.hovercard')) return;
    if (c === card && open) { clearTimeout(hideT); return; }
    clearTimeout(timer); clearTimeout(hideT);
    const delay = open ? 140 : ENTER_DELAY;
    if (open) hide();
    timer = setTimeout(() => { if (c.matches(':hover')) show(c); }, delay);
  };
  const onOut = (e) => {
    if (e.pointerType !== 'mouse') return;
    const to = e.relatedTarget;
    if (to && (el.contains(to) || (card && card.contains(to)))) return;
    const c = e.target.closest?.('.card[data-id]');
    if (c && !open) { clearTimeout(timer); return; }
    if (open && (el.contains(e.target) || (card && card.contains(e.target)))) {
      clearTimeout(hideT);
      hideT = setTimeout(hide, 90);
    }
  };
  const onClick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !title) return;
    e.stopPropagation();
    const act = b.dataset.act;
    onAction?.(act, title, { resume });
    if (act === 'list' || act === 'like') {
      const keep = card;
      el.innerHTML = html(title);
      el.querySelectorAll('img[data-art]').forEach((i) => loadArt(i, { priority: true }));
      card = keep;
    } else hide();
  };
  const onScroll = () => hide();
  const onKey = () => hide();

  host.addEventListener('pointerover', onOver);
  host.addEventListener('pointerout', onOut);
  el.addEventListener('click', onClick);
  host.addEventListener('scroll', onScroll, { passive: true, capture: true });
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', onScroll);

  return {
    hide,
    destroy() {
      hide();
      host.removeEventListener('pointerover', onOver);
      host.removeEventListener('pointerout', onOut);
      host.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onScroll);
      el.remove();
    },
  };
}

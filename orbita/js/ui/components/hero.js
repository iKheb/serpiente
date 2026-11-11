// =============================================================================
// Órbita · Hero de destacados (A4)
// El fondo cinematográfico lo pinta `stage` (A1) detrás de la app; aquí va la capa de
// información: logo de título, insignias, meta, sinopsis, acciones, paginación y autoavance.
// Si #stage no tiene canvas (sin WebGL), se usa un fondo DOM de respaldo con artwork.backdrop.
//
//   const hero = createHero(el, { items, ctx, onAction })
//   hero.go(i, dir) · hero.next() · hero.prev() · hero.setScroll(p) · hero.focusPrimary()
//   hero.refreshState() (Mi lista/progreso) · hero.destroy() · hero.current (Title)
// onAction(act, title) con act ∈ play | info | list
// =============================================================================
import { icon } from '../icons.js';
import { esc } from '../../core/dom.js';
import { artwork } from '../../gfx/artwork.js';
import { stage } from '../../gfx/hero3d.js';
import { button, iconButton, qualityBadges, ratingBadge, originalBadge, top10Badge, matchLabel } from './ui.js';
import { durationLabel, rankOf, parseEp, epShort, progressPct } from './format.js';

const DURATION = 9000;

export function createHero(el, { items, ctx, onAction }) {
  const { store, device, bus, nav } = ctx;
  let index = 0;
  let alive = true;
  let elapsed = 0;
  let last = performance.now();
  let raf = 0;
  let hovered = false;
  let overlayOpen = false;
  let scrolledAway = false;
  let focusInHero = false;
  let lastUserNav = 0;
  let swapToken = 0;
  const offs = [];

  el.classList.add('hero');
  el.innerHTML = `
    <div class="hero-fallback" aria-hidden="true"><div class="hf-layer"></div><div class="hf-layer"></div></div>
    <div class="hero-scrim" aria-hidden="true"></div>
    <div class="hero-body">
      <div class="hero-copy"></div>
      <div class="hero-actions" data-nav-group>
        ${button({ label: 'Reproducir', icon: 'play', iconFill: true, variant: 'primary', size: 'lg', act: 'play', attrs: { 'data-nav-default': true } })}
        ${button({ label: 'Más información', icon: 'info', variant: 'secondary', size: 'lg', act: 'info', cls: 'hero-info-btn' })}
        ${iconButton({ icon: 'plus', label: 'Añadir a Mi lista', act: 'list', variant: 'glass', size: 'lg', cls: 'hero-list-btn' })}
      </div>
      ${items.length > 1 ? `<div class="hero-pager" role="tablist" aria-label="Destacados">${items.map((t, i) => `<button class="hp-dot" role="tab" tabindex="-1" data-i="${i}" aria-label="${esc(t.title)}"><i></i></button>`).join('')}</div>` : ''}
    </div>
    ${items.length > 1 && !device.touch ? `<button class="hero-nav is-prev" tabindex="-1" aria-label="Destacado anterior" data-hero-dir="-1">${icon('left', { size: 34, stroke: 2.2 })}</button>
    <button class="hero-nav is-next" tabindex="-1" aria-label="Destacado siguiente" data-hero-dir="1">${icon('right', { size: 34, stroke: 2.2 })}</button>` : ''}`;

  const copy = el.querySelector('.hero-copy');
  const playBtn = el.querySelector('[data-act="play"]');
  const listBtn = el.querySelector('[data-act="list"]');
  const dots = Array.from(el.querySelectorAll('.hp-dot'));
  const fbLayers = Array.from(el.querySelectorAll('.hf-layer'));
  let fbFront = 0;

  // ---------------------------------------------------------------------------
  // Escenario 3D
  const hasStage = () => !!document.querySelector('#stage canvas');
  const checkStage = () => el.classList.toggle('no-stage', !hasStage());
  checkStage();
  const stT = [setTimeout(checkStage, 900), setTimeout(checkStage, 2600)];
  try {
    stage.setItems(items.map((t) => ({ id: t.id, title: t.title, palette: t.art?.palette, layers: artwork.layers(t) })));
    stage.show(0, { direction: 1 });
  } catch (e) { console.warn('[hero] stage', e); }

  function fallbackTo(t) {
    artwork.backdrop(t).then((url) => {
      if (!alive || items[index] !== t) return;
      const next = fbLayers[1 - fbFront];
      const img = new Image();
      img.onload = () => {
        if (!alive) return;
        next.style.backgroundImage = `url("${url}")`;
        next.classList.remove('is-front'); void next.offsetWidth; next.classList.add('is-front');
        fbLayers[fbFront].classList.remove('is-front');
        fbFront = 1 - fbFront;
      };
      img.src = url;
    }).catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // Contenido
  function copyHTML(t) {
    const rank = rankOf(t.id);
    const genres = (t.genres || []).slice(0, 3).map((g) => `<span>${esc(g)}</span>`).join('<i class="dot" aria-hidden="true"></i>');
    return `
      <div class="hero-kicker">${originalBadge(t)}</div>
      <h2 class="hero-title"><img class="hero-logo" alt="" draggable="false"><span class="hero-title-text">${esc(t.title)}</span><span class="sr-only">${esc(t.title)}</span></h2>
      <div class="hero-meta">${matchLabel(t.match)}<span class="meta-year">${esc(t.year || '')}</span>${ratingBadge(t.rating)}<span class="meta-dur">${esc(durationLabel(t))}</span><span class="meta-q">${qualityBadges(t)}</span></div>
      ${rank ? `<div class="hero-rank">${top10Badge(rank, t)}</div>` : ''}
      <p class="hero-syn">${esc(t.synopsis)}</p>
      <div class="hero-genres">${genres}</div>`;
  }

  function loadLogo(t, img) {
    return artwork.logo(t).then((url) => new Promise((res) => {
      if (!url) return res(false);
      const probe = new Image();
      probe.onload = () => { img.src = url; img.classList.add('is-loaded'); img.closest('.hero-title')?.classList.add('has-logo'); res(true); };
      probe.onerror = () => res(false);
      probe.src = url;
    })).catch(() => false);
  }

  function refreshState() {
    const t = items[index];
    if (!t) return;
    const inList = store.inList(t.id);
    listBtn.setAttribute('aria-pressed', inList ? 'true' : 'false');
    listBtn.setAttribute('aria-label', inList ? 'Quitar de Mi lista' : 'Añadir a Mi lista');
    listBtn.setAttribute('data-tip', inList ? 'En Mi lista' : 'Mi lista');
    listBtn.querySelector('.ibtn-disc').innerHTML = icon(inList ? 'check' : 'plus', { size: 22, stroke: inList ? 2.6 : 2 });
    listBtn.classList.toggle('is-on', inList);
    const prog = store.progressOf(t.id);
    const ep = parseEp(prog?.ep);
    playBtn.querySelector('.btn-label').textContent = prog ? 'Reanudar' : 'Reproducir';
    let sub = playBtn.querySelector('.btn-sub');
    if (prog) {
      if (!sub) { sub = document.createElement('span'); sub.className = 'btn-sub'; playBtn.append(sub); }
      sub.innerHTML = `${ep ? `<em>${epShort(ep.s, ep.e)}</em>` : ''}<span class="btn-prog"><i style="width:${progressPct(prog).toFixed(0)}%"></i></span>`;
    } else sub?.remove();
  }

  async function render(t, dir, first = false) {
    const token = ++swapToken;
    const tmp = document.createElement('div');
    tmp.innerHTML = copyHTML(t);
    const img = tmp.querySelector('.hero-logo');
    const logoP = loadLogo(t, img);
    if (!first) {
      copy.classList.remove('is-in');
      copy.style.setProperty('--dir', dir);
      copy.classList.add('is-out');
      await Promise.race([logoP, new Promise((r) => setTimeout(r, 420))]);
      await new Promise((r) => setTimeout(r, 120));
      if (token !== swapToken || !alive) return;
    } else {
      await Promise.race([logoP, new Promise((r) => setTimeout(r, 260))]);
      if (!alive) return;
    }
    copy.replaceChildren(...tmp.childNodes);
    copy.classList.remove('is-out');
    copy.style.setProperty('--dir', dir);
    copy.classList.add('is-pre');
    void copy.offsetWidth;
    copy.classList.remove('is-pre');
    copy.classList.add('is-in');
    el.style.setProperty('--hero-c1', t.art?.palette?.[0] || '#0b0d1c');
    el.style.setProperty('--hero-c2', t.art?.palette?.[1] || '#6d7cff');
    refreshState();
  }

  function setDots() {
    dots.forEach((d, i) => {
      d.classList.toggle('is-active', i === index);
      d.setAttribute('aria-selected', i === index ? 'true' : 'false');
      d.style.setProperty('--p', i < index ? 1 : 0);
    });
  }

  function go(i, dir = 1) {
    if (!items.length) return;
    const n = items.length;
    const ni = ((i % n) + n) % n;
    if (ni === index && !dir) return;
    index = ni;
    elapsed = 0;
    setDots();
    try { stage.show(index, { direction: dir >= 0 ? 1 : -1 }); } catch { /* */ }
    if (el.classList.contains('no-stage')) fallbackTo(items[index]);
    render(items[index], dir >= 0 ? 1 : -1);
    bus.emit('hero:change', { index, title: items[index] });
  }

  // ---------------------------------------------------------------------------
  // Autoavance
  const paused = () => hovered || overlayOpen || scrolledAway || document.hidden
    || (focusInHero && performance.now() - lastUserNav < 8000);

  function loop(now) {
    if (!alive) return;
    const dt = Math.min(100, now - last);
    last = now;
    const p = paused();
    el.classList.toggle('is-paused', p);
    if (!p && items.length > 1) {
      elapsed += dt;
      const d = dots[index];
      if (d) d.style.setProperty('--p', Math.min(1, elapsed / DURATION).toFixed(4));
      if (elapsed >= DURATION) go(index + 1, 1);
    }
    raf = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------------
  // Eventos
  const onClick = (e) => {
    const dot = e.target.closest('.hp-dot');
    if (dot) { const i = Number(dot.dataset.i); go(i, i >= index ? 1 : -1); return; }
    const hn = e.target.closest('[data-hero-dir]');
    if (hn) { const d = Number(hn.dataset.heroDir); go(index + d, d); return; }
    const b = e.target.closest('[data-act]');
    if (b && el.contains(b)) onAction?.(b.dataset.act, items[index], b);
  };
  el.addEventListener('click', onClick);
  offs.push(() => el.removeEventListener('click', onClick));

  const onEnter = (e) => { if (e.pointerType === 'mouse') hovered = true; };
  const onLeave = () => { hovered = false; };
  el.addEventListener('pointerenter', onEnter);
  el.addEventListener('pointerleave', onLeave);
  offs.push(() => { el.removeEventListener('pointerenter', onEnter); el.removeEventListener('pointerleave', onLeave); });

  // Paralaje por puntero (escritorio)
  if (!device.touch && !device.isTV) {
    let pr = 0, px = 0, py = 0;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      px = ((e.clientX - r.left) / r.width) * 2 - 1;
      py = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!pr) pr = requestAnimationFrame(() => { pr = 0; try { stage.pointer(px, py); } catch { /* */ } });
    };
    el.addEventListener('pointermove', onMove, { passive: true });
    offs.push(() => el.removeEventListener('pointermove', onMove));
  }

  // Deslizar (táctil)
  if (device.touch) {
    let sx = 0, sy = 0, st = 0;
    const down = (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = performance.now(); };
    const up = (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4 && performance.now() - st < 700) go(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchend', up, { passive: true });
    offs.push(() => { el.removeEventListener('touchstart', down); el.removeEventListener('touchend', up); });
  }

  // Foco: pausa y paso de destacado con ← → en los bordes del grupo de acciones
  offs.push(bus.on('nav:focus', ({ el: f }) => {
    focusInHero = !!f && el.contains(f);
    lastUserNav = performance.now();
  }));
  const onDomFocus = (e) => { if (e.detail?.silent) return; focusInHero = true; };
  el.addEventListener('nav:focus', onDomFocus);
  offs.push(() => el.removeEventListener('nav:focus', onDomFocus));
  offs.push(bus.on('nav:edge', ({ dir, from }) => {
    if (!from || !el.contains(from) || items.length < 2) return;
    if (dir === 'right') { go(index + 1, 1); lastUserNav = performance.now(); }
    else if (dir === 'left') { go(index - 1, -1); lastUserNav = performance.now(); }
  }));
  offs.push(bus.on('route', (r) => { overlayOpen = (r?.overlays || []).length > 0; }));

  // ---------------------------------------------------------------------------
  setDots();
  if (el.classList.contains('no-stage')) fallbackTo(items[0]);
  render(items[0], 1, true);
  raf = requestAnimationFrame(loop);

  return {
    get current() { return items[index]; },
    get index() { return index; },
    go, next: () => go(index + 1, 1), prev: () => go(index - 1, -1),
    refreshState,
    setScroll(p) {
      scrolledAway = p > 0.55;
      el.style.setProperty('--hero-scroll', p.toFixed(3));
      try { stage.setScroll(p); } catch { /* */ }
    },
    focusPrimary() { nav.focus(playBtn); },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      stT.forEach(clearTimeout);
      offs.forEach((f) => f());
    },
  };
}

// =============================================================================
// Órbita · Carga perezosa de arte procedural (A4)
//
//   artTag(kind, id, { s, e, cls, alt, extra })  → <img data-art=…> sin src (esqueleto mientras carga)
//       kind ∈ poster | backdrop | logo | thumb | channel | avatar
//       (avatar acepta extra = { avatar, color, name, kids } para variantes hipotéticas)
//   hydrate(root, { eager })  → observa grupos [data-lazy] / imágenes sueltas y las carga
//                                al acercarse al viewport. Devuelve función de limpieza.
//   loadArt(img)              → carga inmediata (cola con concurrencia limitada)
//   artUrl(kind, item, s, e)  → Promise<url>
// Al cargar: img.is-loaded, contenedor .skeleton → .is-ready; evento 'art:ready' (burbujea).
// =============================================================================
import { artwork } from '../../gfx/artwork.js';
import { getTitle, getChannel } from '../../data/catalog.js';
import { store } from '../../core/store.js';
import { esc } from '../../core/dom.js';

export function artUrl(kind, item, s, e) {
  if (!item) return Promise.resolve(null);
  switch (kind) {
    case 'poster': return artwork.poster(item);
    case 'backdrop': return artwork.backdrop(item);
    case 'logo': return artwork.logo(item);
    case 'thumb': return artwork.thumb(item, s, e);
    case 'channel': return artwork.channelLogo(item);
    case 'avatar': return artwork.avatar(item);
    default: return Promise.resolve(null);
  }
}

function itemFor(img) {
  const { art: kind, id } = img.dataset;
  if (kind === 'channel') return getChannel(id);
  if (kind === 'avatar') {
    const base = (store.get('profiles') || []).find((p) => p.id === id) || { id, name: '', color: '#6d7cff', avatar: 0, kids: false };
    const p = { ...base };
    if (img.dataset.avatar != null) p.avatar = Number(img.dataset.avatar);
    if (img.dataset.color) p.color = img.dataset.color;
    if (img.dataset.name != null) p.name = img.dataset.name;
    if (img.dataset.kids != null) p.kids = img.dataset.kids === '1';
    return p;
  }
  return getTitle(id);
}

export function artTag(kind, id, { s, e, cls = '', alt = '', extra } = {}) {
  let ex = '';
  if (s != null) ex += ` data-s="${s}"`;
  if (e != null) ex += ` data-e="${e}"`;
  if (extra) {
    if (extra.avatar != null) ex += ` data-avatar="${extra.avatar}"`;
    if (extra.color) ex += ` data-color="${esc(extra.color)}"`;
    if (extra.name != null) ex += ` data-name="${esc(extra.name)}"`;
    if (extra.kids != null) ex += ` data-kids="${extra.kids ? 1 : 0}"`;
  }
  return `<img class="art art-${kind} ${cls}" data-art="${kind}" data-id="${esc(id)}"${ex} alt="${esc(alt)}" decoding="async" draggable="false">`;
}

// Cola con concurrencia limitada para no saturar el generador procedural.
const queue = [];
let active = 0;
const MAX = 3;
function pump() {
  while (active < MAX && queue.length) {
    const job = queue.shift();
    active++;
    Promise.resolve().then(job).catch(() => {}).finally(() => { active--; pump(); });
  }
}

export function loadArt(img, { priority = false } = {}) {
  if (!img || img.dataset.state) return;
  img.dataset.state = 'queued';
  const job = async () => {
    if (!img.isConnected) { delete img.dataset.state; return; }
    const item = itemFor(img);
    const s = img.dataset.s != null ? Number(img.dataset.s) : undefined;
    const e = img.dataset.e != null ? Number(img.dataset.e) : undefined;
    try {
      const url = await artUrl(img.dataset.art, item, s, e);
      if (!url) throw new Error('sin arte');
      img.src = url;
      try { await img.decode(); } catch { /* algunos navegadores rechazan decode en imágenes fuera del DOM */ }
      img.dataset.state = 'ready';
      img.classList.add('is-loaded');
      img.closest('.skeleton')?.classList.add('is-ready');
      img.dispatchEvent(new CustomEvent('art:ready', { bubbles: true }));
    } catch {
      img.dataset.state = 'error';
      img.classList.add('is-error');
      img.closest('.skeleton')?.classList.add('is-ready', 'is-error');
    }
  };
  if (priority) queue.unshift(job); else queue.push(job);
  pump();
}

export function hydrate(root, { eager = false, margin = '75% 0px 75% 0px' } = {}) {
  const imgs = Array.from(root.querySelectorAll('img[data-art]:not([data-state])'));
  if (!imgs.length) return () => {};
  if (eager || typeof IntersectionObserver === 'undefined') { imgs.forEach((i) => loadArt(i)); return () => {}; }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      io.unobserve(en.target);
      if (en.target.tagName === 'IMG') loadArt(en.target);
      else en.target.querySelectorAll('img[data-art]:not([data-state])').forEach((i) => loadArt(i));
    }
  }, { rootMargin: margin });
  const groups = new Set();
  for (const img of imgs) {
    const g = img.closest('[data-lazy]');
    if (g && root.contains(g)) groups.add(g); else io.observe(img);
  }
  groups.forEach((g) => io.observe(g));
  return () => io.disconnect();
}

// STUB — Inicio/secciones (subagente UI). params.section ∈ inicio|peliculas|series|deportes|infantil|milista
import { rowsFor, featured } from '../data/catalog.js';
import { artwork } from '../gfx/artwork.js';
export default {
  async mount(root, params, { router }) {
    root.style.cssText = 'padding:80px 32px';
    const rows = rowsFor(params.section);
    root.innerHTML = `<h1>${params.section}</h1>` + rows.map((r) => `<h3>${r.title}</h3><div style="display:flex;gap:12px;overflow:auto" data-nav-group data-nav-scroll="x">${r.items.map((it) => `<button class="focusable" data-id="${it.id}" style="flex:none;width:160px"><img data-art="${it.id}" style="width:160px;aspect-ratio:2/3;background:#222"></button>`).join('')}</div>`).join('');
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (!b) return; const id = b.dataset.id; router.go(id.startsWith('c-') ? `canal/${id}` : `titulo/${id}`); });
    for (const r of rows) for (const it of r.items) if (it.art && it.type) artwork.poster(it).then((u) => root.querySelectorAll(`[data-art="${it.id}"]`).forEach((i) => (i.src = u)));
    void featured;
  },
  unmount() {},
};

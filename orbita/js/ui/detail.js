// STUB — ficha de título (subagente UI). params.id
import { getTitle } from '../data/catalog.js';
export default {
  async mount(root, params, { router }) {
    const t = getTitle(params.id);
    root.style.cssText = 'position:fixed;inset:0;background:#000c;display:grid;place-items:center';
    root.innerHTML = `<div><h1>${t?.title || '¿?'}</h1><p>${t?.synopsis || ''}</p><button class="focusable" data-nav-default id="play">Reproducir</button></div>`;
    root.querySelector('#play').onclick = () => router.go(`ver/${t.id}`);
  },
  unmount() {},
};

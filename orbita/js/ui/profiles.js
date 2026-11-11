// STUB — selector de perfiles (subagente UI)
import { artwork } from '../gfx/artwork.js';
export default {
  async mount(root, params, { store, router }) {
    root.style.cssText = 'display:grid;place-items:center;height:100%';
    root.innerHTML = `<div><h1>¿Quién está viendo?</h1><div style="display:flex;gap:24px">${store.get('profiles').map((p) => `<button class="focusable" data-p="${p.id}"><img data-a="${p.id}" width="120" height="120"><div>${p.name}</div></button>`).join('')}</div></div>`;
    store.get('profiles').forEach((p) => artwork.avatar(p).then((u) => (root.querySelector(`[data-a="${p.id}"]`).src = u)));
    root.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { store.setProfile(b.dataset.p); router.go('inicio', { replace: true }); } });
  },
  unmount() {},
};

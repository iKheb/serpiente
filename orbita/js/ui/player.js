// STUB — reproductor (subagente TV/Player). params.mode ∈ vod|live · params.id · params.ep
import { getTitle, getChannel, nowOn } from '../data/catalog.js';
import { BroadcastEngine } from '../gfx/broadcast-engine.js';
let eng = null;
export default {
  async mount(root, params) {
    root.style.cssText = 'position:fixed;inset:0;background:#000;z-index:200';
    const item = params.mode === 'live' ? getChannel(params.id) : getTitle(params.id);
    eng = new BroadcastEngine(root, {});
    const scene = params.mode === 'live' ? (nowOn(item.id)?.scene || item.scene) : item.scene;
    await eng.load(scene, { seed: 1, palette: item.art.palette, title: item.title || item.name, live: params.mode === 'live' });
    eng.play();
  },
  unmount() { eng?.dispose(); eng = null; },
};

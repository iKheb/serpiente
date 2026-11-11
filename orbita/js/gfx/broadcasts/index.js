// =============================================================================
// Órbita · registro de escenas de emisión (A2)
//
// Interfaz de escena (js/gfx/broadcasts/<id>.js):
//   export default {
//     id: 'ocean',
//     async create({ THREE, renderer, device, opts, gfx, rng }) {
//       // opts = { seed, palette, title, live, program, channel } · gfx = capa DOM (.bc-*)
//       return {
//         scene, camera,                // THREE.Scene + THREE.PerspectiveCamera
//         update(dt, t) {}, resize(w, h) {},
//         post: { bloom: { strength, radius, threshold }, grain, vignette, aberration, exposure },
//         sound(ctx, out) { return { stop() {} }; },
//         dispose() {},
//       };
//     },
//   };
// Si una escena no existe o falla al cargar → escena de reserva (broadcast/fallback.js).
// =============================================================================
const LOADERS = {
  football: () => import('./football.js'),
  news: () => import('./news.js'),
  ocean: () => import('./ocean.js'),
  cosmos: () => import('./cosmos.js'),
  nature: () => import('./nature.js'),
  noir: () => import('./noir.js'),
  racing: () => import('./racing.js'),
  kids: () => import('./kids.js'),
  music: () => import('./music.js'),
  fantasy: () => import('./fantasy.js'),
};

export const SCENE_IDS = Object.keys(LOADERS);

const loaded = new Map();

export async function loadScene(id) {
  if (loaded.has(id)) return loaded.get(id);
  const loader = LOADERS[id];
  let mod = null;
  if (loader) {
    try {
      const m = await loader();
      mod = m.default || null;
      if (!mod || typeof mod.create !== 'function') mod = null;
    } catch (e) {
      console.warn(`[emisión] no se pudo cargar la escena «${id}»`, e?.message || e);
    }
  }
  if (!mod) mod = (await import('../broadcast/fallback.js')).default;
  else loaded.set(id, mod);
  return mod;
}

/** Precarga módulos (sin crear escenas) */
export function preload(ids = SCENE_IDS) {
  for (const id of ids) loadScene(id).catch(() => {});
}

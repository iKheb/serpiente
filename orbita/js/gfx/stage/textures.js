// =============================================================================
// ÓRBITA · Banco de texturas del hero (A1).
// Carga URLs (blob/datos/rutas) → THREE.Texture con decodificación asíncrona,
// caché con desalojo (solo se retienen las capas del destacado actual y vecinos)
// y análisis barato de la imagen en una miniatura 48×27:
//   light  → punto más luminoso (origen de los rayos de luz)
//   focus  → centro de interés (encuadre en móvil vertical)
//   leftL  → luminancia del tercio izquierdo (fuerza del scrim de texto)
//   avg    → color medio
// =============================================================================
import * as THREE from 'three';

const cache = new Map(); // url → { promise, tex, info, used }

function analyse(img) {
  try {
    const w = 48, h = 27;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let best = -1, bx = .7, by = .3, sx = 0, sy = 0, sw = 0, left = 0, ln = 0, ar = 0, ag = 0, ab = 0;
    const L = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = (.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]) / 255;
      L[y * w + x] = l;
      ar += d[i]; ag += d[i + 1]; ab += d[i + 2];
      if (x < w * .4) { left += l; ln++; }
    }
    // luminancia suavizada (caja 5×5) para encontrar la fuente de luz
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      let s = 0;
      for (let j = -2; j <= 2; j++) for (let k = -2; k <= 2; k++) s += L[(y + j) * w + x + k];
      const bias = 1 + (1 - y / h) * .25; // preferir la parte alta
      if (s * bias > best) { best = s * bias; bx = x / (w - 1); by = y / (h - 1); }
    }
    // centro de interés: centroide del 18 % más luminoso / contrastado
    const sorted = Array.from(L).sort((a, b) => b - a);
    const thr = sorted[Math.floor(sorted.length * .18)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const l = L[y * w + x];
      if (l >= thr) { const wt = l * l; sx += x * wt; sy += y * wt; sw += wt; }
    }
    const n = w * h;
    return {
      light: [bx, 1 - by],               // uv con origen abajo
      lightL: best / 25,
      focus: sw ? [sx / sw / (w - 1), 1 - sy / sw / (h - 1)] : [.6, .5],
      leftL: ln ? left / ln : .3,
      avg: [ar / n / 255, ag / n / 255, ab / n / 255],
    };
  } catch {
    return { light: [.72, .8], lightL: .5, focus: [.6, .5], leftL: .3, avg: [.2, .2, .3] };
  }
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => res(img));
    img.onerror = rej;
    img.src = url;
  });
}

export const textures = {
  /** @returns {Promise<{tex: THREE.Texture, info: object}>} */
  get(url, { mip = false, analyse: an = false } = {}) {
    if (!url) return Promise.resolve(null);
    let e = cache.get(url);
    if (e) { e.used = performance.now(); return e.promise; }
    e = { used: performance.now(), tex: null, info: null };
    e.promise = loadImage(url).then((img) => {
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = mip;
      tex.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = 1;
      tex.needsUpdate = true;
      e.tex = tex;
      e.info = an ? analyse(img) : null;
      return { tex, info: e.info, w: img.naturalWidth, h: img.naturalHeight };
    }).catch((err) => { cache.delete(url); console.warn('[stage] textura', err); return null; });
    cache.set(url, e);
    return e.promise;
  },
  /** Libera todas las texturas cuyas URLs no estén en keep. */
  retain(keep) {
    for (const [url, e] of cache) {
      if (!keep.has(url) && e.tex) { e.tex.dispose(); cache.delete(url); }
    }
  },
  /** Fuerza la re-subida tras restaurar el contexto WebGL. */
  touchAll() { for (const e of cache.values()) if (e.tex) e.tex.needsUpdate = true; },
  disposeAll() { for (const e of cache.values()) e.tex?.dispose(); cache.clear(); },
};

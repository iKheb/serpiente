// =============================================================================
// Órbita · utilidades compartidas para escenas de emisión (A2)
// Sin dependencias de Three: matemáticas, azar determinista, ruido y limpieza.
// =============================================================================

/** Generador determinista [0,1) */
export function mulberry32(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash FNV-1a de una cadena → uint32 */
export function hashStr(s) {
  let h = 2166136261;
  s = String(s ?? '');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/** Amortiguación independiente del framerate */
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
/** Amortigua un Vector3 (o cualquier {x,y,z}) hacia otro, en sitio */
export function dampV3(v, t, lambda, dt) {
  const k = 1 - Math.exp(-lambda * dt);
  v.x += (t.x - v.x) * k; v.y += (t.y - v.y) * k; v.z += (t.z - v.z) * k;
  return v;
}
/** Diferencia angular mínima (rad) */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export const dampAngle = (a, b, lambda, dt) => a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));

/** Ruido de valor 1D suave y barato (−1..1) */
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => { const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
/** Ruido fractal 1D (−1..1 aprox.) */
export function fbm1(x, seed = 0, oct = 3) {
  let a = 0.5, s = 0, n = 0;
  for (let o = 0; o < oct; o++) { s += noise1(x, seed + o * 13.7) * a; n += a; x *= 2.03; a *= 0.5; }
  return s / n;
}

/** Elige con pesos: items [{weight}] */
export function pickWeighted(items, r) {
  let tot = 0;
  for (const it of items) tot += it.weight ?? 1;
  let x = r * tot;
  for (const it of items) { x -= it.weight ?? 1; if (x <= 0) return it; }
  return items[items.length - 1];
}

/** Libera recursivamente geometrías, materiales y texturas de un objeto 3D */
export function disposeDeep(root) {
  if (!root) return;
  const seen = new Set();
  const freeMat = (m) => {
    if (!m || seen.has(m)) return;
    seen.add(m);
    for (const k of Object.keys(m)) {
      const v = m[k];
      if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); }
    }
    if (m.uniforms) {
      for (const u of Object.values(m.uniforms)) {
        const v = u && u.value;
        if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); }
      }
    }
    m.dispose();
  };
  root.traverse?.((o) => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(freeMat);
    if (o.isInstancedMesh) o.dispose?.();
  });
  if (root.isScene) {
    if (root.environment?.dispose) root.environment.dispose();
    if (root.background?.isTexture) root.background.dispose();
  }
}

/** Reloj de partido/emisión "mm:ss" */
export function mmss(sec) {
  sec = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

/** Hora local hh:mm */
export function hhmm(d = new Date()) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Crea un elemento DOM con clase(s) y HTML opcional */
export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

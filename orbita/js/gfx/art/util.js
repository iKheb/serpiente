// =============================================================================
// Órbita · Arte procedural — utilidades de pintura (sin DOM: válido en Worker y en hilo principal)
// Canvas, RNG determinista, color, ruido, desenfoque, bloom, grano, viñeta, luces y formas.
// =============================================================================

export const HAS_OFFSCREEN = typeof OffscreenCanvas !== 'undefined';

/** Lienzo independiente del entorno (OffscreenCanvas si existe). */
export function canvas(w, h) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (HAS_OFFSCREEN) return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
export function ctx2d(c, read = false) {
  const g = c.getContext('2d', read ? { willReadFrequently: true } : undefined);
  g.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = 'high';
  return g;
}
export function layer(w, h, read) { const c = canvas(w, h); return ctx2d(c, read); }

// -----------------------------------------------------------------------------
// RNG determinista
export function hash32(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= 0x9e3779b9; h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
  }
  return h >>> 0;
}
export function makeRng(seed) {
  let a = seed >>> 0;
  const r = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.seed = seed >>> 0;
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.sign = () => (r() < 0.5 ? -1 : 1);
  r.gauss = () => (r() + r() + r() + r() - 2) * 0.8660254;
  r.fork = (k) => makeRng(hash32(seed, k));
  return r;
}

// -----------------------------------------------------------------------------
// Color (hex ↔ rgb, mezclas)
const RGB_CACHE = new Map();
export function rgb(c) {
  if (typeof c !== 'string') return c;
  let v = RGB_CACHE.get(c);
  if (v) return v;
  let s = c.trim();
  if (s.startsWith('#')) {
    s = s.slice(1);
    if (s.length === 3) s = s.split('').map((x) => x + x).join('');
    const n = parseInt(s.slice(0, 6), 16);
    v = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  } else {
    const m = s.match(/[\d.]+/g) || [0, 0, 0];
    v = { r: +m[0], g: +m[1], b: +m[2] };
  }
  RGB_CACHE.set(c, v);
  return v;
}
const h2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
export const hex = ({ r, g, b }) => '#' + h2(r) + h2(g) + h2(b);
export function mix(a, b, t) { const A = rgb(a), B = rgb(b); return hex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t }); }
export const light = (c, t) => mix(c, '#ffffff', t);
export const dark = (c, t) => mix(c, '#000000', t);
export function rgba(c, a = 1) { const { r, g, b } = rgb(c); return `rgba(${r | 0},${g | 0},${b | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`; }
export function lum(c) { const { r, g, b } = rgb(c); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }
export function toHsl(c) {
  let { r, g, b } = rgb(c); r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  }
  return { h, s, l };
}
export function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  if (s === 0) return hex({ r: l * 255, g: l * 255, b: l * 255 });
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return hex({ r: f(p, q, h + 1 / 3) * 255, g: f(p, q, h) * 255, b: f(p, q, h - 1 / 3) * 255 });
}
export function hue(c, deg) { const x = toHsl(c); return fromHsl(x.h + deg, x.s, x.l); }
export function sat(c, k) { const x = toHsl(c); return fromHsl(x.h, Math.max(0, Math.min(1, x.s * k)), x.l); }
export function withL(c, l) { const x = toHsl(c); return fromHsl(x.h, x.s, l); }

/** Paleta derivada a partir de art.palette [base oscura, acento/luz clave, brillo]. */
export function makePalette(pal) {
  const [a = '#0b1020', b = '#7c6cff', c = '#e8ecff'] = pal || [];
  const la = lum(a);
  const base = la > 0.35 ? dark(sat(a, 1.1), 0.72) : a; // paletas claras (infantil) → base oscura derivada
  return {
    raw: [a, b, c], a, b, c, base,
    deep: dark(base, 0.55),
    night: mix(dark(base, 0.35), b, 0.06),
    mid: mix(base, b, 0.35),
    haze: mix(base, c, 0.28),
    glow: light(b, 0.25),
    hot: light(mix(b, c, 0.5), 0.35),
    bright: la > 0.35,
  };
}

// -----------------------------------------------------------------------------
// Gradientes
export function lin(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c, a] of stops) gr.addColorStop(Math.max(0, Math.min(1, t)), a === undefined ? c : rgba(c, a));
  return gr;
}
export function rad(g, x, y, r0, r1, stops, x1 = x, y1 = y) {
  const gr = g.createRadialGradient(x, y, Math.max(0, r0), x1, y1, Math.max(0.001, r1));
  for (const [t, c, a] of stops) gr.addColorStop(Math.max(0, Math.min(1, t)), a === undefined ? c : rgba(c, a));
  return gr;
}
export function fill(g, style, x = 0, y = 0, w = g.canvas.width, h = g.canvas.height) { g.fillStyle = style; g.fillRect(x, y, w, h); }
export function vgrad(g, w, h, stops, y0 = 0, y1 = h) { fill(g, lin(g, 0, y0, 0, y1, stops), 0, 0, w, h); }

/** Luz radial suave (glow). comp 'lighter' = aditivo. */
export function glow(g, x, y, r, color, a = 1, comp = 'lighter', falloff = 2) {
  if (r <= 0 || a <= 0) return;
  g.save(); g.globalCompositeOperation = comp;
  const st = falloff === 1
    ? [[0, color, a], [0.5, color, a * 0.35], [1, color, 0]]
    : [[0, color, a], [0.08, color, a * 0.75], [0.22, color, a * 0.38], [0.45, color, a * 0.13], [0.7, color, a * 0.04], [1, color, 0]];
  g.fillStyle = rad(g, x, y, 0, r, st);
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
}
/** Destello estelar con picos (glint). */
export function starGlint(g, x, y, r, color, a = 1, spikes = 4, rot = 0) {
  glow(g, x, y, r * 0.5, color, a);
  g.save(); g.globalCompositeOperation = 'lighter'; g.translate(x, y); g.rotate(rot);
  for (let i = 0; i < spikes; i++) {
    g.rotate(Math.PI * 2 / spikes);
    const len = r * (i % 2 ? 0.55 : 1);
    g.fillStyle = lin(g, 0, 0, len, 0, [[0, color, a * 0.9], [1, color, 0]]);
    g.beginPath(); g.moveTo(0, -r * 0.02 - 0.6); g.lineTo(len, 0); g.lineTo(0, r * 0.02 + 0.6); g.closePath(); g.fill();
  }
  g.restore();
}
/** Destello anamórfico horizontal (lens flare cinematográfico). */
export function anamorphic(g, x, y, len, color, a = 0.8, th = 0) {
  th = th || Math.max(1, len * 0.012);
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const [k, al] of [[1, a * 0.35], [0.45, a * 0.6], [0.18, a]]) {
    g.fillStyle = lin(g, x - len * k, 0, x + len * k, 0, [[0, color, 0], [0.5, color, al], [1, color, 0]]);
    const t = th * (k === 1 ? 1 : k === 0.45 ? 1.8 : 3);
    g.fillRect(x - len * k, y - t / 2, len * 2 * k, t);
  }
  g.restore();
  glow(g, x, y, len * 0.18, color, a * 0.7);
}
/** Haces de luz desde un punto (god rays). */
export function rays(g, x, y, { n = 9, a0 = 0, a1 = Math.PI, len = 600, spread = 0.06, color = '#fff', alpha = 0.18, rng = Math.random, comp = 'lighter' } = {}) {
  g.save(); g.globalCompositeOperation = comp;
  for (let i = 0; i < n; i++) {
    const ang = a0 + (a1 - a0) * (n === 1 ? 0.5 : (i + rng() * 0.8) / n);
    const w = spread * (0.4 + rng() * 1.2);
    const L = len * (0.6 + rng() * 0.5);
    const al = alpha * (0.35 + rng() * 0.9);
    g.fillStyle = rad(g, x, y, 0, L, [[0, color, al], [0.35, color, al * 0.5], [1, color, 0]]);
    g.beginPath(); g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang - w) * L, y + Math.sin(ang - w) * L);
    g.lineTo(x + Math.cos(ang + w) * L, y + Math.sin(ang + w) * L);
    g.closePath(); g.fill();
  }
  g.restore();
}
/** Cono de luz (foco, faro, linterna). */
export function beam(g, x, y, ang, len, half, color, a = 0.5, soft = 0.6) {
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 3; k++) {
    const hw = half * (1 + k * soft);
    const al = a * [0.55, 0.28, 0.14][k];
    g.fillStyle = rad(g, x, y, 0, len, [[0, color, al], [0.25, color, al * 0.7], [0.7, color, al * 0.22], [1, color, 0]]);
    g.beginPath(); g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang - hw) * len, y + Math.sin(ang - hw) * len);
    g.lineTo(x + Math.cos(ang + hw) * len, y + Math.sin(ang + hw) * len);
    g.closePath(); g.fill();
  }
  g.restore();
}

// -----------------------------------------------------------------------------
// Ruido (value noise + fbm)
export function noise2(seed) {
  const N = 256, perm = new Uint8Array(512), vals = new Float32Array(N);
  const r = makeRng(seed);
  for (let i = 0; i < N; i++) { perm[i] = i; vals[i] = r(); }
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < N; i++) perm[i + N] = perm[i];
  const v = (x, y) => vals[perm[(perm[x & 255] + y) & 511]];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
}
export function fbm(n, x, y, oct = 5, lac = 2.03, gain = 0.5) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += amp * n(x * f, y * f); norm += amp; amp *= gain; f *= lac; }
  return s / norm;
}
/**
 * Campo procedural a baja resolución (rápido) que se escala con suavizado.
 * fn(u, v) → [r, g, b, a] (0..255); u, v ∈ [0,1].
 */
export function field(w, h, fn) {
  const c = canvas(w, h), g = ctx2d(c, true);
  const id = g.createImageData(c.width, c.height), d = id.data;
  let i = 0;
  for (let y = 0; y < c.height; y++) {
    const v = y / (c.height - 1 || 1);
    for (let x = 0; x < c.width; x++) {
      const p = fn(x / (c.width - 1 || 1), v, x, y);
      d[i++] = p[0]; d[i++] = p[1]; d[i++] = p[2]; d[i++] = p[3] === undefined ? 255 : p[3];
    }
  }
  g.putImageData(id, 0, 0);
  return c;
}
/** Nubes / humo / nebulosa: dibuja una capa de fbm coloreada sobre g. */
export function clouds(g, x, y, w, h, { seed = 1, scale = 3, oct = 5, color = '#fff', alpha = 1, cover = 0.5, sharp = 2.2, res = 0.16, stretch = 1, warp = 0.6, comp = 'source-over', fadeTop = 0, fadeBottom = 0, shade = null } = {}) {
  const n = noise2(seed), n2 = noise2(seed + 7);
  const C = rgb(color), S = shade ? rgb(shade) : null;
  const cw = Math.max(8, Math.round(w * res)), ch = Math.max(8, Math.round(h * res));
  const asp = w / h;
  const f = field(cw, ch, (u, v) => {
    const qx = u * scale * asp / stretch, qy = v * scale;
    const wx = warp ? (fbm(n2, qx * 0.7 + 3.1, qy * 0.7 + 1.7, 3) - 0.5) * warp * 2 : 0;
    const d = fbm(n, qx + wx, qy + wx * 0.7, oct);
    let k = (d - (1 - cover)) / Math.max(0.0001, cover);
    k = Math.max(0, Math.min(1, k)); k = Math.pow(k, 1 / sharp) * (k > 0 ? 1 : 0);
    k = Math.min(1, k * 1.4);
    let fa = 1;
    if (fadeTop) fa *= Math.min(1, v / fadeTop);
    if (fadeBottom) fa *= Math.min(1, (1 - v) / fadeBottom);
    if (S) {
      const t = Math.max(0, Math.min(1, (d - 0.45) * 2.4));
      return [S.r + (C.r - S.r) * t, S.g + (C.g - S.g) * t, S.b + (C.b - S.b) * t, 255 * k * fa];
    }
    return [C.r, C.g, C.b, 255 * k * fa];
  });
  g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = comp;
  g.drawImage(f, x, y, w, h);
  g.restore();
}

// -----------------------------------------------------------------------------
// Desenfoque por cadena de reducción (rápido y portable, sin ctx.filter)
export function blurred(src, factor = 8, out = null) {
  const W = src.width, H = src.height;
  let cur = src, cw = W, ch = H; const chain = [];
  let f = factor;
  while (f >= 2 && cw > 2 && ch > 2) {
    const nw = Math.max(1, Math.round(cw / 2)), nh = Math.max(1, Math.round(ch / 2));
    const c = canvas(nw, nh), g = ctx2d(c); g.drawImage(cur, 0, 0, nw, nh);
    chain.push(c); cur = c; cw = nw; ch = nh; f /= 2;
  }
  // un paso extra de suavizado a la mínima resolución
  for (let i = chain.length - 2; i >= 0; i--) {
    const c = chain[i], g = ctx2d(c);
    g.clearRect(0, 0, c.width, c.height); g.drawImage(cur, 0, 0, c.width, c.height); cur = c;
  }
  const o = out || canvas(W, H), og = ctx2d(o);
  if (!out) og.drawImage(cur, 0, 0, W, H);
  return o;
}
/** Dibuja src desenfocado sobre g. */
export function drawBlurred(g, src, factor, x = 0, y = 0, w = src.width, h = src.height, alpha = 1, comp = 'source-over') {
  const b = blurred(src, factor);
  g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = comp; g.drawImage(b, x, y, w, h); g.restore();
}
/** Bloom físico aproximado: umbral de brillos a 1/8, desenfoque y suma aditiva. */
export function bloom(g, { thr = 0.62, k = 0.85, radius = 4, tint = null, knee = 1.6 } = {}) {
  const W = g.canvas.width, H = g.canvas.height;
  const sw = Math.max(8, Math.round(W / 8)), sh = Math.max(8, Math.round(H / 8));
  const half = canvas(W / 2, H / 2), hg = ctx2d(half); hg.drawImage(g.canvas, 0, 0, half.width, half.height);
  const q = canvas(W / 4, H / 4), qg = ctx2d(q); qg.drawImage(half, 0, 0, q.width, q.height);
  const s = canvas(sw, sh), sg = ctx2d(s, true); sg.drawImage(q, 0, 0, sw, sh);
  const id = sg.getImageData(0, 0, sw, sh), d = id.data;
  const T = tint ? rgb(tint) : null;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
    const l = Math.max(r, gg, b) * a;
    let m = (l - thr) / (1 - thr);
    if (m <= 0) { d[i + 3] = 0; continue; }
    m = Math.min(1, Math.pow(m, knee));
    if (T) { d[i] = (r * 0.6 + T.r / 255 * 0.4) * 255; d[i + 1] = (gg * 0.6 + T.g / 255 * 0.4) * 255; d[i + 2] = (b * 0.6 + T.b / 255 * 0.4) * 255; }
    d[i + 3] = 255 * m;
  }
  sg.putImageData(id, 0, 0);
  const b1 = blurred(s, radius);
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = k;
  g.drawImage(b1, 0, 0, W, H);
  g.globalAlpha = k * 0.6; g.drawImage(blurred(s, radius * 4), 0, 0, W, H);
  g.restore();
}

/** Grano de película (overlay). Teselas cacheadas por tamaño. */
const GRAIN = new Map();
function grainTile(sz, seed) {
  const k = sz + ':' + seed; let t = GRAIN.get(k);
  if (t) return t;
  const r = makeRng(seed);
  t = field(sz, sz, () => { const v = 128 + (r() + r() + r() - 1.5) * 150; return [v, v, v, 255]; });
  GRAIN.set(k, t); return t;
}
export function grain(g, amt = 0.07, seed = 7, scale = 1) {
  const W = g.canvas.width, H = g.canvas.height;
  const tile = grainTile(160, seed % 4);
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = amt;
  const p = g.createPattern(tile, 'repeat');
  if (scale !== 1 && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(scale));
  g.fillStyle = p; g.fillRect(0, 0, W, H);
  g.restore();
}
export function vignette(g, { k = 0.6, cx = 0.5, cy = 0.5, inner = 0.42, color = '#000', comp = 'source-over' } = {}) {
  const W = g.canvas.width, H = g.canvas.height, R = Math.hypot(W, H) * 0.58;
  g.save(); g.globalCompositeOperation = comp;
  g.fillStyle = rad(g, W * cx, H * cy, R * inner, R, [[0, color, 0], [0.5, color, k * 0.45], [1, color, k]]);
  g.fillRect(0, 0, W, H); g.restore();
}

// -----------------------------------------------------------------------------
// Formas
/** Curva suave Catmull-Rom por puntos [[x,y],...]. */
export function spline(g, pts, closed = false, t = 0.5, move = true) {
  const n = pts.length; if (n < 2) return;
  const P = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  if (move) g.moveTo(pts[0][0], pts[0][1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const k = t / 3;
    g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k, p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k, p2[0], p2[1]);
  }
  if (closed) g.closePath();
}
/** Línea de cresta fractal (montañas, dunas, copas lejanas). Devuelve el array de alturas. */
export function ridge(g, { x0 = 0, x1 = g.canvas.width, y, amp = 80, rng, oct = 6, rough = 0.52, step = 4, fillStyle = '#000', bottom = g.canvas.height, peaks = null, smooth = false, n = null }) {
  const nz = n || noise2(Math.floor(rng() * 1e9));
  const off = rng() * 100, fr = rng.range(0.8, 1.4);
  const ys = [];
  g.beginPath(); g.moveTo(x0, bottom);
  for (let x = x0; x <= x1 + step; x += step) {
    const u = (x - x0) / (x1 - x0);
    let v = fbm(nz, u * 3 * fr + off, off * 0.3, oct, 2.05, rough) - 0.5;
    if (peaks) for (const [px, ph, pw] of peaks) v += ph * Math.exp(-Math.pow((u - px) / pw, 2));
    if (smooth) v = v * 0.6;
    const yy = y - v * amp * 2;
    ys.push(yy); g.lineTo(x, yy);
  }
  g.lineTo(x1 + step, bottom); g.closePath();
  g.fillStyle = fillStyle; g.fill();
  return ys;
}
/** Banda de niebla horizontal. */
export function fogBand(g, y, h, color, a = 0.5, x = 0, w = g.canvas.width) {
  g.fillStyle = lin(g, 0, y - h / 2, 0, y + h / 2, [[0, color, 0], [0.5, color, a], [1, color, 0]]);
  g.fillRect(x, y - h / 2, w, h);
}
/** Partículas: polvo, nieve, brasas, luciérnagas. */
export function particles(g, { n = 80, x = 0, y = 0, w = g.canvas.width, h = g.canvas.height, rmin = 0.5, rmax = 2, color = '#fff', amin = 0.2, amax = 0.9, glowK = 0, rng = Math.random, comp = 'lighter', streak = 0, angle = Math.PI / 2, bias = 1 } = {}) {
  g.save(); g.globalCompositeOperation = comp;
  for (let i = 0; i < n; i++) {
    const px = x + rng() * w, py = y + Math.pow(rng(), bias) * h;
    const r = rmin + Math.pow(rng(), 2.2) * (rmax - rmin);
    const a = amin + rng() * (amax - amin);
    if (glowK) glow(g, px, py, r * glowK, color, a * 0.55, comp);
    if (streak) {
      g.strokeStyle = rgba(color, a); g.lineWidth = r; g.lineCap = 'round';
      const L = streak * (0.5 + rng());
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(angle) * L, py + Math.sin(angle) * L); g.stroke();
    } else {
      g.fillStyle = rgba(color, a); g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}
/** Campo de estrellas con tamaños y colores variados. */
export function stars(g, { n = 300, x = 0, y = 0, w = g.canvas.width, h = g.canvas.height, rng, rmax = 1.6, tints = ['#ffffff', '#cfe0ff', '#ffe6c8'], glints = 4, scale = 1 }) {
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const px = x + rng() * w, py = y + rng() * h;
    const r = (0.3 + Math.pow(rng(), 6) * rmax) * scale;
    g.fillStyle = rgba(rng.pick(tints), 0.25 + rng() * 0.75);
    g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  for (let i = 0; i < glints; i++) starGlint(g, x + rng() * w, y + rng() * h * 0.8, (8 + rng() * 14) * scale, rng.pick(tints), 0.8, 4, rng() * 0.3);
}
/** Elipse rellena. */
export function ellipse(g, x, y, rx, ry, style, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2); g.fillStyle = style; g.fill(); }
export function circle(g, x, y, r, style) { g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2); g.fillStyle = style; g.fill(); }
export function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/**
 * Silueta humana de pie (pies en x,y; altura h). Devuelve anclas útiles.
 * opts: { coat, hair:'short'|'long'|'bun'|'hat'|'hood'|'helmet', child, stride, armUp:-1|0|1, side, cape }
 */
export function figure(g, x, y, h, opts = {}) {
  const { coat = 0.6, hair = 'short', child = false, stride = 0, armOut = 0, fillStyle = '#000', cape = false, bulk = 1 } = opts;
  const u = h;
  const headR = (child ? 0.085 : 0.062) * u;
  const headY = y - u + headR;
  const sh = (child ? 0.105 : 0.125) * u * bulk; // media anchura hombros
  const shY = y - u + headR * 2 + 0.035 * u;
  const hemY = y - u * (child ? 0.42 : 0.30 + (1 - coat) * 0.16);
  const hem = sh * (1.0 + coat * 0.35);
  const legW = 0.042 * u * bulk;
  const s = stride * u;
  g.save(); g.fillStyle = fillStyle;
  g.beginPath();
  // cuerpo (contorno derecho → izquierdo)
  const R = [
    [x + headR * 0.45, shY - 0.03 * u],
    [x + sh * 0.85, shY - 0.004 * u],
    [x + sh + 0.01 * u, shY + 0.03 * u],
    [x + sh * 1.08 + armOut * 0.05 * u, shY + 0.2 * u],
    [x + hem + armOut * 0.04 * u, hemY - 0.02 * u],
    [x + hem * 0.98, hemY + 0.005 * u],
    [x + legW * 1.9 + s * 0.5, hemY + 0.02 * u],
    [x + legW * 1.6 + s, y - 0.06 * u],
    [x + legW * 2.3 + s, y - 0.004 * u],
    [x + legW * 0.25 + s, y],
    [x + legW * 0.2 + s * 0.6, hemY + 0.06 * u],
    [x, hemY + 0.04 * u],
  ];
  const L = R.slice(0, -1).reverse().map(([px, py]) => [2 * x - px, py]);
  spline(g, [...R, ...L], true, 0.35);
  g.fill();
  // cuello y cabeza
  g.beginPath(); g.moveTo(x - headR * 0.42, shY); g.lineTo(x - headR * 0.4, headY + headR * 0.7); g.lineTo(x + headR * 0.4, headY + headR * 0.7); g.lineTo(x + headR * 0.42, shY); g.closePath(); g.fill();
  g.beginPath(); g.ellipse(x, headY, headR * 0.86, headR, 0, 0, Math.PI * 2); g.fill();
  if (hair === 'long') { g.beginPath(); spline(g, [[x - headR * 0.9, headY - headR * 0.2], [x - headR * 1.15, headY + headR * 1.6], [x - headR * 0.8, shY + 0.07 * u], [x + headR * 0.8, shY + 0.07 * u], [x + headR * 1.15, headY + headR * 1.6], [x + headR * 0.9, headY - headR * 0.2]], false, 0.5); g.closePath(); g.fill(); }
  if (hair === 'bun') { g.beginPath(); g.arc(x + headR * 0.3, headY - headR * 0.95, headR * 0.5, 0, Math.PI * 2); g.fill(); }
  if (hair === 'hat') { ellipse(g, x, headY - headR * 0.35, headR * 1.9, headR * 0.32, fillStyle); roundRect(g, x - headR * 0.95, headY - headR * 1.45, headR * 1.9, headR * 1.15, headR * 0.4); g.fill(); }
  if (hair === 'hood') { g.beginPath(); g.ellipse(x, headY - headR * 0.05, headR * 1.15, headR * 1.25, 0, 0, Math.PI * 2); g.fill(); }
  if (hair === 'helmet') { g.beginPath(); g.arc(x, headY, headR * 1.45, 0, Math.PI * 2); g.fill(); }
  if (cape) { g.beginPath(); spline(g, [[x - sh, shY + 0.02 * u], [x - hem * 1.5, y - 0.12 * u], [x - hem * 1.2, y], [x + hem * 1.2, y], [x + hem * 1.5, y - 0.12 * u], [x + sh, shY + 0.02 * u]], false, 0.4); g.closePath(); g.fill(); }
  g.restore();
  return { head: [x, headY], headR, hand: [x + hem + armOut * 0.05 * u, hemY - 0.02 * u], handL: [x - hem, hemY - 0.02 * u], shoulderY: shY, top: y - u - (hair === 'hat' ? headR * 0.6 : 0) };
}

/** Pino estilizado (capas triangulares). */
export function pine(g, x, y, h, w, style, rng, tiers = 0) {
  tiers = tiers || Math.max(3, Math.round(h / (w * 0.9)));
  g.fillStyle = style; g.beginPath();
  g.moveTo(x, y - h);
  for (let i = 0; i <= tiers; i++) {
    const t = i / tiers, yy = y - h + h * 0.92 * t, ww = w * (0.18 + 0.82 * t) * (0.85 + rng() * 0.3);
    g.lineTo(x + ww / 2, yy + h * 0.06);
    if (i < tiers) g.lineTo(x + ww * 0.22, yy + h * 0.05);
  }
  g.lineTo(x + w * 0.05, y); g.lineTo(x - w * 0.05, y);
  for (let i = tiers; i >= 0; i--) {
    const t = i / tiers, yy = y - h + h * 0.92 * t, ww = w * (0.18 + 0.82 * t) * (0.85 + rng() * 0.3);
    if (i < tiers) g.lineTo(x - ww * 0.22, yy + h * 0.05);
    g.lineTo(x - ww / 2, yy + h * 0.06);
  }
  g.closePath(); g.fill();
}
/** Árbol frondoso de copa redondeada (racimos de círculos). */
export function leafyTree(g, x, y, h, style, rng, wide = 1) {
  g.fillStyle = style;
  g.beginPath(); g.moveTo(x - h * 0.03, y); g.lineTo(x - h * 0.015, y - h * 0.5); g.lineTo(x + h * 0.015, y - h * 0.5); g.lineTo(x + h * 0.03, y); g.fill();
  const cx = x, cy = y - h * 0.68, R = h * 0.3 * wide;
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * R * 0.75;
    circle(g, cx + Math.cos(a) * d * 1.2, cy + Math.sin(a) * d * 0.7, R * (0.35 + rng() * 0.3), style);
  }
}
/** Árbol desnudo ramificado (recursivo). */
export function branchTree(g, x, y, len, ang, wdt, depth, rng, style) {
  if (depth <= 0 || len < 2) return;
  const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
  g.strokeStyle = style; g.lineWidth = wdt; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(ang + 0.2) * len * 0.5, y + Math.sin(ang + 0.2) * len * 0.5, x2, y2); g.stroke();
  const k = rng.int(2, 3);
  for (let i = 0; i < k; i++) branchTree(g, x2, y2, len * rng.range(0.62, 0.8), ang + rng.range(-0.75, 0.75), wdt * 0.68, depth - 1, rng, style);
}

/** Copia con transparencia desvanecida hacia un borde ('left' para el hero). */
export function fadeEdge(g, side = 'left', k = 0.35, amount = 1) {
  const W = g.canvas.width, H = g.canvas.height;
  g.save(); g.globalCompositeOperation = 'destination-out';
  if (side === 'left') g.fillStyle = lin(g, 0, 0, W * k, 0, [[0, '#000', amount], [1, '#000', 0]]);
  else if (side === 'bottom') g.fillStyle = lin(g, 0, H, 0, H * (1 - k), [[0, '#000', amount], [1, '#000', 0]]);
  g.fillRect(0, 0, W, H); g.restore();
}
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

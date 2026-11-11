// =============================================================================
// Órbita · texturas procedurales y entorno (A2) — compartido con A2b.
//   canvasTexture(w, h, draw(ctx, w, h), { srgb, repeat, anisotropy, mipmaps })
//   glowTexture(size, inner, outer)       sprite radial (para halos/manchas)
//   makeEnvironment(renderer, build(scene, THREE))  → textura PMREM (scene.environment)
//   gradientSky(THREE, { top, mid, bottom, radius })  → Mesh (esfera de cielo)
// =============================================================================
import * as THREE from 'three';

export function canvasTexture(w, h, draw, { srgb = true, repeat = null, anisotropy = 4, mipmaps = true, renderer = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat[0], repeat[1]); }
  tex.anisotropy = renderer ? Math.min(anisotropy, renderer.capabilities.getMaxAnisotropy()) : anisotropy;
  tex.generateMipmaps = mipmaps;
  if (!mipmaps) tex.minFilter = THREE.LinearFilter;
  return tex;
}

/** Sprite radial suave: blanco en el centro → transparente */
export function glowTexture(size = 128, stops = [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]) {
  return canvasTexture(size, size, (g, w) => {
    const r = w / 2;
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
  }, { srgb: false, mipmaps: true });
}

/** Entorno PMREM a partir de una mini-escena (paneles emisivos, cielo…) */
export function makeEnvironment(renderer, build, { sigma = 0.04 } = {}) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  build(s, THREE);
  const rt = pm.fromScene(s, sigma);
  s.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
  pm.dispose();
  return rt.texture;
}

/** Esfera de cielo con degradado vertical (colores lineales escalables >1 para HDR) */
export function gradientSky({ top = '#02040c', mid = '#0a1430', bottom = '#000000', radius = 900, horizon = 0.0, glow = 0.0, glowColor = '#ff9a50', intensity = 1 } = {}) {
  const geo = new THREE.SphereGeometry(radius, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(top) }, mid: { value: new THREE.Color(mid) }, bottom: { value: new THREE.Color(bottom) },
      horizon: { value: horizon }, glow: { value: glow }, glowColor: { value: new THREE.Color(glowColor) }, intensity: { value: intensity },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top, mid, bottom, glowColor; uniform float horizon, glow, intensity; varying vec3 vDir;
      void main(){ float y = vDir.y - horizon; vec3 c = y > 0.0 ? mix(mid, top, pow(clamp(y,0.0,1.0), 0.6)) : mix(mid, bottom, pow(clamp(-y*3.0,0.0,1.0), 0.5));
        c += glowColor * glow * exp(-abs(y) * 9.0);
        gl_FragColor = vec4(c * intensity, 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

/** Ruido de valor 2D en canvas (gris) para rugosidad/variación */
export function noiseCanvasTexture(size = 256, { scale = 8, octaves = 4, seed = 1, contrast = 1, repeat = [1, 1] } = {}) {
  const rnd = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, y, p) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const w = (a) => ((a % p) + p) % p;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = rnd(w(xi), w(yi)), b = rnd(w(xi + 1), w(yi)), c = rnd(w(xi), w(yi + 1)), d = rnd(w(xi + 1), w(yi + 1));
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return canvasTexture(size, size, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 0.5, s = 0, n = 0, f = scale;
      for (let o = 0; o < octaves; o++) { s += vnoise((x / w) * f, (y / h) * f, f) * a; n += a; a *= 0.5; f *= 2; }
      let v = s / n;
      v = Math.min(1, Math.max(0, (v - 0.5) * contrast + 0.5));
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { srgb: false, repeat });
}

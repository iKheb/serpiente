// =============================================================================
// ÓRBITA · Cielo profundo (A1): nebulosa volumétrica horneada + estrellas.
//  · La nebulosa se hornea UNA vez (por franjas, sin bloquear) en una "ventana de
//    cielo" RGBA: R densidad principal, G densidad secundaria, B filamentos de
//    emisión, A polvo oscuro. Se colorea en tiempo real con la paleta → cambiar
//    de paleta no cuesta nada.
//  · Nubes intermedias (billboards de la misma textura) dan paralaje volumétrico.
//  · Estrellas en capas (cercanas / lejanas) concentradas en la banda galáctica,
//    con temperatura de color, centelleo y difracción en las más brillantes.
// =============================================================================
import * as THREE from 'three';
import { SNOISE3, VNOISE } from './glsl.js';

export const SKY_RANGE = new THREE.Vector2(THREE.MathUtils.degToRad(160), THREE.MathUtils.degToRad(110));
const BAND_N = new THREE.Vector3(.38, .86, .2).normalize();

const BAKE_FRAG = /* glsl */`
uniform vec2 uRange, uSize; uniform float uSeed, uOct; uniform vec3 uBand;
${SNOISE3}
vec3 dirFromUv(vec2 uv){ float yaw = (uv.x - .5) * uRange.x; float pitch = (uv.y - .5) * uRange.y; return vec3(sin(yaw) * cos(pitch), sin(pitch), -cos(yaw) * cos(pitch)); }
void main(){
  vec2 uv = gl_FragCoord.xy / uSize;
  vec3 d = dirFromUv(uv);
  int oc = int(uOct);
  vec3 p = d * 2.1 + uSeed;
  vec3 q = vec3(fbm3(p, 3), fbm3(p + vec3(5.2, 1.3, 2.8), 3), fbm3(p + vec3(1.7, 9.2, 3.1), 3));
  vec3 r = p + q * 1.7;
  float n1 = fbm3(r * 1.1, oc);
  float bd = dot(d, uBand);
  float band = exp(-bd * bd * 7.);
  float dens = smoothstep(-.3, .7, n1) * (.18 + .95 * band);
  float n2 = fbm3(r * 1.8 + 3.1, oc - 1);
  float dens2 = smoothstep(-.15, .75, n2) * (.12 + .9 * band) * smoothstep(-.5, .3, n1);
  float rid = 1. - abs(fbm3(r * 2.7 + 7., oc));
  float fil = pow(clamp(rid, 0., 1.), 7.) * smoothstep(.0, .55, n1) * (.25 + band);
  float dl = smoothstep(.12, .62, fbm3(r * 2.2 - 4., oc - 1)) * band * smoothstep(-.2, .4, n1);
  gl_FragColor = vec4(dens, dens2, fil, dl);
}`;

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_Position.z = gl_Position.w * .99999; }`;

const SKY_FRAG = /* glsl */`
uniform sampler2D tNeb; uniform vec2 uRange; uniform vec3 uC0, uC1, uC2, uDeep; uniform float uNeb, uTime, uFine;
varying vec3 vDir;
${VNOISE}
void main(){
  vec3 d = normalize(vDir);
  float yaw = atan(d.x, -d.z); float pitch = asin(clamp(d.y, -1., 1.));
  vec2 uv = vec2(yaw / uRange.x + .5, pitch / uRange.y + .5);
  vec4 n = texture2D(tNeb, uv);
  float edge = smoothstep(0., .08, uv.x) * smoothstep(1., .92, uv.x) * smoothstep(0., .08, uv.y) * smoothstep(1., .92, uv.y);
  n *= edge;
  // Detalle fino en tiempo real (rompe el suavizado bilineal)
  float f = uFine > .5 ? vnoise(uv * vec2(420., 300.) + uTime * .02) * .5 + vnoise(uv * vec2(1100., 780.)) * .5 : .5;
  float dens = n.r * (.75 + .5 * f);
  vec3 col = uDeep * (.55 + 1.2 * n.r);
  col += uC0 * dens * .5;
  col += uC1 * n.g * (.8 + .4 * f) * .42;
  col += mix(uC2, vec3(1.), .25) * n.b * 1.25 * (.6 + .8 * f);
  col *= 1. - n.a * .82;
  gl_FragColor = vec4(col * uNeb, 1.);
}`;

const CLOUD_VERT = /* glsl */`
varying vec2 vUv; varying vec3 vDir;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vDir = normalize(w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`;
const CLOUD_FRAG = /* glsl */`
uniform sampler2D tNeb; uniform vec3 uC0, uC1; uniform float uA, uNeb; uniform vec4 uRect;
varying vec2 vUv;
void main(){
  vec2 uv = uRect.xy + vUv * uRect.zw;
  vec4 n = texture2D(tNeb, uv);
  vec2 c = vUv - .5; float m = smoothstep(.5, .12, length(c));
  float d = n.r * n.g * 1.6 + n.b * .4;
  vec3 col = mix(uC0, uC1, n.g) * d * m * uA * uNeb;
  gl_FragColor = vec4(col, 0.);
}`;

const STAR_VERT = /* glsl */`
attribute float aSize, aPhase, aBright, aSpike;
attribute vec3 aColor;
uniform float uTime, uPR, uTwinkle, uStar;
varying vec3 vC; varying float vSpike, vSharp;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * .99998;
  float tw = 1. - uTwinkle * (.5 + .5 * sin(uTime * (1.3 + aPhase * 2.7) + aPhase * 40.)) * (.35 + .4 * fract(aPhase * 7.3));
  float s = aSize * uPR;
  gl_PointSize = max(s, 2.);
  vSharp = mix(9., 5., aSpike);
  vC = aColor * aBright * tw * uStar * min(1., s / 2.);
  vSpike = aSpike;
}`;
const STAR_FRAG = /* glsl */`
varying vec3 vC; varying float vSpike, vSharp;
void main(){
  vec2 c = gl_PointCoord - .5; float r2 = dot(c, c) * 4.;
  float core = exp(-r2 * vSharp * (1. + vSpike * 6.));
  float halo = exp(-sqrt(r2) * 5.) * .18 * vSpike;
  float sp = 0.;
  if (vSpike > 0.) sp = (exp(-abs(c.x) * 70.) * exp(-abs(c.y) * 5.) + exp(-abs(c.y) * 70.) * exp(-abs(c.x) * 5.)) * vSpike * .9;
  float a = core + halo + sp;
  if (a < .004) discard;
  gl_FragColor = vec4(vC * a, 0.);
}`;

function starColor(rnd) {
  const t = rnd();
  if (t < .5) return [.78, .86, 1.0];        // azul-blanco
  if (t < .78) return [1.0, .98, .96];       // blanco
  if (t < .91) return [1.0, .88, .7];        // amarillo
  if (t < .97) return [1.0, .72, .55];       // naranja
  return [.85, .7, 1.0];                     // violáceo
}

export function createSky(renderer, o = {}) {
  const tier = o.tier ?? 1;
  const group = new THREE.Group();
  const W = tier >= 2 ? 2048 : tier === 1 ? 1536 : 1024;
  const H = Math.round(W * (SKY_RANGE.y / SKY_RANGE.x));
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const bakeMat = new THREE.ShaderMaterial({
    uniforms: {
      uRange: { value: SKY_RANGE }, uSize: { value: new THREE.Vector2(W, H) },
      uSeed: { value: o.seed ?? 3.7 }, uOct: { value: tier >= 2 ? 6 : tier === 1 ? 5 : 4 }, uBand: { value: BAND_N },
    },
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: BAKE_FRAG, depthTest: false, depthWrite: false,
  });
  const bakeScene = new THREE.Scene();
  const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMat);
  bakeQuad.frustumCulled = false;
  bakeScene.add(bakeQuad);
  const bakeCam = new THREE.Camera();
  const STRIPS = tier >= 2 ? 6 : 10;
  let strip = 0;

  const pal = {
    uC0: { value: new THREE.Color('#6d7cff') },
    uC1: { value: new THREE.Color('#ff5c9d') },
    uC2: { value: new THREE.Color('#a35bff') },
    uDeep: { value: new THREE.Color('#0a0c26').multiplyScalar(.5) },
  };
  const skyU = { tNeb: { value: rt.texture }, uRange: { value: SKY_RANGE }, uNeb: { value: 0 }, uTime: { value: 0 }, uFine: { value: tier >= 1 ? 1 : 0 }, ...pal };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 32), new THREE.ShaderMaterial({
    uniforms: skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
  }));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);

  // Nubes intermedias (paralaje)
  const clouds = [];
  const cloudDefs = [
    { pos: [-120, 70, -330], size: 380, rect: [.25, .45, .3, .3], a: .55 },
    { pos: [150, -10, -260], size: 300, rect: [.55, .35, .25, .25], a: .45 },
    { pos: [-30, 140, -420], size: 460, rect: [.4, .55, .3, .3], a: .4 },
  ];
  if (tier >= 1) for (const c of cloudDefs) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(c.size, c.size), new THREE.ShaderMaterial({
      uniforms: { tNeb: { value: rt.texture }, uC0: pal.uC0, uC1: pal.uC1, uA: { value: c.a }, uNeb: skyU.uNeb, uRect: { value: new THREE.Vector4(...c.rect) } },
      vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    m.position.set(...c.pos);
    m.lookAt(0, 0, 0);
    m.renderOrder = -8;
    clouds.push(m);
    group.add(m);
  }

  // Estrellas
  const N = o.stars ?? (tier >= 2 ? 9000 : tier === 1 ? 6000 : 3200);
  let s = 90210;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const size = new Float32Array(N), phase = new Float32Array(N), bright = new Float32Array(N), spike = new Float32Array(N);
  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    // dirección dentro de la ventana, sesgada hacia la banda galáctica
    let tries = 0;
    do {
      const yaw = (rnd() - .5) * SKY_RANGE.x * .95;
      const pitch = (rnd() - .5) * SKY_RANGE.y * .95;
      v.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const bd = v.dot(BAND_N);
      if (rnd() < .35 + .65 * Math.exp(-bd * bd * 9)) break;
    } while (++tries < 6);
    const near = rnd() < .22;
    const dist = near ? 70 + rnd() * 140 : 320 + rnd() * 480;
    pos[i * 3] = v.x * dist; pos[i * 3 + 1] = v.y * dist; pos[i * 3 + 2] = v.z * dist;
    const c = starColor(rnd);
    col.set(c, i * 3);
    const m = Math.pow(rnd(), 9);   // magnitud: casi todas débiles
    const isSpike = m > .45 && rnd() < .7;
    size[i] = isSpike ? 18 + m * 26 : 1.6 + m * 7 + (near ? .6 : 0);
    bright[i] = isSpike ? .9 + m * 1.5 : .25 + rnd() * .55 + m * 1.6;
    spike[i] = isSpike ? .6 + rnd() * .4 : 0;
    phase[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
  g.setAttribute('aSpike', new THREE.BufferAttribute(spike, 1));
  const starU = { uTime: { value: 0 }, uPR: { value: 1 }, uTwinkle: { value: device_twinkle(o) }, uStar: { value: 1 } };
  const stars = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: starU, vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  group.add(stars);

  const api = {
    group, sky, stars, clouds, rt,
    uniforms: { sky: skyU, star: starU, pal },
    baked: false,
    /** Hornea una franja por llamada. Devuelve true cuando ha terminado. */
    bakeStep(r = renderer) {
      if (api.baked) return true;
      const h0 = Math.floor((strip / STRIPS) * H), h1 = Math.floor(((strip + 1) / STRIPS) * H);
      const prevT = r.getRenderTarget();
      const prevAuto = r.autoClear;
      r.autoClear = false;
      rt.scissorTest = true;
      rt.scissor.set(0, h0, W, h1 - h0);
      rt.viewport.set(0, 0, W, H);
      r.setRenderTarget(rt);
      r.render(bakeScene, bakeCam);
      rt.scissorTest = false;
      r.setRenderTarget(prevT);
      r.autoClear = prevAuto;
      strip++;
      if (strip >= STRIPS) { api.baked = true; }
      return api.baked;
    },
    /** Reinicia el horneado (p. ej. tras perder el contexto). */
    rebake() { strip = 0; api.baked = false; },
    setPalette(c0, c1, c2, k = 1) {
      pal.uC0.value.lerp(c0, k); pal.uC1.value.lerp(c1, k); pal.uC2.value.lerp(c2, k);
    },
    update(t, pr) { skyU.uTime.value = t; starU.uTime.value = t; starU.uPR.value = pr; },
    dispose() {
      rt.dispose(); bakeMat.dispose(); bakeQuad.geometry.dispose();
      group.traverse((o2) => { o2.geometry?.dispose(); o2.material?.dispose(); });
    },
  };
  return api;
}

function device_twinkle(o) { return o.reducedMotion ? 0.05 : 0.6; }

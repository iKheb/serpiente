// =============================================================================
// ÓRBITA · Sistema planetario de la marca (A1): planeta gaseoso con gradiente
// índigo → violeta → magenta, atmósfera por dispersión (rayo-centro analítico),
// anillo (banda continua + miles de partículas en órbita kepleriana, sombra del
// planeta, gradiente ámbar → magenta → blanco del logotipo) y luna.
// Todo se construye con radio 1 y se escala con group.scale.
// Uniforms útiles: uForm (materialización 0..1), uReveal/uRevealOn (trazado del
// anillo con estela), uRingA, uMoonA, uAtmoI, uTime.
// =============================================================================
import * as THREE from 'three';
import { SNOISE3, VNOISE } from './glsl.js';

const C = (hex) => new THREE.Color(hex);

const PLANET_VERT = /* glsl */`
varying vec3 vN; varying vec3 vO; varying vec3 vW;
void main(){
  vO = normal;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const PLANET_FRAG = /* glsl */`
uniform vec3 uSunDir, uColA, uColB, uColC, uNight, uAtmoDay, uAtmoNight, uHot;
uniform float uTime, uSpin, uForm, uDetail, uBright;
varying vec3 vN; varying vec3 vO; varying vec3 vW;
${SNOISE3}
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  float cs = cos(uSpin), sn = sin(uSpin);
  vec3 p = vec3(cs * vO.x - sn * vO.z, vO.y, sn * vO.x + cs * vO.z);
  // Bandas de gigante gaseoso con turbulencia
  float w1 = snoise(p * vec3(1.4, 2.6, 1.4) + vec3(0., 0., uTime * .004));
  float w2 = uDetail > .5 ? snoise(p * vec3(3.5, 9., 3.5) + w1 * .7) : 0.;
  float lat = p.y + w1 * .08 + w2 * .03;
  float bands = .5 + .5 * sin(lat * 19. + w1 * 1.6);
  bands = mix(bands, .5 + .5 * sin(lat * 51. + w2 * 2.4), .3);
  // Tormenta
  vec3 sc = normalize(vec3(.55, -.32, .77));
  float sd = distance(p, sc);
  float storm = smoothstep(.2, .02, sd);
  // Gradiente de marca en diagonal de vista (como el isotipo)
  vec3 nv = normalize((viewMatrix * vec4(N, 0.)).xyz);
  float g = clamp(dot(nv.xy, vec2(.7071, -.7071)) * .6 + .5 + (bands - .5) * .14 + w2 * .05, 0., 1.);
  vec3 base = g < .5 ? mix(uColA, uColB, g * 2.) : mix(uColB, uColC, g * 2. - 1.);
  base *= .78 + .42 * bands;
  base = mix(base, uColC * 1.25 + vec3(.08, .02, .0), storm * .5);
  // Luz
  float ndl = dot(N, uSunDir);
  float diff = smoothstep(-.22, .95, ndl);
  vec3 col = base * (.035 + 1.18 * diff);
  col += uNight * (1. - diff) * (.55 + .45 * bands);
  vec3 H = normalize(uSunDir + V);
  col += vec3(1., .92, .95) * pow(max(dot(N, H), 0.), 26.) * .28 * diff;
  // Brillo amplio tipo logotipo (arriba-izquierda)
  col += vec3(.9, .9, 1.) * smoothstep(.55, 1., dot(nv, normalize(vec3(-.55, .6, .58)))) * .16 * diff;
  float fres = 1. - max(dot(N, V), 0.);
  vec3 atm = mix(uAtmoNight, uAtmoDay, smoothstep(-.35, .5, ndl));
  col += atm * pow(fres, 2.4) * (.18 + 1.5 * smoothstep(-.45, .7, ndl));
  col *= uBright;
  // Materialización desde la luz
  if (uForm < 1.) {
    float n = snoise(p * 2.6 + 3.) * .5 + .5;
    float edge = uForm * 1.3 - .15;
    if (n > edge) discard;
    float rim = smoothstep(edge - .14, edge, n);
    col = mix(col, uHot * 5., rim);
    col += uHot * pow(1. - uForm, 2.) * 2.2;
  }
  gl_FragColor = vec4(col, 1.);
}`;

const ATMO_VERT = /* glsl */`
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const ATMO_FRAG = /* glsl */`
uniform vec3 uCenter, uSunDir, uAtmoDay, uAtmoNight;
uniform float uR, uAtmoI, uShell;
varying vec3 vW;
void main(){
  vec3 ro = cameraPosition; vec3 rd = normalize(vW - ro);
  vec3 oc = uCenter - ro; float tca = dot(oc, rd);
  vec3 cp = ro + rd * tca;
  float d = length(cp - uCenter) / uR;
  float h = d - 1.;
  vec3 nrm = normalize(cp - uCenter);
  float sun = dot(nrm, uSunDir);
  float lit = smoothstep(-.5, .55, sun);
  float g = h > 0. ? (exp(-h * 11.) * .9 + .22 * exp(-h * 3.)) : exp(h * 30.) * .9;
  g *= smoothstep(uShell, uShell - .18, d);
  vec3 col = mix(uAtmoNight * .4, uAtmoDay, lit) * g * (.12 + 1.9 * lit) * uAtmoI;
  gl_FragColor = vec4(col, 1.);
}`;

const RING_VERT = /* glsl */`
varying vec3 vL; varying vec3 vW;
void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const RING_FRAG = /* glsl */`
uniform vec3 uCenter, uSunDir, uRc0, uRc1, uRc2;
uniform float uR, uRingA, uReveal, uRevealOn, uRevealStart, uTime, uIn, uOut;
varying vec3 vL; varying vec3 vW;
${VNOISE}
void main(){
  float r = length(vL.xy);
  float t = (r - uIn) / (uOut - uIn);
  float n = vnoise(vec2(t * 34., 1.7)) * .55 + vnoise(vec2(t * 110., 5.3)) * .45;
  float dens = smoothstep(0., .1, t) * smoothstep(1., .78, t);
  dens *= .3 + .7 * n;
  dens *= 1. - .9 * exp(-pow((t - .62) / .03, 2.));
  dens *= 1. - .55 * exp(-pow((t - .27) / .06, 2.));
  dens *= .55 + .45 * smoothstep(.15, .5, t);
  float gx = clamp(vL.x / uOut * .5 + .5, 0., 1.);
  vec3 col = gx < .55 ? mix(uRc0, uRc1, gx / .55) : mix(uRc1, uRc2, (gx - .55) / .45);
  vec3 toP = vW - uCenter; float along = dot(toP, uSunDir);
  float perp = length(toP - along * uSunDir) / uR;
  float sh = along < 0. ? mix(.06, 1., smoothstep(.95, 1.05, perp)) : 1.;
  vec3 V = normalize(cameraPosition - vW);
  float fwd = pow(max(dot(-V, uSunDir), 0.), 5.);
  float a = dens * uRingA;
  float hot = 0.;
  if (uRevealOn > .5) {
    float ang = atan(vL.y, vL.x);
    float aa = mod(ang - uRevealStart, 6.2831853);
    float dA = uReveal - aa;
    float rv = smoothstep(0., .05, dA);
    hot = rv * exp(-dA * 2.6) * 2.5;
    a *= rv;
  }
  vec3 c = col * a * sh * (.65 + 1.2 * fwd) + col * hot * dens * 1.4;
  gl_FragColor = vec4(c, a * .35 * sh);
}`;

const PART_VERT = /* glsl */`
attribute float aR, aA, aH, aS, aB, aK;
uniform vec3 uCenter, uSunDir, uRc0, uRc1, uRc2;
uniform float uR, uTime, uOrbit, uProj, uRingA, uReveal, uRevealOn, uRevealStart, uOut;
varying vec3 vC; varying float vA;
void main(){
  float w = .32 * pow(aR, -1.5);
  float ang = aA + w * uTime * uOrbit;
  vec3 local = vec3(cos(ang) * aR, sin(ang) * aR, aH);
  vec4 wp = modelMatrix * vec4(local, 1.);
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  float px = aS * uR * uProj / -mv.z;
  gl_PointSize = max(px, 1.6);
  float fade = clamp(px / 1.6, 0., 1.);
  float gx = clamp(local.x / uOut * .5 + .5, 0., 1.);
  vec3 col = gx < .55 ? mix(uRc0, uRc1, gx / .55) : mix(uRc1, uRc2, (gx - .55) / .45);
  col = mix(col, vec3(1.), aK * .55);
  vec3 toP = wp.xyz - uCenter; float along = dot(toP, uSunDir);
  float perp = length(toP - along * uSunDir) / uR;
  float sh = along < 0. ? mix(.04, 1., smoothstep(.95, 1.06, perp)) : 1.;
  float a = aB * uRingA * fade * fade * sh;
  float hot = 0.;
  if (uRevealOn > .5) {
    float aa = mod(ang - uRevealStart, 6.2831853);
    float dA = uReveal - aa;
    float rv = smoothstep(0., .06, dA);
    hot = rv * exp(-dA * 2.2) * 3.;
    a *= rv;
  }
  vC = col * a * (1. + hot);
  vA = a;
}`;

const PART_FRAG = /* glsl */`
varying vec3 vC; varying float vA;
void main(){
  vec2 c = gl_PointCoord - .5; float d = dot(c, c) * 4.;
  float k = exp(-d * 3.2);
  if (k < .01) discard;
  gl_FragColor = vec4(vC * k, 0.);
}`;

const MOON_FRAG = /* glsl */`
uniform vec3 uSunDir; uniform float uMoonA;
varying vec3 vN; varying vec3 vO; varying vec3 vW;
void main(){
  vec3 N = normalize(vN); vec3 V = normalize(cameraPosition - vW);
  float d = max(dot(N, uSunDir), 0.);
  float fres = pow(1. - max(dot(N, V), 0.), 3.);
  vec3 col = vec3(1., .97, .99) * (.08 + 1.6 * d) + vec3(.8, .75, 1.) * fres * .6;
  gl_FragColor = vec4(col * uMoonA, 1.);
}`;

const GLOW_VERT = /* glsl */`
uniform float uSize, uPR; void main(){ vec4 mv = modelViewMatrix * vec4(0., 0., 0., 1.); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * uPR; }`;
const GLOW_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uI;
void main(){ vec2 c = gl_PointCoord - .5; float d = length(c) * 2.; float g = exp(-d * 5.) * .9 + exp(-d * 16.) * 2.; g *= smoothstep(1., .6, d); gl_FragColor = vec4(uColor * g * uI, 0.); }`;

/**
 * Crea el sistema planetario.
 * @param {{ tier?: number, particles?: number }} o
 */
export function createPlanetSystem(o = {}) {
  const tier = o.tier ?? 1;
  const group = new THREE.Group();
  const sunDir = new THREE.Vector3(-.62, .5, .62).normalize();
  const center = new THREE.Vector3();
  const shared = {
    uSunDir: { value: sunDir },
    uCenter: { value: center },
    uR: { value: 1 },
    uTime: { value: 0 },
    uAtmoDay: { value: C('#8a7dff').multiplyScalar(1.15) },
    uAtmoNight: { value: C('#3a2a9a') },
  };
  // --- Planeta
  const seg = tier >= 2 ? 128 : tier === 1 ? 96 : 64;
  const planetU = {
    ...shared,
    uColA: { value: C('#7d8bff') }, uColB: { value: C('#a35bff') }, uColC: { value: C('#ff5c9d') },
    uNight: { value: C('#120d36') },
    uHot: { value: C('#ffe9ff') },
    uSpin: { value: 0 }, uForm: { value: 1 }, uDetail: { value: tier >= 1 ? 1 : 0 }, uBright: { value: 1 },
  };
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.round(seg * .66)), new THREE.ShaderMaterial({
    uniforms: planetU, vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG,
  }));
  planet.renderOrder = 1;
  group.add(planet);

  // --- Atmósfera
  const atmoU = { ...shared, uAtmoI: { value: 1 }, uShell: { value: 1.42 } };
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.42, 64, 48), new THREE.ShaderMaterial({
    uniforms: atmoU, vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  atmo.renderOrder = 3;
  group.add(atmo);

  // --- Anillo (inclinado como el isotipo)
  const ring = new THREE.Group();
  ring.rotation.set(-Math.PI / 2 + .3, 0, 0);
  const tilt = new THREE.Group();
  tilt.rotation.z = .3;
  tilt.add(ring);
  group.add(tilt);
  const IN = 1.45, OUT = 2.55;
  const ringU = {
    ...shared,
    uRc0: { value: C('#ffb35c') }, uRc1: { value: C('#ff5c9d') }, uRc2: { value: C('#ffffff') },
    uRingA: { value: 1 }, uReveal: { value: 7 }, uRevealOn: { value: 0 }, uRevealStart: { value: 2.4 },
    uIn: { value: IN }, uOut: { value: OUT },
  };
  const band = new THREE.Mesh(new THREE.RingGeometry(IN, OUT, tier >= 1 ? 256 : 160, 1), new THREE.ShaderMaterial({
    uniforms: ringU, vertexShader: RING_VERT, fragmentShader: RING_FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  }));
  band.renderOrder = 2;
  ring.add(band);

  const N = o.particles ?? (tier >= 2 ? 9000 : tier === 1 ? 5000 : 2400);
  const aR = new Float32Array(N), aA = new Float32Array(N), aH = new Float32Array(N), aS = new Float32Array(N), aB = new Float32Array(N), aK = new Float32Array(N);
  let s = 1337;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    // distribución por bandas (más densidad en la zona media, hueco de Cassini)
    let t;
    do { t = rnd(); } while (Math.abs(t - .62) < .03 && rnd() < .9);
    t = Math.pow(t, .9);
    aR[i] = IN + (OUT + .25 - IN) * t;
    aA[i] = rnd() * Math.PI * 2;
    aH[i] = (rnd() - .5) * .035 * (1 + t);
    const big = rnd() < .03;
    aS[i] = big ? .035 + rnd() * .03 : .008 + rnd() * .014;
    aB[i] = (big ? 1.1 : .35 + rnd() * .55) * (t > 1 ? .4 : 1);
    aK[i] = rnd() < .2 ? rnd() : 0;
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  pg.setAttribute('aR', new THREE.BufferAttribute(aR, 1));
  pg.setAttribute('aA', new THREE.BufferAttribute(aA, 1));
  pg.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
  pg.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  pg.setAttribute('aB', new THREE.BufferAttribute(aB, 1));
  pg.setAttribute('aK', new THREE.BufferAttribute(aK, 1));
  pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), OUT + .5);
  const partU = { ...ringU, uOrbit: { value: 1 }, uProj: { value: 800 } };
  const parts = new THREE.Points(pg, new THREE.ShaderMaterial({
    uniforms: partU, vertexShader: PART_VERT, fragmentShader: PART_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  parts.renderOrder = 4;
  ring.add(parts);

  // --- Luna
  const moonU = { ...shared, uMoonA: { value: 1 } };
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), new THREE.ShaderMaterial({
    uniforms: moonU, vertexShader: PLANET_VERT, fragmentShader: MOON_FRAG,
  }));
  moon.scale.setScalar(.085);
  const moonPivot = new THREE.Group();
  moonPivot.add(moon);
  group.add(moonPivot);
  const glowU = { uColor: { value: C('#d9d4ff') }, uI: { value: .55 }, uSize: { value: 60 }, uPR: { value: 1 } };
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
  const moonGlow = new THREE.Points(glowGeo, new THREE.ShaderMaterial({
    uniforms: glowU, vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
  }));
  moonGlow.renderOrder = 6;
  moonGlow.frustumCulled = false;
  moon.add(moonGlow);
  moon.position.set(2.85, 0, 0);
  moonPivot.rotation.set(.25, 0, .55);
  let moonAngle = .9;

  const tmp = new THREE.Vector3();
  const api = {
    group, planet, atmo, ring, tilt, band, parts, moon, moonPivot, moonGlow,
    uniforms: { shared, planet: planetU, atmo: atmoU, ring: ringU, parts: partU, moon: moonU, glow: glowU },
    sunDir,
    moonSpeed: .035,
    spinSpeed: .012,
    /** Avanza la simulación. cam: cámara activa (para el tamaño de partículas). */
    update(t, dt, cam, renderH, pr = 1) {
      shared.uTime.value = t;
      planetU.uSpin.value += dt * api.spinSpeed;
      moonAngle += dt * api.moonSpeed;
      moon.position.set(Math.cos(moonAngle) * 2.85, 0, Math.sin(moonAngle) * 2.85);
      group.updateMatrixWorld();
      group.getWorldPosition(center);
      group.getWorldScale(tmp);
      shared.uR.value = tmp.x;
      if (cam) partU.uProj.value = renderH / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      glowU.uPR.value = pr;
    },
    setMoonAngle(a) { moonAngle = a; },
    dispose() {
      group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    },
  };
  return api;
}

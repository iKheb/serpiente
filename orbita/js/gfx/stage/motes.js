// =============================================================================
// ÓRBITA · Partículas atmosféricas (A1): motas / bokeh / polvo cósmico en 3D real
// delante del hero o del universo. Paralaje auténtico con la cámara, desenfoque
// por profundidad (círculos de confusión con borde), color según paleta.
// =============================================================================
import * as THREE from 'three';

const VERT = /* glsl */`
attribute vec3 aSeed; attribute float aSize, aKind;
uniform float uTime, uPR, uProj, uRise, uAspect, uScroll;
uniform vec3 uC1, uC2, uC3;
uniform float uI;
varying vec3 vC; varying float vBlur, vA;
void main(){
  vec3 box = vec3(13. * max(uAspect, .7), 9., 15.);
  vec3 p = position;
  p.y += uTime * uRise * (.25 + aSeed.x * .6);
  p.x += sin(uTime * (.11 + aSeed.y * .2) + aSeed.z * 30.) * .55;
  p.z += cos(uTime * (.07 + aSeed.x * .1) + aSeed.y * 20.) * .4;
  p.y += uScroll * 6. * (.4 + aSeed.z);
  p = mod(p + box * .5, box) - box * .5;
  p.z -= 9.;                          // z ∈ [-16.5, -1.5]
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  float z = -mv.z;
  float focus = 8.5;
  float coc = abs(z - focus) / z;      // círculo de confusión
  float px = aSize * uProj / z * (1. + coc * 3.2);
  gl_PointSize = clamp(px * uPR, 1.5, 140.);
  vBlur = clamp(coc * 2.2, 0., 1.);
  float edge = smoothstep(1.4, 3., z) * smoothstep(17., 13., z);
  float tw = .65 + .35 * sin(uTime * (.6 + aSeed.y * 1.4) + aSeed.x * 50.);
  vec3 col = aKind < .5 ? uC2 : (aKind < .85 ? uC3 : mix(uC1, vec3(1.), .5));
  vC = col;
  vA = uI * edge * tw / (1. + vBlur * vBlur * 6.) * (aKind > .97 ? 2.2 : 1.);
}`;

const FRAG = /* glsl */`
varying vec3 vC; varying float vBlur, vA;
void main(){
  vec2 c = gl_PointCoord - .5; float r = length(c) * 2.;
  float hard = mix(18., 4.5, vBlur);
  float disc = 1. - smoothstep(1. - 1. / hard * 3., 1., r);
  float core = exp(-r * r * mix(5., 1.2, vBlur));
  float ring = smoothstep(.55, .95, r) * disc * vBlur * .5;
  float a = mix(core, disc * .55 + ring, vBlur);
  if (a < .003) discard;
  gl_FragColor = vec4(vC * a * vA, 0.);
}`;

export class Motes {
  constructor({ device, count }) {
    const tier = device.tier;
    const N = count ?? (tier >= 2 ? 420 : tier === 1 ? 240 : 110);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, .1, 60);
    let s = 4242;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pos = new Float32Array(N * 3), seed = new Float32Array(N * 3), size = new Float32Array(N), kind = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (rnd() - .5) * 30; pos[i * 3 + 1] = (rnd() - .5) * 20; pos[i * 3 + 2] = (rnd() - .5) * 15;
      seed[i * 3] = rnd(); seed[i * 3 + 1] = rnd(); seed[i * 3 + 2] = rnd();
      size[i] = .012 + Math.pow(rnd(), 3) * .05;
      kind[i] = rnd();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    this.uniforms = {
      uTime: { value: 0 }, uPR: { value: 1 }, uProj: { value: 800 }, uRise: { value: device.reducedMotion ? .02 : .16 },
      uAspect: { value: 1.7 }, uScroll: { value: 0 }, uI: { value: .5 },
      uC1: { value: new THREE.Color('#6d7cff') }, uC2: { value: new THREE.Color('#a35bff') }, uC3: { value: new THREE.Color('#ffd0e4') },
    };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  layout(aspect, renderH) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.uniforms.uAspect.value = aspect;
    this.uniforms.uProj.value = renderH / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
  }

  setColors(c1, c2, c3, k = 1) {
    const u = this.uniforms;
    u.uC1.value.lerp(c1, k); u.uC2.value.lerp(c2, k); u.uC3.value.lerp(c3, k);
  }

  update(t, cam, pr) {
    this.uniforms.uTime.value = t;
    this.uniforms.uPR.value = 1; // uProj ya está en píxeles de render
    this.camera.position.set(cam.x * .9, cam.y * .55, 0);
    this.camera.lookAt(cam.x * .2, cam.y * .1, -20);
    void pr;
  }

  dispose() { this.points.geometry.dispose(); this.points.material.dispose(); }
}

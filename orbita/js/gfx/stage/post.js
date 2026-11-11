// =============================================================================
// ÓRBITA · Postproceso del escenario y la intro (A1).
// Escena HDR → UnrealBloomPass (según nivel) → pase final propio:
//   tone mapping (ACES para el universo, hombro suave para imágenes del hero),
//   aberración cromática radial, viñeta, scrims de legibilidad (izquierda / abajo /
//   arriba) fundidos a #070913, atenuación global, destello, grano y tramado.
// =============================================================================
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { COLOR, HASH } from './glsl.js';

const FINAL_FRAG = /* glsl */`
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uTime, uHeroMix, uExposure, uDim, uFlash, uGrain, uVig, uCA, uScrimL, uScrimB, uScrimT, uPortrait, uFade;
uniform vec3 uBg, uFlashColor;
varying vec2 vUv;
${HASH}
${COLOR}
vec3 grade(vec3 c){
  vec3 u = acesFilmic(c * uExposure);
  vec3 h = softShoulder(c * uExposure);
  return mix(u, h, uHeroMix);
}
void main(){
  vec2 uv = vUv;
  vec2 cc = uv - .5;
  vec3 col;
  if (uCA > 0.) {
    vec2 off = cc * dot(cc, cc) * uCA;
    col.r = texture2D(tScene, uv - off).r;
    col.g = texture2D(tScene, uv).g;
    col.b = texture2D(tScene, uv + off).b;
  } else col = texture2D(tScene, uv).rgb;
  col = grade(col);
  col = toSRGB(col);

  // Viñeta óptica
  float asp = uRes.x / uRes.y;
  vec2 vq = cc * vec2(mix(1., asp, .5), 1.);
  float vig = smoothstep(1.05, .25, length(vq) * 1.15);
  col *= mix(1., vig, uVig);

  // Scrims de legibilidad, en espacio de pantalla
  vec3 bg = uBg;
  // Izquierda (texto del hero en escritorio/TV): más denso en el centro-bajo
  float l = smoothstep(.66, 0., uv.x);
  l = l * l * (3. - 2. * l);
  float lv = mix(.78, 1., smoothstep(.95, .45, uv.y));
  col = mix(col, bg * .6, clamp(l * lv * uScrimL, 0., 1.));
  // Inferior: funde al color de la app para que las filas se apoyen sin corte
  float b0 = mix(.0, .3, uPortrait), b1 = mix(.5, .66, uPortrait);
  float b = smoothstep(b1, b0, uv.y);
  b = pow(b, 1.35);
  col = mix(col, bg, clamp(b * uScrimB, 0., 1.));
  // Superior: legibilidad de la barra
  float t = smoothstep(.8, 1., uv.y);
  col = mix(col, bg * .5, t * t * uScrimT);

  // Atenuación global hacia el fondo
  col = mix(bg, col, uDim);

  // Destello (intro / impacto)
  col += uFlashColor * uFlash;

  // Grano de película (más presente en medios tonos) + tramado anti-bandas
  float n = hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 517.) - .5;
  float n2 = hash12(gl_FragCoord.xy * 1.37 + fract(uTime * 3.17) * 211.) - .5;
  float lum = luma(col);
  col += n * uGrain * (.35 + lum * (1. - lum) * 2.6);
  col += (n2) / 255.;
  col = mix(bg, col, uFade);
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;

export class Post {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{ bloom?: boolean, hdr?: boolean, bloomStrength?: number, bloomRadius?: number, bloomThreshold?: number }} o
   */
  constructor(renderer, o = {}) {
    this.renderer = renderer;
    this.bloomEnabled = o.bloom !== false;
    const hdr = o.hdr !== false;
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
      depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    if (this.bloomEnabled) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), o.bloomStrength ?? .6, o.bloomRadius ?? .55, o.bloomThreshold ?? .82);
      this.bloomScale = o.bloomScale ?? 1; // <1 → bloom a menor resolución
    }
    this.uniforms = {
      tScene: { value: this.rt.texture },
      uRes: { value: new THREE.Vector2(4, 4) },
      uTime: { value: 0 },
      uHeroMix: { value: 0 },
      uExposure: { value: 1 },
      uDim: { value: 1 },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(1, 1, 1) },
      uGrain: { value: .04 },
      uVig: { value: .5 },
      uCA: { value: .0 },
      uScrimL: { value: 0 },
      uScrimB: { value: 0 },
      uScrimT: { value: 0 },
      uPortrait: { value: 0 },
      uFade: { value: 1 },
      uBg: { value: new THREE.Vector3(7 / 255, 9 / 255, 19 / 255) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: FINAL_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  setSize(w, h, pr) {
    const W = Math.max(2, Math.floor(w * pr)), H = Math.max(2, Math.floor(h * pr));
    this.rt.setSize(W, H);
    this.uniforms.uRes.value.set(W, H);
    if (this.bloom) this.bloom.setSize(Math.max(2, Math.floor(W * this.bloomScale)), Math.max(2, Math.floor(H * this.bloomScale)));
  }

  /** Comienza el frame: deja el render target de escena activo y limpio. */
  begin(clearColor = 0x000000) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.setClearColor(clearColor, 1);
    r.clear(true, true, false);
  }

  /** Bloom + pase final a pantalla. */
  end(dt = 0.016) {
    const r = this.renderer;
    if (this.bloom && this.bloom.strength > 0.001) this.bloom.render(r, null, this.rt, dt, false);
    r.setRenderTarget(null);
    this.quad.render(r);
  }

  dispose() {
    this.rt.dispose();
    this.bloom?.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}

// =============================================================================
// Órbita · pasada final de emisión (A2)
// Entrada: color lineal HDR (tras bloom). Hace: aberración cromática radial,
// "compresión de broadcast" (submuestreo de croma + bandas) en calidades bajas,
// exposición + ACES filmic, viñeta, grano de película en espacio perceptual,
// fundido a negro. La salida sigue en lineal → OutputPass convierte a sRGB.
// =============================================================================
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

export const BroadcastFinalShader = {
  name: 'BroadcastFinalShader',
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1920, 1080) },
    uTime: { value: 0 },
    uGrain: { value: 0.06 },
    uVignette: { value: 0.35 },
    uAberration: { value: 0.25 },
    uExposure: { value: 1.0 },
    uCompress: { value: 0 },
    uFade: { value: 0 },
    uSaturation: { value: 1.0 },
    uLift: { value: new THREE.Vector3(0, 0, 0) },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uTime, uGrain, uVignette, uAberration, uExposure, uCompress, uFade, uSaturation;
    uniform vec3 uLift, uGain;
    varying vec2 vUv;

    vec3 RRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 acesFilmic(vec3 color) {
      const mat3 ACESInputMat = mat3(
        vec3(0.59719, 0.07600, 0.02840),
        vec3(0.35458, 0.90834, 0.13383),
        vec3(0.04823, 0.01566, 0.83777));
      const mat3 ACESOutputMat = mat3(
        vec3( 1.60475, -0.10208, -0.00327),
        vec3(-0.53108,  1.10813, -0.07276),
        vec3(-0.07367, -0.00605,  1.07602));
      color *= 1.0 / 0.6;
      color = ACESInputMat * color;
      color = RRTAndODTFit(color);
      color = ACESOutputMat * color;
      return clamp(color, 0.0, 1.0);
    }
    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      vec3 col;
      if (uAberration > 0.001) {
        vec2 off = c * uAberration * 0.0075 * (0.25 + 2.2 * r2);
        col.r = texture2D(tDiffuse, uv - off).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv + off).b;
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }

      // Compresión: croma de bloques 2×2 (sangrado de color) conservando la luma
      if (uCompress > 0.001) {
        vec2 px = 1.0 / uRes;
        vec2 bc = (floor(uv * uRes * 0.5) + 0.5) * 2.0 * px;
        vec3 cs = (texture2D(tDiffuse, bc).rgb + texture2D(tDiffuse, bc + vec2(px.x * 2.0, 0.0)).rgb) * 0.5;
        float y = dot(col, LUMA);
        float ys = dot(cs, LUMA);
        vec3 sub = max(cs + (y - ys), 0.0);
        col = mix(col, sub, clamp(uCompress, 0.0, 1.0) * 0.9);
      }

      col = max(col * uExposure, 0.0);
      col = acesFilmic(col);

      // Etalonaje sencillo (lift / gain / saturación)
      col = col * uGain + uLift * (1.0 - col);
      float l = dot(col, LUMA);
      col = max(mix(vec3(l), col, uSaturation), 0.0);

      // Viñeta con corrección de aspecto
      vec2 vc = c * vec2(uRes.x / uRes.y, 1.0);
      float vig = 1.0 - smoothstep(0.18, 1.25, length(vc) * 1.05);
      col *= mix(1.0, vig, uVignette);

      // Grano en espacio perceptual (más visible en medios tonos)
      vec3 g = pow(col, vec3(1.0 / 2.2));
      if (uGrain > 0.0001) {
        vec2 seed = gl_FragCoord.xy + vec2(fract(uTime * 13.37) * 431.0, fract(uTime * 7.91) * 197.0);
        float n = hash12(seed) + hash12(seed + 17.31) - 1.0;
        float lum = dot(g, vec3(0.299, 0.587, 0.114));
        float w = 0.35 + 1.4 * lum * (1.0 - lum);
        g += n * uGrain * w;
      }
      // Bandas de cuantización en gradientes (bitrate bajo)
      if (uCompress > 0.001) {
        float q = mix(160.0, 44.0, clamp(uCompress, 0.0, 1.0));
        vec2 blk = floor(gl_FragCoord.xy / 8.0);
        float d = (hash12(blk) - 0.5) * 0.6;
        g = mix(g, (floor(g * q + 0.5 + d) ) / q, 0.55 * uCompress);
      }
      g *= 1.0 - uFade;
      col = pow(max(g, 0.0), vec3(2.2));
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createFinalPass() {
  return new ShaderPass(BroadcastFinalShader);
}

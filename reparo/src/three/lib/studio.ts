/**
 * Iluminación de estudio compartida: RoomEnvironment (PMREM) oscurecido con
 * tiras de luz de marca (iris y cian) para bordes luminosos, luces de contorno,
 * partículas bokeh, halo y sombra de contacto.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  NormalBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  ShaderMaterial,
  type Object3D,
  type Scene,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BRAND } from './palette';
import { radialTexture, rng } from './canvas';
import type { ThemeName } from './env';

/* ============================================================ Entorno */

export interface StudioEnv {
  texture: Texture;
  dispose(): void;
}

function strip(color: string, intensity: number, pos: [number, number, number], scale: [number, number, number]) {
  const m = new Mesh(
    new BoxGeometry(),
    new MeshLambertMaterial({ color: 0x000000, emissive: new Color(color), emissiveIntensity: intensity }),
  );
  m.position.set(...pos);
  m.scale.set(...scale);
  return m;
}

/** Genera el mapa de entorno PMREM (una vez por renderer). */
export function createStudioEnvironment(renderer: WebGLRenderer): StudioEnv {
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  // Paredes oscuras → reflejos contrastados de "softbox" sobre negro.
  room.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh && (mesh.material as MeshStandardMaterial).isMeshStandardMaterial) {
      (mesh.material as MeshStandardMaterial).color.setScalar(0.1);
    }
  });
  // Tiras de luz de marca, detrás y a los lados del sujeto (contraluz).
  room.add(strip(BRAND.iris, 26, [-12.5, 7, -6.5], [0.4, 18, 2.6]));
  room.add(strip(BRAND.cyan, 22, [12.5, 7, -6.5], [0.4, 18, 2.6]));
  room.add(strip(BRAND.blue, 10, [0, 22, -9], [14, 0.3, 1.6]));
  // Softbox frontal largo y suave (reflejo limpio en el vidrio).
  room.add(strip('#ffffff', 7, [-4, 9, 13], [6, 9, 0.2]));
  const rt: WebGLRenderTarget = pmrem.fromScene(room, 0.03);
  room.dispose();
  pmrem.dispose();
  return { texture: rt.texture, dispose: () => rt.dispose() };
}

/* ============================================================== Luces */

export interface StudioLights {
  group: Object3D[];
  setTheme(theme: ThemeName): void;
}

export function addStudioLights(scene: Scene): StudioLights {
  const key = new DirectionalLight(0xffffff, 1.4);
  key.position.set(3, 6, 8);
  const iris = new DirectionalLight(new Color(BRAND.iris), 5);
  iris.position.set(-7, 3, -5);
  const cyan = new DirectionalLight(new Color(BRAND.cyan), 4.2);
  cyan.position.set(7, -2, -5);
  const fill = new DirectionalLight(0xbfc8ff, 0.5);
  fill.position.set(-4, -3, 6);
  const group = [key, iris, cyan, fill];
  group.forEach((l) => scene.add(l));
  return {
    group,
    setTheme(theme) {
      const light = theme === 'light';
      key.intensity = light ? 1.7 : 1.4;
      iris.intensity = light ? 3.2 : 5;
      cyan.intensity = light ? 2.6 : 4.2;
      fill.intensity = light ? 0.9 : 0.5;
    },
  };
}

/* ============================================================== Bokeh */

const bokehVertex = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uScale;
  uniform float uDrift;
  uniform vec2 uWrapY;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSize;
  void main() {
    vec3 p = position;
    float t = uTime * uDrift;
    p.y += sin(t * 0.32 + aSeed * 6.283) * 0.35 + t * 0.05 * (0.5 + aSeed);
    p.y = mod(p.y - uWrapY.x + uWrapY.y, 2.0 * uWrapY.y) + uWrapY.x - uWrapY.y;
    p.x += cos(t * 0.21 + aSeed * 12.0) * 0.25;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * uScale / max(-mv.z, 0.1);
    vSize = gl_PointSize / uPixelRatio;
    float tw = 0.65 + 0.35 * sin(uTime * (0.7 + aSeed * 1.3) + aSeed * 40.0);
    // desvanecer por profundidad (niebla) y por desenfoque (discos grandes = tenues)
    float fog = clamp(1.0 - (-mv.z - 8.0) / 60.0, 0.0, 1.0);
    float dof = mix(1.0, 0.32, smoothstep(6.0, 70.0, vSize));
    vAlpha = tw * fog * dof;
    vColor = aColor;
  }
`;

const bokehFragment = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSize;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    // destello nítido (polvo) ↔ disco bokeh suave según el tamaño en pantalla
    float k = smoothstep(4.0, 22.0, vSize);
    float glint = exp(-d * d * 9.0);
    float soft = 1.0 - smoothstep(1.0 - 0.6 / max(vSize * 0.15, 1.0) - 0.12, 1.0, d);
    float rim = smoothstep(0.62, 0.92, d) * soft;
    float disc = soft * (0.55 + 0.25 * rim) + glint * 0.18;
    float a = mix(glint, disc * 0.62, k) * vAlpha * uOpacity;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

export interface BokehOptions {
  count: number;
  /** Caja de distribución: [x, y, z] semiejes. */
  spread: [number, number, number];
  center?: [number, number, number];
  size?: [number, number];
  seed?: number;
  /** Deja libre un hueco central (para no tapar el sujeto). */
  avoidRadius?: number;
}

export class Bokeh {
  readonly points: Points;
  private material: ShaderMaterial;

  constructor(o: BokehOptions) {
    const rand = rng(o.seed ?? 3);
    const n = o.count;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const seed = new Float32Array(n);
    const palette = [new Color(BRAND.iris), new Color(BRAND.blue), new Color(BRAND.cyan), new Color('#ffffff')];
    const [sx, sy, sz] = o.spread;
    const [cx, cy, cz] = o.center ?? [0, 0, 0];
    const [smin, smax] = o.size ?? [20, 90];
    for (let i = 0; i < n; i++) {
      let x = 0;
      let y = 0;
      let z = 0;
      for (let k = 0; k < 8; k++) {
        x = (rand() * 2 - 1) * sx;
        y = (rand() * 2 - 1) * sy;
        z = (rand() * 2 - 1) * sz;
        if (!o.avoidRadius || Math.hypot(x, y * 0.6) > o.avoidRadius || z < -2) break;
      }
      pos.set([x + cx, y + cy, z + cz], i * 3);
      const c = palette[Math.floor(rand() * 3)];
      const w = rand() < 0.1 ? 0.85 : 0;
      col.set([c.r * (1 - w) + w, c.g * (1 - w) + w, c.b * (1 - w) + w], i * 3);
      size[i] = smin + Math.pow(rand(), 2.2) * (smax - smin);
      seed[i] = rand();
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new BufferAttribute(col, 3));
    geo.setAttribute('aSize', new BufferAttribute(size, 1));
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1));
    this.material = new ShaderMaterial({
      vertexShader: bokehVertex,
      fragmentShader: bokehFragment,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: 1 },
        uScale: { value: 1 },
        uOpacity: { value: 1 },
        uDrift: { value: 1 },
        uWrapY: { value: [cy, sy * 1.15] },
      },
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
    });
    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = -1;
    this.setTheme('dark');
  }

  setTheme(theme: ThemeName) {
    const m = this.material;
    m.blendSrc = OneFactor;
    m.blendSrcAlpha = OneFactor;
    m.blendDstAlpha = OneMinusSrcAlphaFactor;
    if (theme === 'light') {
      m.blendDst = OneMinusSrcAlphaFactor;
      m.uniforms.uOpacity.value = 0.55;
    } else {
      m.blendDst = OneFactor; // aditivo: brillo
      m.uniforms.uOpacity.value = 0.95;
    }
    m.needsUpdate = true;
  }

  update(time: number, pixelRatio: number, scale: number, drift = 1) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uPixelRatio.value = pixelRatio;
    u.uScale.value = scale;
    u.uDrift.value = drift;
  }
}

/* ================================================= Halo y sombra de contacto */

const GLOW_STOPS = {
  iris: [
    [0, 'rgba(139,123,255,0.9)'],
    [0.3, 'rgba(124,108,255,0.45)'],
    [0.62, 'rgba(91,140,255,0.12)'],
    [1, 'rgba(91,140,255,0)'],
  ],
  cyan: [
    [0, 'rgba(34,211,238,0.75)'],
    [0.35, 'rgba(34,211,238,0.28)'],
    [0.7, 'rgba(91,140,255,0.06)'],
    [1, 'rgba(91,140,255,0)'],
  ],
} as const satisfies Record<string, readonly (readonly [number, string])[]>;

export function createGlow(size = 12, tone: keyof typeof GLOW_STOPS = 'iris'): Mesh {
  const tex = radialTexture(GLOW_STOPS[tone].map(([o, c]) => [o, c] as [number, string]), 256);
  const mat = new MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new Mesh(new PlaneGeometry(size, size), mat);
  mesh.renderOrder = -2;
  return mesh;
}

export function setGlowTheme(glow: Mesh, theme: ThemeName, strength = 1) {
  const m = glow.material as MeshBasicMaterial;
  if (theme === 'light') {
    m.blending = NormalBlending;
    m.opacity = 0.42 * strength;
  } else {
    m.blending = AdditiveBlending;
    m.opacity = 0.62 * strength;
  }
  m.needsUpdate = true;
}

export function createContactShadow(w = 5, h = 1.3): Mesh {
  const tex = radialTexture(
    [
      [0, 'rgba(0,0,0,0.9)'],
      [0.35, 'rgba(0,0,0,0.5)'],
      [0.7, 'rgba(0,0,0,0.12)'],
      [1, 'rgba(0,0,0,0)'],
    ],
    256,
  );
  const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new Mesh(new PlaneGeometry(w, h), mat);
  mesh.renderOrder = -1;
  return mesh;
}

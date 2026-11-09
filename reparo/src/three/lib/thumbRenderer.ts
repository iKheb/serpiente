/**
 * Renderer único fuera de pantalla para todas las miniaturas. Se libera tras
 * un rato sin uso (las miniaturas quedan en caché como data URL).
 */
import {
  ACESFilmicToneMapping,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type InstancedMesh,
  type Object3D,
} from 'three';
import type { ExpenseCategory } from '@/data/types';
import { addStudioLights, createStudioEnvironment, type StudioEnv, type StudioLights } from './studio';
import { buildPart } from './parts';
import { disposeObject } from './dispose';
import { radialTexture } from './canvas';
import type { ThemeName } from './env';

interface Ctx {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: OrthographicCamera;
  env: StudioEnv;
  lights: StudioLights;
  shadow: Mesh;
}

let ctx: Ctx | null = null;
let idleTimer = 0;

function getCtx(): Ctx {
  if (ctx && !ctx.renderer.getContext().isContextLost()) return ctx;
  if (ctx) disposeCtx();
  const canvas = document.createElement('canvas');
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  const scene = new Scene();
  const env = createStudioEnvironment(renderer);
  scene.environment = env.texture;
  const lights = addStudioLights(scene);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const dir = new Vector3(0, Math.sin(0.42), Math.cos(0.42)).normalize();
  camera.position.copy(dir.multiplyScalar(60));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const shadow = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({
      map: radialTexture([[0, 'rgba(0,0,0,0.75)'], [0.45, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']], 128),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = -1;
  scene.add(shadow);
  ctx = { renderer, scene, camera, env, lights, shadow };
  return ctx;
}

function disposeCtx() {
  if (!ctx) return;
  disposeObject(ctx.shadow);
  ctx.env.dispose();
  ctx.renderer.dispose();
  try {
    ctx.renderer.forceContextLoss();
  } catch {
    /* ignorar */
  }
  ctx = null;
}

function scheduleIdleDispose() {
  clearTimeout(idleTimer);
  idleTimer = window.setTimeout(disposeCtx, 20000);
}

/** Proyecta todos los vértices al espacio de cámara para un encuadre ajustado. */
function projectedBounds(root: Object3D, camera: OrthographicCamera) {
  const v = new Vector3();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minW = Infinity;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || (m as unknown as InstancedMesh).isInstancedMesh) return;
    const pos = (m.geometry as BufferGeometry).getAttribute('position');
    const step = Math.max(1, Math.floor(pos.count / 1500));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      minW = Math.min(minW, v.y);
      v.applyMatrix4(camera.matrixWorldInverse);
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
  });
  return { minX, maxX, minY, maxY, minW };
}

export function renderThumb(kind: ExpenseCategory, size: number, theme: ThemeName, dpr: number): string {
  const c = getCtx();
  const { renderer, scene, camera, lights, shadow } = c;
  const ss = size <= 64 ? 2 : 1.5;
  const px = Math.min(512, Math.max(16, Math.round(size * dpr * ss)));
  renderer.setSize(px, px, false);
  const light = theme === 'light';
  renderer.toneMappingExposure = light ? 1.1 : 1.05;
  scene.environmentIntensity = light ? 1.2 : 1.05;
  lights.setTheme(theme);

  const model = buildPart(kind);
  scene.add(model);
  const b = projectedBounds(model, camera);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const half = (Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2) * 1.12;
  camera.left = cx - half;
  camera.right = cx + half;
  camera.top = cy + half;
  camera.bottom = cy - half;
  camera.updateProjectionMatrix();
  // sombra de contacto bajo la pieza
  const w = Math.max(b.maxX - b.minX, 1);
  shadow.position.set(0, b.minW - 0.05, 0);
  shadow.scale.set(w * 0.95, w * 0.7, 1);
  (shadow.material as MeshBasicMaterial).opacity = light ? 0.35 : 0.6;

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(model);
  disposeObject(model);
  scheduleIdleDispose();
  return url;
}

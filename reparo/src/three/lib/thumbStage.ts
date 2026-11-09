/**
 * Escenario de miniaturas: un renderer, un entorno PMREM, unas luces y un juego
 * de materiales compartidos que se crean UNA vez y se reutilizan en cada
 * miniatura. Los modelos también se cachean por categoría (cambiar de tema o de
 * tamaño no reconstruye geometría ni texturas).
 *
 * Funciona igual en un Web Worker (OffscreenCanvas) que en el hilo principal.
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
import { buildPart, createPartMaterials } from './parts';
import { disposeObject } from './dispose';
import { radialTexture } from './canvas';
import type { PhoneMaterials } from './phone';
import type { ThemeName } from './env';

/** Lados (px de dispositivo) en los que se pre-renderizan los sprites. */
export const THUMB_TIERS = [128, 256, 512] as const;
export type ThumbTier = (typeof THUMB_TIERS)[number];

/** Sprite mínimo que cubre `size` px CSS con supermuestreo (≥ 1.5×) al DPR dado. */
export function tierFor(size: number, dpr: number): ThumbTier {
  const px = size * dpr * (size <= 64 ? 2 : 1.5);
  return THUMB_TIERS.find((t) => t >= px) ?? 512;
}

export interface ThumbStage {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Dibuja la pieza en el lienzo (el llamador lee el resultado). */
  draw(kind: ExpenseCategory, px: number, theme: ThemeName): Promise<void>;
  isLost(): boolean;
  dispose(): void;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minW: number;
}

/** Proyecta los vértices al espacio de cámara para un encuadre ajustado. */
function projectedBounds(root: Object3D, camera: OrthographicCamera): Bounds {
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

export function createThumbStage(canvas: HTMLCanvasElement | OffscreenCanvas): ThumbStage {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    premultipliedAlpha: false,
    powerPreference: 'low-power',
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);

  const scene = new Scene();
  const env: StudioEnv = createStudioEnvironment(renderer);
  scene.environment = env.texture;
  const lights: StudioLights = addStudioLights(scene);
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

  const materials: PhoneMaterials = createPartMaterials();
  const models = new Map<ExpenseCategory, { root: Object3D; bounds: Bounds }>();

  function model(kind: ExpenseCategory) {
    let hit = models.get(kind);
    if (!hit) {
      const root = buildPart(kind, materials);
      root.visible = false;
      scene.add(root);
      hit = { root, bounds: projectedBounds(root, camera) };
      models.set(kind, hit);
    }
    return hit;
  }

  return {
    canvas,
    async draw(kind, px, theme) {
      const { root, bounds: b } = model(kind);
      models.forEach((m) => (m.root.visible = m.root === root));
      renderer.setSize(px, px, false);
      const light = theme === 'light';
      renderer.toneMappingExposure = light ? 1.1 : 1.05;
      scene.environmentIntensity = light ? 1.2 : 1.05;
      lights.setTheme(theme);

      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const half = (Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2) * 1.12;
      camera.left = cx - half;
      camera.right = cx + half;
      camera.top = cy + half;
      camera.bottom = cy - half;
      camera.updateProjectionMatrix();
      const w = Math.max(b.maxX - b.minX, 1);
      shadow.position.set(0, b.minW - 0.05, 0);
      shadow.scale.set(w * 0.95, w * 0.7, 1);
      (shadow.material as MeshBasicMaterial).opacity = light ? 0.35 : 0.6;

      // Compila los shaders sin bloquear (KHR_parallel_shader_compile) antes del primer dibujo.
      await renderer.compileAsync(scene, camera);
      renderer.render(scene, camera);
    },
    isLost: () => renderer.getContext().isContextLost(),
    dispose() {
      models.forEach((m) => disposeObject(m.root));
      models.clear();
      disposeObject(shadow);
      env.dispose();
      renderer.dispose();
      try {
        renderer.forceContextLoss();
      } catch {
        /* ignorar */
      }
    },
  };
}

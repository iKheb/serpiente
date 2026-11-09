/**
 * Modelos de repuestos para las miniaturas (uno por categoría de gasto).
 * Cada uno se construye "de frente" (+Z) y se posa en isométrico.
 */
import {
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Shape,
  ShapeGeometry,
  TubeGeometry,
  Vector3,
  ExtrudeGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ExpenseCategory } from '@/data/types';
import { buildBattery, buildBoard, buildCameraModule, CAMERA_MODULE, createPhoneMaterials, PHONE, type PhoneMaterials } from './phone';
import { latheZ, planarUV, roundedRectPath, roundedRectShape, slabGeometry, stadiumShape } from './geometry';
import { createChipLabel, createWallpaper } from './textures';
import { BRAND } from './palette';

function mesh(geo: BufferGeometry, mat: Material | Material[], parent: Object3D, pos?: [number, number, number]) {
  const m = new Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  parent.add(m);
  return m;
}

/** Pose isométrica para piezas planas: recostada y girada. */
function flatPose(g: Group, lean = -0.95, turn = 0.62, roll = 0) {
  const pivot = new Group();
  g.rotation.set(lean, 0, roll);
  pivot.add(g);
  pivot.rotation.y = turn;
  return pivot;
}

function screenPanel(m: PhoneMaterials) {
  const g = new Group();
  const w = 3.4;
  const h = 6.9;
  mesh(slabGeometry(roundedRectShape(w, h, 0.56), { thickness: 0.07, bevel: 0.025 }), m.frontGlass, g);
  const disp = new ShapeGeometry(roundedRectShape(w - 0.18, h - 0.18, 0.48));
  planarUV(disp);
  const dm = new MeshPhysicalMaterial({
    color: new Color('#000'),
    emissive: new Color('#fff'),
    emissiveMap: createWallpaper(),
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    toneMapped: false,
  });
  mesh(disp, dm, g, [0, 0, 0.036]);
  const plate = new MeshStandardMaterial({ color: new Color('#3b3e46'), metalness: 0.85, roughness: 0.42 });
  mesh(slabGeometry(roundedRectShape(w - 0.2, h - 0.2, 0.46), { thickness: 0.05, bevel: 0.015 }), plate, g, [0, 0, -0.06]);
  const flex = mesh(new BoxGeometry(0.9, 1.1, 0.014), m.flex, g, [0.5, -h / 2 - 0.45, -0.07]);
  flex.rotation.x = 0.25;
  mesh(new RoundedBoxGeometry(0.7, 0.26, 0.08, 2, 0.02), m.chip, g, [0.5, -h / 2 - 0.98, -0.0]);
  return flatPose(g, -0.72, 0.5, 0.0);
}

function battery(m: PhoneMaterials) {
  const b = buildBattery(m);
  b.position.set(0, 0, 0);
  const g = new Group();
  g.add(b);
  return flatPose(g, -0.95, 0.62);
}

function port(m: PhoneMaterials) {
  const g = new Group();
  // flex largo
  mesh(new BoxGeometry(0.72, 3.4, 0.016), m.flex, g, [0, 0.4, 0]);
  // sección rígida con componentes
  mesh(new RoundedBoxGeometry(1.5, 0.9, 0.06, 2, 0.02), m.pcb, g, [0, -1.55, 0.02]);
  mesh(new RoundedBoxGeometry(0.34, 0.26, 0.06, 2, 0.015), m.chip, g, [-0.42, -1.4, 0.08]);
  mesh(new RoundedBoxGeometry(0.22, 0.18, 0.05, 2, 0.012), m.shield, g, [0.42, -1.38, 0.08]);
  // receptáculo USB‑C (tubo metálico tipo estadio)
  const outer = stadiumShape(1.05, 0.38, 10);
  const hole = stadiumShape(0.9, 0.24, 10);
  outer.holes.push(hole as unknown as Shape);
  const tube = new ExtrudeGeometry(outer, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 1 });
  tube.rotateX(Math.PI / 2);
  mesh(tube, m.steel, g, [0, -1.95, 0.24]);
  const back = new ShapeGeometry(stadiumShape(0.9, 0.24, 10));
  back.rotateX(Math.PI / 2);
  mesh(back, m.matteBlack, g, [0, -2.45, 0.24]);
  mesh(new BoxGeometry(0.6, 0.45, 0.05), m.chip, g, [0, -2.2, 0.24]);
  // conector placa‑a‑placa
  mesh(new BoxGeometry(0.62, 0.22, 0.07), [m.chip, m.chip, m.chip, m.chip, m.pins, m.chip], g, [0, 2.0, 0.04]);
  return flatPose(g, -1.0, 0.75, 0.1);
}

function cameras(m: PhoneMaterials) {
  const g = new Group();
  const cam = buildCameraModule(m);
  g.add(cam);
  return flatPose(g, -0.85, 0.6);
}

function board(m: PhoneMaterials) {
  const b = buildBoard(m, { sensors: false, smdCount: 70 });
  b.position.set(0, 0, 0);
  const g = new Group();
  g.add(b);
  return flatPose(g, -1.0, 0.62);
}

function housing(m: PhoneMaterials) {
  const g = new Group();
  const { W, H, R } = PHONE;
  const shape = roundedRectShape(W, H, R);
  // hueco de cámara (visto desde atrás queda arriba a la izquierda)
  shape.holes.push(roundedRectPath(new Shape(), CAMERA_MODULE.size - 0.04, CAMERA_MODULE.size - 0.04, 0.42, -CAMERA_MODULE.x, CAMERA_MODULE.y, 8));
  const body = slabGeometry(shape, { thickness: 0.12, bevel: 0.05, bevelSegments: 4 });
  const mat = new MeshPhysicalMaterial({
    color: new Color('#3d3760'),
    roughness: 1,
    roughnessMap: m.backGlass.roughnessMap,
    metalness: 0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.4,
  });
  mesh(body, mat, g);
  const rim = slabGeometry(
    (() => {
      const s = roundedRectShape(W + 0.06, H + 0.06, R + 0.03);
      s.holes.push(roundedRectPath(new Shape(), W - 0.1, H - 0.1, R - 0.05));
      return s;
    })(),
    { thickness: 0.2, bevel: 0.05 },
  );
  mesh(rim, m.titanium, g, [0, 0, -0.06]);
  // aro del hueco de cámara
  const cs = CAMERA_MODULE.size;
  const ringShape = roundedRectShape(cs + 0.14, cs + 0.14, 0.48, -CAMERA_MODULE.x, CAMERA_MODULE.y, 8);
  ringShape.holes.push(roundedRectPath(new Shape(), cs - 0.04, cs - 0.04, 0.42, -CAMERA_MODULE.x, CAMERA_MODULE.y, 8));
  mesh(slabGeometry(ringShape, { thickness: 0.07, bevel: 0.025 }), m.titaniumPolished, g, [0, 0, 0.07]);
  return flatPose(g, -0.9, 0.62);
}

function screwdriver(m: PhoneMaterials) {
  const g = new Group();
  const anod = new MeshPhysicalMaterial({ color: new Color(BRAND.brand), metalness: 0.9, roughness: 0.32, clearcoat: 0.4, flatShading: true });
  const handle = new CylinderGeometry(0.42, 0.42, 3.0, 12, 1);
  mesh(handle, anod, g, [0, 0.6, 0]);
  const cap = latheZ([[0, 0.3], [0.2, 0.28], [0.32, 0.18], [0.34, 0]], 24);
  const capM = mesh(cap, m.titaniumPolished, g, [0, 2.1, 0]);
  capM.rotation.x = -Math.PI / 2;
  const taper = new CylinderGeometry(0.42, 0.16, 0.6, 24);
  mesh(taper, m.titaniumPolished, g, [0, -1.2, 0]);
  mesh(new CylinderGeometry(0.06, 0.06, 2.3, 16), m.steel, g, [0, -2.65, 0]);
  mesh(new CylinderGeometry(0.06, 0.012, 0.3, 16), m.steel, g, [0, -3.95, 0]);
  const pivot = new Group();
  g.rotation.set(0.35, 0, -0.78);
  pivot.add(g);
  pivot.rotation.y = 0.5;
  return pivot;
}

function charger(m: PhoneMaterials) {
  const g = new Group();
  const white = new MeshPhysicalMaterial({ color: new Color('#eceef2'), roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  mesh(new RoundedBoxGeometry(2.0, 2.0, 1.5, 4, 0.32), white, g, [0, 0.6, 0]);
  const portG = new ShapeGeometry(stadiumShape(0.5, 0.16, 8));
  mesh(portG, m.matteBlack, g, [0, 0.6, 0.751]);
  for (const x of [-0.35, 0.35]) mesh(new BoxGeometry(0.08, 0.35, 0.7), m.steel, g, [x, 0.6, -1.05]);
  const curve = new CatmullRomCurve3([
    new Vector3(0, 0.6, 0.8),
    new Vector3(0, 0.6, 1.5),
    new Vector3(0.5, -0.4, 2.0),
    new Vector3(1.6, -1.2, 1.2),
    new Vector3(1.4, -1.5, -0.3),
    new Vector3(0.2, -1.4, -0.6),
    new Vector3(-1.0, -1.3, 0.2),
    new Vector3(-1.4, -1.2, 1.4),
  ]);
  mesh(new TubeGeometry(curve, 96, 0.075, 10, false), white, g);
  const plug = mesh(new RoundedBoxGeometry(0.34, 0.2, 0.7, 2, 0.08), white, g, [-1.45, -1.2, 1.75]);
  plug.lookAt(new Vector3(-1.5, -1.2, 3));
  mesh(new BoxGeometry(0.26, 0.09, 0.22), m.steel, g, [-1.46, -1.2, 2.18]);
  const pivot = new Group();
  g.rotation.set(0.15, 0, 0);
  pivot.add(g);
  pivot.rotation.y = 0.55;
  return pivot;
}

function chip(m: PhoneMaterials) {
  const g = new Group();
  const body = new MeshStandardMaterial({ color: new Color('#15161b'), roughness: 0.5, metalness: 0.1 });
  const top = new MeshStandardMaterial({ map: createChipLabel('RP-X1', 'REPARO · 2646', true), roughness: 0.45 });
  mesh(new RoundedBoxGeometry(2.4, 2.4, 0.34, 2, 0.05), [body, body, body, body, top, body], g);
  const n = 9;
  const lead = new BoxGeometry(0.11, 0.42, 0.05);
  const leads = new InstancedMesh(lead, m.steel, n * 4);
  const o = new Object3D();
  let i = 0;
  for (let side = 0; side < 4; side++) {
    for (let k = 0; k < n; k++) {
      const t = (k - (n - 1) / 2) * 0.24;
      const a = (side * Math.PI) / 2;
      const r = 1.36;
      o.position.set(Math.cos(a) * r - Math.sin(a) * t, Math.sin(a) * r + Math.cos(a) * t, -0.12);
      o.rotation.set(0, 0, a + Math.PI / 2);
      o.updateMatrix();
      leads.setMatrixAt(i++, o.matrix);
    }
  }
  g.add(leads);
  return flatPose(g, -1.05, 0.62);
}

const BUILDERS: Record<ExpenseCategory, (m: PhoneMaterials) => Object3D> = {
  pantallas: screenPanel,
  baterias: battery,
  puertos: port,
  camaras: cameras,
  placas: board,
  carcasas: housing,
  herramientas: screwdriver,
  accesorios: charger,
  otros: chip,
};

/** Materiales base para `buildPart` (compartibles entre piezas para reutilizar texturas y shaders). */
export function createPartMaterials(): PhoneMaterials {
  return createPhoneMaterials(null, { pcbSize: 768 });
}

export function buildPart(kind: ExpenseCategory, materials?: PhoneMaterials): Object3D {
  const m = materials ?? createPartMaterials();
  const root = new Group();
  root.add(BUILDERS[kind](m));
  return root;
}

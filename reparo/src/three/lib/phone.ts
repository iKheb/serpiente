/**
 * Smartphone premium modelado proceduralmente, separado en capas para la
 * vista explosionada: pantalla, marco de titanio, placa lógica, batería y
 * vidrio trasero con módulo de cámara triple.
 *
 * Unidades ≈ mm/20 (3.6 × 7.4 × 0.41). Frente = +Z.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  type Material,
  type Texture,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { latheZ, planarUV, roundedRectPath, roundedRectShape, slabGeometry, stadiumShape } from './geometry';
import { MAT } from './palette';
import { rng } from './canvas';
import {
  BOARD,
  BOARD_HOLE,
  BOARD_PARTS,
  createBackRoughness,
  createBatteryLabel,
  createChipLabel,
  createFlashTexture,
  createLensTexture,
  createPcbTextures,
  createPinsTexture,
} from './textures';

export const PHONE = { W: 3.6, H: 7.4, R: 0.62 } as const;
const FRAME_T = 0.3;
const FRAME_BEVEL = 0.055;
const FRAME_RING = 0.19;
const GLASS_T = 0.056;
const GLASS_BEVEL = 0.022;
const GLASS_INSET = FRAME_BEVEL + 0.003;
const BEZEL = 0.072;
const Z_FRONT = FRAME_T / 2; // cara frontal del marco
const CAM = { x: PHONE.W / 2 - 0.16 - 0.875, y: PHONE.H / 2 - 0.16 - 0.875, size: 1.75 };
const BOARD_Y = PHONE.H / 2 - 0.2 - BOARD.h / 2;

export const DISPLAY = {
  w: PHONE.W - 2 * (GLASS_INSET + BEZEL),
  h: PHONE.H - 2 * (GLASS_INSET + BEZEL),
  r: PHONE.R - GLASS_INSET - BEZEL + 0.02,
};
export const DISPLAY_ASPECT = DISPLAY.w / DISPLAY.h;

export type LayerKey = 'display' | 'frame' | 'board' | 'battery' | 'back';
export const LAYER_ORDER: LayerKey[] = ['display', 'frame', 'board', 'battery', 'back'];

/** Desplazamiento de cada capa en la vista explosionada (espacio local del teléfono). */
export const EXPLODE_OFFSETS: Record<LayerKey, [number, number, number]> = {
  display: [-0.55, -0.42, 2.15],
  frame: [-0.2, -0.15, 0.95],
  board: [0.1, 0.1, -0.1],
  battery: [0.35, 0.3, -1.1],
  back: [0.62, 0.5, -2.15],
};

/* ============================================================ Materiales */

export interface PhoneMaterials {
  titanium: MeshPhysicalMaterial;
  titaniumPolished: MeshPhysicalMaterial;
  frontGlass: MeshPhysicalMaterial;
  display: MeshPhysicalMaterial;
  backGlass: MeshPhysicalMaterial;
  plateau: MeshPhysicalMaterial;
  lensGlass: MeshPhysicalMaterial;
  matteBlack: MeshStandardMaterial;
  glossBlack: MeshPhysicalMaterial;
  flash: MeshPhysicalMaterial;
  antenna: MeshStandardMaterial;
  pcb: MeshStandardMaterial;
  chip: MeshStandardMaterial;
  socTop: MeshStandardMaterial;
  nandTop: MeshStandardMaterial;
  shield: MeshStandardMaterial;
  gold: MeshStandardMaterial;
  pins: MeshStandardMaterial;
  smd: MeshStandardMaterial;
  batteryBody: MeshStandardMaterial;
  batteryLabel: MeshPhysicalMaterial;
  flex: MeshStandardMaterial;
  steel: MeshStandardMaterial;
}

export function createPhoneMaterials(screen: Texture | null, opts: { pcbSize?: number } = {}): PhoneMaterials {
  const pcb = createPcbTextures(opts.pcbSize ?? 1024);
  const pinsTex = createPinsTexture();
  return {
    titanium: new MeshPhysicalMaterial({
      color: new Color(MAT.titanium),
      metalness: 1,
      roughness: 0.3,
      clearcoat: 0.25,
      clearcoatRoughness: 0.35,
    }),
    titaniumPolished: new MeshPhysicalMaterial({ color: new Color('#b8bbc3'), metalness: 1, roughness: 0.14 }),
    frontGlass: new MeshPhysicalMaterial({
      color: new Color('#030304'),
      metalness: 0,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    }),
    display: new MeshPhysicalMaterial({
      color: new Color('#000000'),
      emissive: new Color('#ffffff'),
      emissiveMap: screen,
      emissiveIntensity: screen ? 1 : 0,
      metalness: 0,
      roughness: 0.06,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      toneMapped: false,
    }),
    backGlass: new MeshPhysicalMaterial({
      color: new Color(MAT.backGlass),
      metalness: 0,
      roughness: 1,
      roughnessMap: createBackRoughness(),
      specularIntensity: 1,
    }),
    plateau: new MeshPhysicalMaterial({
      color: new Color(MAT.backGlass),
      metalness: 0,
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
    }),
    lensGlass: new MeshPhysicalMaterial({
      color: new Color('#ffffff'),
      map: createLensTexture(),
      metalness: 0,
      roughness: 0.03,
      clearcoat: 1,
      clearcoatRoughness: 0,
      iridescence: 1,
      iridescenceIOR: 1.85,
      iridescenceThicknessRange: [240, 560],
    }),
    matteBlack: new MeshStandardMaterial({ color: new Color('#050506'), roughness: 0.6, metalness: 0 }),
    glossBlack: new MeshPhysicalMaterial({
      color: new Color('#040405'),
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
    flash: new MeshPhysicalMaterial({ map: createFlashTexture(), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 }),
    antenna: new MeshStandardMaterial({ color: new Color('#34363c'), roughness: 0.55, metalness: 0 }),
    pcb: new MeshStandardMaterial({ map: pcb.map, roughnessMap: pcb.mr, metalnessMap: pcb.mr, roughness: 1, metalness: 1 }),
    chip: new MeshStandardMaterial({ color: new Color('#15161b'), roughness: 0.45, metalness: 0.15 }),
    socTop: new MeshStandardMaterial({ map: createChipLabel('RP A1', 'RP · 2646', true), roughness: 0.42, metalness: 0.15 }),
    nandTop: new MeshStandardMaterial({ map: createChipLabel('NAND', 'RP 256G'), roughness: 0.45, metalness: 0.15 }),
    shield: new MeshStandardMaterial({ color: new Color('#c9ccd4'), metalness: 1, roughness: 0.3 }),
    gold: new MeshStandardMaterial({ color: new Color('#d8ae5a'), metalness: 1, roughness: 0.25 }),
    pins: new MeshStandardMaterial({ map: pinsTex, roughness: 0.4, metalness: 0.5 }),
    smd: new MeshStandardMaterial({ color: new Color('#ffffff'), roughness: 0.5, metalness: 0.1 }),
    batteryBody: new MeshStandardMaterial({ color: new Color('#16171c'), roughness: 0.45, metalness: 0.25 }),
    batteryLabel: new MeshPhysicalMaterial({
      map: createBatteryLabel(),
      roughness: 0.42,
      clearcoat: 0.6,
      clearcoatRoughness: 0.28,
    }),
    flex: new MeshStandardMaterial({ color: new Color(MAT.flex), roughness: 0.35, metalness: 0.35 }),
    steel: new MeshStandardMaterial({ color: new Color(MAT.steel), metalness: 1, roughness: 0.22 }),
  };
}

/* ============================================================== Utilidades */

function mesh(geo: BufferGeometry, mat: Material | Material[], parent?: Object3D, pos?: [number, number, number]) {
  const m = new Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  parent?.add(m);
  return m;
}

/* ================================================================ Capas */

export function buildFrame(m: PhoneMaterials): Group {
  const g = new Group();
  g.name = 'frame';
  const { W, H, R } = PHONE;
  const shape = roundedRectShape(W, H, R);
  shape.holes.push(roundedRectPath(new Shape(), W - FRAME_RING * 2, H - FRAME_RING * 2, R - FRAME_RING + 0.04));
  mesh(slabGeometry(shape, { thickness: FRAME_T, bevel: FRAME_BEVEL, bevelSegments: 6 }), m.titanium, g);

  // botones: acción + volumen (izquierda), encendido (derecha)
  const btn = (len: number, x: number, y: number) => {
    const geo = new RoundedBoxGeometry(0.075, len, 0.118, 3, 0.032);
    mesh(geo, m.titanium, g, [x, y, 0]);
  };
  btn(0.32, -W / 2 - 0.004, 2.4);
  btn(0.56, -W / 2 - 0.004, 1.68);
  btn(0.56, -W / 2 - 0.004, 0.96);
  btn(0.98, W / 2 + 0.004, 1.35);

  // líneas de antena
  const ant: BufferGeometry[] = [];
  for (const sy of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const a = new BoxGeometry(0.012, 0.024, FRAME_T - 0.07);
      a.translate(sx * (W / 2 - 0.004), sy * (H / 2 - 0.66), 0);
      ant.push(a);
      const b = new BoxGeometry(0.024, 0.012, FRAME_T - 0.07);
      b.translate(sx * 1.02, sy * (H / 2 - 0.004), 0);
      ant.push(b);
    }
  }
  mesh(mergeGeometries(ant), m.antenna, g);
  ant.forEach((a) => a.dispose());

  // puerto USB‑C y rejillas de altavoz (cara inferior, mirando -Y)
  const port = new ShapeGeometry(stadiumShape(0.36, 0.1));
  port.rotateX(Math.PI / 2);
  mesh(port, m.matteBlack, g, [0, -H / 2 - 0.0015, 0]);
  const holes: BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const c = new CircleGeometry(0.024, 10);
      c.rotateX(Math.PI / 2);
      c.translate(s * (0.62 + i * 0.085), -H / 2 - 0.0015, 0);
      holes.push(c);
    }
  }
  mesh(mergeGeometries(holes), m.matteBlack, g);
  holes.forEach((h) => h.dispose());
  return g;
}

export function buildScrew(m: PhoneMaterials, r = 0.036): Group {
  const g = new Group();
  const head = latheZ(
    [
      [0, 0.03],
      [r * 0.6, 0.028],
      [r * 0.92, 0.02],
      [r, 0.008],
      [r, 0],
    ],
    20,
  );
  mesh(head, m.steel, g);
  const slot = new BoxGeometry(r * 1.3, r * 0.22, 0.012);
  mesh(slot, m.matteBlack, g, [0, 0, 0.028]);
  const slot2 = new BoxGeometry(r * 0.22, r * 1.3, 0.012);
  mesh(slot2, m.matteBlack, g, [0, 0, 0.028]);
  return g;
}

export function buildDisplay(m: PhoneMaterials): Group {
  const g = new Group();
  g.name = 'display';
  const { W, H, R } = PHONE;
  const gw = W - GLASS_INSET * 2;
  const gh = H - GLASS_INSET * 2;
  const glass = slabGeometry(roundedRectShape(gw, gh, R - GLASS_INSET), {
    thickness: GLASS_T,
    bevel: GLASS_BEVEL,
    bevelSegments: 4,
  });
  mesh(glass, m.frontGlass, g, [0, 0, Z_FRONT + GLASS_T / 2]);
  const disp = new ShapeGeometry(roundedRectShape(DISPLAY.w, DISPLAY.h, DISPLAY.r));
  planarUV(disp);
  const d = mesh(disp, m.display, g, [0, 0, Z_FRONT + GLASS_T + 0.0008]);
  d.name = 'screen';
  // auricular
  const ear = new ShapeGeometry(stadiumShape(0.46, 0.024));
  mesh(ear, m.antenna, g, [0, H / 2 - GLASS_INSET - BEZEL * 0.55, Z_FRONT + GLASS_T + 0.0006]);
  return g;
}

/** Módulo de cámara (meseta + 3 lentes + flash + LiDAR). Sale hacia +Z local. */
export function buildCameraModule(m: PhoneMaterials, opts: { plateau?: boolean } = {}): Group {
  const g = new Group();
  g.name = 'camera';
  const S = CAM.size;
  if (opts.plateau !== false) {
    mesh(slabGeometry(roundedRectShape(S, S, 0.44), { thickness: 0.075, bevel: 0.032, bevelSegments: 4 }), m.plateau, g, [0, 0, 0.0375]);
  }
  const base = 0.07;
  const ring = latheZ(
    [
      [0.368, 0],
      [0.362, 0.012],
      [0.352, 0.03],
      [0.348, 0.062],
      [0.342, 0.08],
      [0.33, 0.09],
      [0.312, 0.093],
      [0.296, 0.09],
      [0.286, 0.08],
      [0.28, 0.06],
      [0.278, 0.03],
    ],
    48,
  );
  const capR = 0.279;
  const sphereR = 0.78;
  const theta = Math.asin(capR / sphereR);
  const cap = new SphereGeometry(sphereR, 48, 6, 0, Math.PI * 2, 0, theta);
  cap.rotateX(Math.PI / 2);
  cap.translate(0, 0, 0.022 - sphereR * Math.cos(theta));
  // UV planares para la textura de anillos internos
  {
    const pos = cap.getAttribute('position');
    const uv = cap.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, pos.getX(i) / (capR * 2) + 0.5, pos.getY(i) / (capR * 2) + 0.5);
    }
    uv.needsUpdate = true;
  }
  const inner = new RingGeometry(0.24, 0.281, 48, 1);
  const lenses: [number, number][] = [
    [-0.4, 0.4],
    [-0.4, -0.4],
    [0.4, 0],
  ];
  for (const [x, y] of lenses) {
    const lg = new Group();
    lg.position.set(x, y, base);
    mesh(ring, m.titaniumPolished, lg);
    mesh(inner, m.matteBlack, lg, [0, 0, 0.03]);
    mesh(cap, m.lensGlass, lg);
    g.add(lg);
  }
  // flash
  const flashRing = new RingGeometry(0.1, 0.122, 40);
  mesh(new CircleGeometry(0.1, 40), m.flash, g, [0.42, 0.52, base + 0.003]);
  mesh(flashRing, m.titaniumPolished, g, [0.42, 0.52, base + 0.004]);
  // LiDAR
  mesh(new CircleGeometry(0.088, 40), m.glossBlack, g, [0.42, -0.52, base + 0.003]);
  mesh(flashRing.clone().scale(0.88, 0.88, 1), m.titaniumPolished, g, [0.42, -0.52, base + 0.004]);
  // micrófono
  mesh(new CircleGeometry(0.026, 16), m.matteBlack, g, [0.62, 0.02, base + 0.003]);
  return g;
}

export function buildBack(m: PhoneMaterials): Group {
  const g = new Group();
  g.name = 'back';
  const { W, H, R } = PHONE;
  const glass = slabGeometry(roundedRectShape(W - GLASS_INSET * 2, H - GLASS_INSET * 2, R - GLASS_INSET), {
    thickness: GLASS_T,
    bevel: GLASS_BEVEL,
    bevelSegments: 4,
    flipU: true,
  });
  mesh(glass, m.backGlass, g, [0, 0, -Z_FRONT - GLASS_T / 2]);
  const cam = buildCameraModule(m);
  cam.position.set(CAM.x, CAM.y, -Z_FRONT - GLASS_T + 0.004);
  cam.rotation.y = Math.PI;
  g.add(cam);
  return g;
}

export function buildBoard(m: PhoneMaterials, opts: { sensors?: boolean; smdCount?: number } = {}): Group {
  const g = new Group();
  g.name = 'board';
  const T = 0.03;
  const shape = roundedRectShape(BOARD.w, BOARD.h, 0.16);
  shape.holes.push(roundedRectPath(new Shape(), BOARD_HOLE.w, BOARD_HOLE.h, BOARD_HOLE.r, BOARD_HOLE.x, BOARD_HOLE.y, 8));
  const board = slabGeometry(shape, { thickness: T, bevel: 0.008, bevelSegments: 2 });
  mesh(board, m.pcb, g);
  const top = T / 2;
  const side = m.chip;
  for (const p of BOARD_PARTS) {
    const z = top + p.z / 2;
    if (p.kind === 'soc' || p.kind === 'chip') {
      const geo = new RoundedBoxGeometry(p.w, p.h, p.z, 2, Math.min(0.02, p.z / 2.2));
      const topMat = p.kind === 'soc' ? m.socTop : p.label ? m.nandTop : side;
      mesh(geo, [side, side, side, side, topMat, side], g, [p.x, p.y, z]);
    } else if (p.kind === 'shield') {
      const geo = new RoundedBoxGeometry(p.w, p.h, p.z, 2, 0.014);
      mesh(geo, m.shield, g, [p.x, p.y, z]);
    } else if (p.kind === 'conn') {
      const geo = new BoxGeometry(p.w, p.h, p.z);
      const pins = m.pins;
      mesh(geo, [side, side, side, side, pins, side], g, [p.x, p.y, z]);
    } else if (p.kind === 'coax') {
      const geo = new CylinderGeometry(p.w / 2, p.w / 2, p.z, 20);
      geo.rotateX(Math.PI / 2);
      mesh(geo, m.gold, g, [p.x, p.y, z]);
    }
  }
  // componentes SMD (instanciados)
  const n = opts.smdCount ?? 90;
  const rand = rng(11);
  const smdGeo = new BoxGeometry(0.06, 0.032, 0.026);
  const smd = new InstancedMesh(smdGeo, m.smd, n);
  const mtx = new Matrix4();
  const o = new Object3D();
  const cols = [new Color('#b38a5a'), new Color('#1c1d22'), new Color('#8b8f98'), new Color('#a77d4e')];
  const blocked = (x: number, y: number) =>
    BOARD_PARTS.some((p) => Math.abs(x - p.x) < p.w / 2 + 0.07 && Math.abs(y - p.y) < p.h / 2 + 0.07) ||
    (Math.abs(x - BOARD_HOLE.x) < BOARD_HOLE.w / 2 + 0.07 && Math.abs(y - BOARD_HOLE.y) < BOARD_HOLE.h / 2 + 0.07) ||
    Math.abs(x) > BOARD.w / 2 - 0.08 ||
    Math.abs(y) > BOARD.h / 2 - 0.08;
  let placed = 0;
  for (let i = 0; i < n * 12 && placed < n; i++) {
    const x = (rand() - 0.5) * BOARD.w;
    const y = (rand() - 0.5) * BOARD.h;
    if (blocked(x, y)) continue;
    o.position.set(x, y, top + 0.013);
    o.rotation.set(0, 0, rand() < 0.5 ? 0 : Math.PI / 2);
    o.updateMatrix();
    mtx.copy(o.matrix);
    smd.setMatrixAt(placed, mtx);
    smd.setColorAt(placed, cols[Math.floor(rand() * cols.length)]);
    placed++;
  }
  smd.count = placed;
  g.add(smd);
  // módulos de cámara internos (en el recorte)
  if (opts.sensors !== false) {
    const sensor = new RoundedBoxGeometry(0.56, 0.56, 0.2, 2, 0.03);
    const pad = new BoxGeometry(0.36, 0.36, 0.01);
    const flexG = new BoxGeometry(0.16, 0.42, 0.01);
    const lensPos: [number, number][] = [
      [CAM.x + 0.4, CAM.y + 0.4],
      [CAM.x + 0.4, CAM.y - 0.4],
      [CAM.x - 0.4, CAM.y],
    ];
    for (const [x, y] of lensPos) {
      const lx = x;
      const ly = y - BOARD_Y;
      mesh(sensor, m.shield, g, [lx, ly, -0.02]);
      mesh(pad, m.chip, g, [lx, ly, 0.085]);
      const f = mesh(flexG, m.flex, g, [lx - 0.2, ly, 0.09]);
      f.rotation.z = Math.PI / 2;
    }
  }
  g.position.y = BOARD_Y;
  return g;
}

export function buildBattery(m: PhoneMaterials, opts: { flex?: boolean } = {}): Group {
  const g = new Group();
  g.name = 'battery';
  const w = 3.08;
  const h = 3.92;
  const t = 0.16;
  mesh(new RoundedBoxGeometry(w, h, t, 3, 0.06), m.batteryBody, g);
  mesh(new PlaneGeometry(w - 0.14, h - 0.16), m.batteryLabel, g, [0, 0, t / 2 + 0.0015]);
  if (opts.flex !== false) {
    mesh(new BoxGeometry(0.24, 0.62, 0.012), m.flex, g, [1.08, h / 2 + 0.26, t / 2 - 0.02]);
    mesh(new RoundedBoxGeometry(0.34, 0.16, 0.05, 2, 0.012), m.chip, g, [1.08, h / 2 + 0.56, t / 2]);
  }
  g.position.set(0, -PHONE.H / 2 + 0.36 + h / 2, -0.05);
  return g;
}

/* ================================================================ Teléfono */

export interface PhoneModel {
  root: Group;
  layers: Record<LayerKey, Group>;
  screws: Group[];
  materials: PhoneMaterials;
  /** Aplica la vista explosionada; `amounts` 0..1 por capa (en LAYER_ORDER). */
  setExplode(amounts: number[] | number): void;
}

export function buildPhone(screen: Texture | null, opts: { pcbSize?: number } = {}): PhoneModel {
  const materials = createPhoneMaterials(screen, opts);
  const root = new Group();
  root.name = 'phone';
  const layers: Record<LayerKey, Group> = {
    display: buildDisplay(materials),
    frame: buildFrame(materials),
    board: buildBoard(materials),
    battery: buildBattery(materials),
    back: buildBack(materials),
  };
  for (const k of LAYER_ORDER) {
    const wrap = new Group();
    wrap.name = `layer-${k}`;
    wrap.add(layers[k]);
    root.add(wrap);
    layers[k] = wrap;
  }
  // tornillos pentalobe inferiores
  const screws: Group[] = [];
  for (const s of [-1, 1]) {
    const sc = buildScrew(materials);
    sc.rotation.x = Math.PI / 2;
    sc.position.set(s * 0.3, -PHONE.H / 2 - 0.0, 0);
    layers.frame.add(sc);
    screws.push(sc);
  }
  const screwBase = screws.map((s) => s.position.clone());

  const setExplode = (amounts: number[] | number) => {
    LAYER_ORDER.forEach((k, i) => {
      const a = typeof amounts === 'number' ? amounts : (amounts[i] ?? 0);
      const [x, y, z] = EXPLODE_OFFSETS[k];
      layers[k].position.set(x * a, y * a, z * a);
      layers[k].rotation.set(0, 0, 0);
    });
    const af = typeof amounts === 'number' ? amounts : (amounts[1] ?? 0);
    screws.forEach((s, i) => {
      s.position.copy(screwBase[i]);
      s.position.y -= 0.75 * af;
      s.rotation.z = af * Math.PI * 3;
    });
  };
  return { root, layers, screws, materials, setExplode };
}

export { CAM as CAMERA_MODULE, Z_FRONT, GLASS_T };

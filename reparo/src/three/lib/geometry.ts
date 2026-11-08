/**
 * Geometría procedural: rectángulos con esquinas de curvatura continua
 * ("squircle", como los dispositivos Apple), extrusiones con bisel y normales
 * suaves, UVs planares y tornos (lathe) para lentes/tornillos.
 */
import {
  BufferAttribute,
  BufferGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Path,
  Shape,
  Vector2,
} from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Traza un rectángulo redondeado con esquinas superelípticas (n≈3.2) en
 * `target`. Antihorario. `r` es el radio aparente.
 */
export function roundedRectPath<T extends Path>(
  target: T,
  w: number,
  h: number,
  r: number,
  cx = 0,
  cy = 0,
  seg = 12,
): T {
  const rr = Math.min(r * 1.12, w / 2 - 1e-4, h / 2 - 1e-4);
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  const e = 2 / 3.2; // exponente de la superelipse
  const centers: [number, number][] = [
    [x1 - rr, y1 - rr],
    [x0 + rr, y1 - rr],
    [x0 + rr, y0 + rr],
    [x1 - rr, y0 + rr],
  ];
  target.moveTo(x1, y0 + rr);
  for (let q = 0; q < 4; q++) {
    const [ccx, ccy] = centers[q];
    const last = q === 3 ? seg - 1 : seg;
    for (let i = 0; i <= last; i++) {
      const a = ((q + i / seg) * Math.PI) / 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = ccx + rr * Math.sign(c) * Math.pow(Math.abs(c), e);
      const y = ccy + rr * Math.sign(s) * Math.pow(Math.abs(s), e);
      target.lineTo(x, y);
    }
  }
  return target;
}

export function roundedRectShape(w: number, h: number, r: number, cx = 0, cy = 0, seg = 12): Shape {
  return roundedRectPath(new Shape(), w, h, r, cx, cy, seg);
}

export function circlePath<T extends Path>(target: T, cx: number, cy: number, r: number, seg = 32): T {
  target.moveTo(cx + r, cy);
  for (let i = 1; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    target.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return target;
}

/** Forma "estadio" (cápsula) — puerto USB‑C, ranuras. */
export function stadiumShape(w: number, h: number, seg = 10): Shape {
  const s = new Shape();
  const r = h / 2;
  const hx = w / 2 - r;
  s.moveTo(hx, -r);
  for (let i = 0; i <= seg; i++) {
    const a = -Math.PI / 2 + (i / seg) * Math.PI;
    s.lineTo(hx + Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let i = 0; i <= seg; i++) {
    const a = Math.PI / 2 + (i / seg) * Math.PI;
    s.lineTo(-hx + Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}

/** UVs planares (x,y) normalizados al rectángulo envolvente. */
export function planarUV(geo: BufferGeometry, flipU = false) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  const sx = bb.max.x - bb.min.x || 1;
  const sy = bb.max.y - bb.min.y || 1;
  for (let i = 0; i < pos.count; i++) {
    let u = (pos.getX(i) - bb.min.x) / sx;
    if (flipU) u = 1 - u;
    uv[i * 2] = u;
    uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / sy;
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  return geo;
}

export interface SlabOptions {
  /** Grosor total (incluye bisel). */
  thickness: number;
  /** Radio del bisel (redondeo de canto). */
  bevel: number;
  bevelSegments?: number;
  /** Normales suaves (fusiona vértices). */
  smooth?: boolean;
  flipU?: boolean;
}

/**
 * Extruye `shape` centrado en z con bisel redondeado. El contorno exterior
 * coincide con la forma (bevelOffset negativo) y las normales son suaves
 * para reflejos limpios sin facetas.
 */
export function slabGeometry(shape: Shape, o: SlabOptions): BufferGeometry {
  const bevel = Math.min(o.bevel, o.thickness / 2 - 1e-4);
  const depth = Math.max(o.thickness - bevel * 2, 1e-4);
  const geo = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: o.bevelSegments ?? 5,
    curveSegments: 1,
  });
  geo.translate(0, 0, -depth / 2);
  let out: BufferGeometry = geo;
  if (o.smooth !== false) {
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    out = mergeVertices(geo, 1e-5);
    geo.dispose();
    out.computeVertexNormals();
  }
  planarUV(out, o.flipU);
  return out;
}

/** Torno alrededor de Z a partir de un perfil (r, z). */
export function latheZ(profile: [number, number][], segments = 48): BufferGeometry {
  const pts = profile.map(([r, z]) => new Vector2(Math.max(r, 0), z));
  const geo = new LatheGeometry(pts, segments);
  geo.rotateX(Math.PI / 2);
  return geo;
}

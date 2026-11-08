/**
 * Texturas procedurales (Canvas 2D): placa lógica (color + metal/rugosidad),
 * etiqueta de batería, rugosidad del vidrio trasero con logotipo, lentes,
 * flash, pines de conectores y serigrafía de chips. Todo determinista.
 */
import { NoColorSpace, RepeatWrapping, type CanvasTexture } from 'three';
import { BRAND, FONT_MONO, FONT_SANS, UI } from './palette';
import { brandLinear, canvasTexture, drawBrandMark, makeCanvas, rng, rr, setTracking, type Ctx } from './canvas';

/* ============================================================ Placa (PCB) */

export const BOARD = { w: 3.26, h: 2.75 };

export type BoardPartKind = 'soc' | 'chip' | 'shield' | 'conn' | 'coax' | 'sensor';
export interface BoardPart {
  kind: BoardPartKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Altura del componente sobre la placa. */
  z: number;
  label?: string;
  ref?: string;
}

/** Recorte para las cámaras (coordenadas locales de la placa). */
export const BOARD_HOLE = { x: 0.765, y: 0.54, w: 1.45, h: 1.45, r: 0.3 };

export const BOARD_PARTS: BoardPart[] = [
  { kind: 'soc', x: -0.84, y: 0.6, w: 0.86, h: 0.86, z: 0.075, label: 'RP A1', ref: 'U1' },
  { kind: 'shield', x: -0.84, y: -0.56, w: 1.22, h: 0.96, z: 0.05, ref: 'SH1' },
  { kind: 'chip', x: 0.42, y: -0.72, w: 0.6, h: 0.44, z: 0.05, label: 'NAND', ref: 'U7' },
  { kind: 'shield', x: 1.12, y: -0.5, w: 0.58, h: 0.48, z: 0.045, ref: 'SH2' },
  { kind: 'chip', x: 0.42, y: -0.33, w: 0.34, h: 0.2, z: 0.035, ref: 'U9' },
  { kind: 'chip', x: -0.19, y: 0.27, w: 0.3, h: 0.3, z: 0.04, ref: 'U4' },
  { kind: 'conn', x: 1.12, y: -1.06, w: 0.46, h: 0.16, z: 0.045, ref: 'J1' },
  { kind: 'conn', x: -1.05, y: -1.22, w: 0.5, h: 0.15, z: 0.045, ref: 'J2' },
  { kind: 'conn', x: -0.33, y: -1.22, w: 0.42, h: 0.15, z: 0.045, ref: 'J3' },
  { kind: 'coax', x: -0.14, y: 1.12, w: 0.14, h: 0.14, z: 0.05, ref: 'J5' },
];

interface PcbPalette {
  mask: string;
  pour: string;
  copper: string;
  copperDim: string;
  silk: string;
  hole: string;
  shadow: string;
}

const PCB_COLOR: PcbPalette = {
  mask: '#0d0f22',
  pour: '#14173a',
  copper: '#d6a650',
  copperDim: '#8a6a34',
  silk: 'rgba(222,226,240,0.78)',
  hole: '#040406',
  shadow: 'rgba(0,0,0,0.55)',
};
// G = rugosidad, B = metalicidad
const PCB_MR: PcbPalette = {
  mask: 'rgb(0,150,0)',
  pour: 'rgb(0,135,30)',
  copper: 'rgb(0,72,255)',
  copperDim: 'rgb(0,105,190)',
  silk: 'rgb(0,205,0)',
  hole: 'rgb(0,255,0)',
  shadow: 'rgb(0,150,0)',
};

function drawPcb(ctx: Ctx, W: number, H: number, pal: PcbPalette) {
  const rand = rng(7);
  const sx = W / BOARD.w;
  const X = (x: number) => (x + BOARD.w / 2) * sx;
  const Y = (y: number) => (BOARD.h / 2 - y) * sx;
  ctx.fillStyle = pal.mask;
  ctx.fillRect(0, 0, W, H);

  // vertidos de cobre bajo la máscara (zonas apenas más claras con rayado)
  ctx.fillStyle = pal.pour;
  for (let i = 0; i < 9; i++) {
    const x = rand() * W;
    const y = rand() * H;
    const w = 80 + rand() * 260;
    const h = 60 + rand() * 200;
    rr(ctx, x, y, w, h, 18);
    ctx.fill();
  }

  const occupied = BOARD_PARTS.map((p) => ({
    x0: X(p.x - p.w / 2) - 10,
    x1: X(p.x + p.w / 2) + 10,
    y0: Y(p.y + p.h / 2) - 10,
    y1: Y(p.y - p.h / 2) + 10,
  }));
  const hole = {
    x0: X(BOARD_HOLE.x - BOARD_HOLE.w / 2) - 14,
    x1: X(BOARD_HOLE.x + BOARD_HOLE.w / 2) + 14,
    y0: Y(BOARD_HOLE.y + BOARD_HOLE.h / 2) - 14,
    y1: Y(BOARD_HOLE.y - BOARD_HOLE.h / 2) + 14,
  };
  const inside = (x: number, y: number, pad = 0) =>
    [...occupied, hole].some((o) => x > o.x0 - pad && x < o.x1 + pad && y > o.y0 - pad && y < o.y1 + pad) ||
    x < 14 || y < 14 || x > W - 14 || y > H - 14;

  // pistas: buses con giros a 45°
  const dirs = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const via = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = pal.copper;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = pal.hole;
    ctx.fill();
  };
  for (let b = 0; b < 46; b++) {
    let x = 0;
    let y = 0;
    let tries = 0;
    do {
      x = 20 + rand() * (W - 40);
      y = 20 + rand() * (H - 40);
      tries++;
    } while (inside(x, y, 6) && tries < 40);
    if (tries >= 40) continue;
    const lines = 1 + Math.floor(rand() * 6);
    const gap = 7 + rand() * 3;
    let d = Math.floor(rand() * 8);
    const segs: [number, number][] = [[x, y]];
    let cx = x;
    let cy = y;
    const nseg = 2 + Math.floor(rand() * 3);
    for (let s = 0; s < nseg; s++) {
      const len = 30 + rand() * 150;
      const [dx, dy] = dirs[d];
      const k = dx && dy ? Math.SQRT1_2 : 1;
      let nx = cx + dx * len * k;
      let ny = cy + dy * len * k;
      nx = Math.max(16, Math.min(W - 16, nx));
      ny = Math.max(16, Math.min(H - 16, ny));
      segs.push([nx, ny]);
      cx = nx;
      cy = ny;
      d = (d + (rand() < 0.5 ? 1 : 7)) % 8;
    }
    const [d0x, d0y] = dirs[(d + 2) % 8];
    const lw = rand() < 0.2 ? 5 : 2.6;
    for (let l = 0; l < lines; l++) {
      const ox = d0x * gap * l;
      const oy = d0y * gap * l;
      ctx.beginPath();
      segs.forEach(([px, py], i) => (i ? ctx.lineTo(px + ox, py + oy) : ctx.moveTo(px + ox, py + oy)));
      ctx.strokeStyle = rand() < 0.3 ? pal.copperDim : pal.copper;
      ctx.lineWidth = lw;
      ctx.stroke();
      const [ex, ey] = segs[segs.length - 1];
      via(ex + ox, ey + oy, lw > 3 ? 6 : 4.5);
      if (rand() < 0.5) via(segs[0][0] + ox, segs[0][1] + oy, 4);
    }
  }

  // huellas de componentes: pads + serigrafía
  ctx.font = `600 15px ${FONT_MONO}`;
  for (const p of BOARD_PARTS) {
    const x0 = X(p.x - p.w / 2);
    const y0 = Y(p.y + p.h / 2);
    const w = p.w * sx;
    const h = p.h * sx;
    if (p.kind === 'conn') {
      ctx.fillStyle = pal.copper;
      const n = Math.round(w / 9);
      for (let i = 0; i < n; i++) {
        ctx.fillRect(x0 + 4 + i * ((w - 8) / n), y0 - 9, 4, 7);
        ctx.fillRect(x0 + 4 + i * ((w - 8) / n), y0 + h + 2, 4, 7);
      }
    } else if (p.kind === 'chip' || p.kind === 'soc') {
      ctx.fillStyle = pal.copper;
      const n = Math.max(4, Math.round(w / 14));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        ctx.fillRect(x0 + t * w - 2.5, y0 - 10, 5, 6);
        ctx.fillRect(x0 + t * w - 2.5, y0 + h + 4, 5, 6);
      }
      const m = Math.max(3, Math.round(h / 14));
      for (let i = 0; i < m; i++) {
        const t = (i + 0.5) / m;
        ctx.fillRect(x0 - 10, y0 + t * h - 2.5, 6, 5);
        ctx.fillRect(x0 + w + 4, y0 + t * h - 2.5, 6, 5);
      }
    } else if (p.kind === 'shield') {
      ctx.strokeStyle = pal.copper;
      ctx.lineWidth = 6;
      rr(ctx, x0 - 6, y0 - 6, w + 12, h + 12, 8);
      ctx.stroke();
    }
    // serigrafía
    ctx.strokeStyle = pal.silk;
    ctx.lineWidth = 2;
    const c = 14;
    const ex = x0 - 16;
    const ey = y0 - 16;
    const ew = w + 32;
    const eh = h + 32;
    ctx.beginPath();
    ctx.moveTo(ex, ey + c); ctx.lineTo(ex, ey); ctx.lineTo(ex + c, ey);
    ctx.moveTo(ex + ew - c, ey); ctx.lineTo(ex + ew, ey); ctx.lineTo(ex + ew, ey + c);
    ctx.moveTo(ex + ew, ey + eh - c); ctx.lineTo(ex + ew, ey + eh); ctx.lineTo(ex + ew - c, ey + eh);
    ctx.moveTo(ex + c, ey + eh); ctx.lineTo(ex, ey + eh); ctx.lineTo(ex, ey + eh - c);
    ctx.stroke();
    if (p.ref) {
      ctx.fillStyle = pal.silk;
      ctx.fillText(p.ref, ex + 2, ey - 6);
    }
  }

  // agujeros de montaje
  for (const [mx, my] of [[-1.5, 1.24], [-1.5, -0.98], [0.02, -1.25], [1.5, -1.25]] as const) {
    const x = X(mx);
    const y = Y(my);
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.fillStyle = pal.copper;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = pal.hole;
    ctx.fill();
  }

  // texto de placa + matriz tipo QR
  ctx.fillStyle = pal.silk;
  ctx.font = `600 17px ${FONT_MONO}`;
  ctx.save();
  ctx.translate(X(-0.33), Y(0.02));
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('REPARO RP-1 · REV B', 0, 0);
  ctx.restore();
  const qx = X(-0.43);
  const qy = Y(1.25);
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 9; j++) {
      const edge = i === 0 || j === 0 || i === 8 || j === 8;
      if (edge || rand() < 0.45) ctx.fillRect(qx + i * 5, qy + j * 5, 4.4, 4.4);
    }
}

export function createPcbTextures(size = 1024): { map: CanvasTexture; mr: CanvasTexture } {
  const W = size;
  const H = Math.round((size * BOARD.h) / BOARD.w);
  const a = makeCanvas(W, H);
  drawPcb(a.ctx, W, H, PCB_COLOR);
  const b = makeCanvas(W, H);
  drawPcb(b.ctx, W, H, PCB_MR);
  const map = canvasTexture(a.canvas, { anisotropy: 8 });
  const mr = canvasTexture(b.canvas, { anisotropy: 8, srgb: false });
  mr.colorSpace = NoColorSpace;
  return { map, mr };
}

/* ======================================================= Serigrafía de chips */

export function createChipLabel(label: string, sub = 'RP · 2646', brand = false): CanvasTexture {
  const { canvas, ctx } = makeCanvas(256, 256);
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#1a1b22');
  g.addColorStop(1, '#0d0e12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 236, 236);
  if (brand) {
    ctx.globalAlpha = 0.85;
    drawBrandMark(ctx, 28, 30, 58, 1, false);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = 'rgba(214,218,232,0.62)';
  ctx.font = `600 ${brand ? 44 : 38}px ${FONT_SANS}`;
  setTracking(ctx, -0.02, 40);
  ctx.fillText(label, 30, brand ? 150 : 128);
  ctx.font = `500 20px ${FONT_MONO}`;
  setTracking(ctx, 0.04, 20);
  ctx.fillStyle = 'rgba(214,218,232,0.38)';
  ctx.fillText(sub, 30, brand ? 190 : 168);
  ctx.fillText('339S01142', 30, brand ? 220 : 198);
  ctx.beginPath();
  ctx.arc(226, 226, 7, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(214,218,232,0.3)';
  ctx.fill();
  return canvasTexture(canvas, { anisotropy: 4 });
}

/** Pines dorados para conectores placa‑a‑placa (se repite en X). */
export function createPinsTexture(): CanvasTexture {
  const { canvas, ctx } = makeCanvas(64, 32);
  ctx.fillStyle = '#0b0c10';
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = '#c9a04a';
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(i * 8 + 2, 3, 4, 9);
    ctx.fillRect(i * 8 + 2, 20, 4, 9);
  }
  const t = canvasTexture(canvas, { anisotropy: 4 });
  t.wrapS = RepeatWrapping;
  return t;
}

/* ========================================================== Etiqueta batería */

export function createBatteryLabel(w = 640, h = 820): CanvasTexture {
  const { canvas, ctx } = makeCanvas(w, h);
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#15161b');
  bg.addColorStop(0.5, '#0d0e12');
  bg.addColorStop(1, '#121318');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  // franja de marca
  ctx.fillStyle = brandLinear(ctx, 0, 0, 0, h);
  ctx.fillRect(0, 0, 10, h);

  drawBrandMark(ctx, 46, 48, 64);
  ctx.fillStyle = UI.text;
  ctx.font = `600 34px ${FONT_SANS}`;
  setTracking(ctx, -0.02, 34);
  ctx.fillText('Reparo Energy', 128, 82);
  ctx.fillStyle = UI.text3;
  ctx.font = `500 20px ${FONT_MONO}`;
  setTracking(ctx, 0.06, 20);
  ctx.fillText('CELDA LI-ION POLÍMERO', 128, 110);

  // ícono batería grande
  const bx = 46;
  const by = 190;
  const bw = w - 120;
  const bh = 150;
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(238,240,246,0.85)';
  rr(ctx, bx, by, bw, bh, 30);
  ctx.stroke();
  rr(ctx, bx + bw + 8, by + bh / 2 - 26, 14, 52, 6);
  ctx.fillStyle = 'rgba(238,240,246,0.85)';
  ctx.fill();
  rr(ctx, bx + 16, by + 16, (bw - 32) * 0.86, bh - 32, 18);
  ctx.fillStyle = brandLinear(ctx, bx, by, bx + bw, by + bh);
  ctx.fill();
  // rayo
  ctx.beginPath();
  const lx = bx + bw * 0.47;
  const ly = by + bh / 2;
  ctx.moveTo(lx + 8, ly - 46);
  ctx.lineTo(lx - 26, ly + 8);
  ctx.lineTo(lx + 2, ly + 8);
  ctx.lineTo(lx - 8, ly + 46);
  ctx.lineTo(lx + 26, ly - 8);
  ctx.lineTo(lx - 2, ly - 8);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();

  ctx.fillStyle = UI.text;
  ctx.font = `700 92px ${FONT_SANS}`;
  setTracking(ctx, -0.04, 92);
  ctx.fillText('4,422 mAh', 42, 460);
  ctx.fillStyle = UI.text2;
  ctx.font = `500 26px ${FONT_SANS}`;
  setTracking(ctx, 0, 26);
  ctx.fillText('3.87 V  ·  17.11 Wh  ·  Típ.', 46, 506);

  // advertencias
  const icons = ['No perforar', 'No calentar', 'Reciclable'];
  icons.forEach((label, i) => {
    const ix = 46 + i * 186;
    const iy = 560;
    ctx.strokeStyle = 'rgba(238,240,246,0.7)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    if (i < 2) {
      ctx.arc(ix + 26, iy + 26, 22, 0, Math.PI * 2);
      ctx.moveTo(ix + 10, iy + 10);
      ctx.lineTo(ix + 42, iy + 42);
    } else {
      ctx.moveTo(ix + 26, iy + 4);
      ctx.lineTo(ix + 50, iy + 46);
      ctx.lineTo(ix + 2, iy + 46);
      ctx.closePath();
    }
    ctx.stroke();
    ctx.fillStyle = UI.text3;
    ctx.font = `500 19px ${FONT_SANS}`;
    ctx.fillText(label, ix + 60, iy + 33);
  });

  // código de barras
  const rand = rng(42);
  let x = 46;
  const yb = 650;
  ctx.fillStyle = 'rgba(238,240,246,0.88)';
  while (x < w - 190) {
    const bwid = 2 + Math.floor(rand() * 4);
    if (rand() > 0.38) ctx.fillRect(x, yb, bwid, 92);
    x += bwid + 2;
  }
  ctx.fillStyle = UI.text3;
  ctx.font = `500 20px ${FONT_MONO}`;
  ctx.fillText('RP-BAT-14P · 2026-11 · A', 46, 776);
  // sello
  ctx.strokeStyle = 'rgba(238,240,246,0.55)';
  ctx.lineWidth = 3;
  rr(ctx, w - 150, 650, 104, 92, 16);
  ctx.stroke();
  ctx.fillStyle = 'rgba(238,240,246,0.7)';
  ctx.font = `700 30px ${FONT_SANS}`;
  ctx.fillText('Li', w - 118, 708);
  return canvasTexture(canvas, { anisotropy: 8 });
}

/* ================================================== Vidrio trasero (rugosidad) */

/** Mapa de rugosidad (canal G) del vidrio esmerilado con el isotipo pulido. */
export function createBackRoughness(w = 512, h = 1056): CanvasTexture {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = 'rgb(0,150,0)';
  ctx.fillRect(0, 0, w, h);
  // isotipo brillante en el centro (pulido)
  const s = 150;
  const x = w / 2 - s / 2;
  const y = h * 0.52 - s / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 64, s / 64);
  ctx.strokeStyle = 'rgb(0,18,0)';
  ctx.fillStyle = 'rgb(0,18,0)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  rr(ctx, 20.5, 12, 23, 40, 6.5);
  ctx.lineWidth = 3.2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(29, 17.5);
  ctx.lineTo(35, 17.5);
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.beginPath();
  const pts = '24.5,33.5 28.5,33.5 31,27 34.5,40.5 37,31.5 39.5,33.5'.split(' ').map((p) => p.split(',').map(Number));
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.lineWidth = 2.8;
  ctx.stroke();
  ctx.restore();
  const t = canvasTexture(canvas, { anisotropy: 8, srgb: false });
  t.colorSpace = NoColorSpace;
  return t;
}

/* ================================================================ Lentes */

export function createLensTexture(): CanvasTexture {
  const S = 256;
  const { canvas, ctx } = makeCanvas(S, S);
  const c = S / 2;
  ctx.fillStyle = '#030305';
  ctx.fillRect(0, 0, S, S);
  const rings: [number, string][] = [
    [1.0, '#08090d'],
    [0.86, '#12131a'],
    [0.8, '#050508'],
    [0.66, '#191a26'],
    [0.6, '#07070c'],
    [0.42, '#1a1640'],
    [0.3, '#0b0a1e'],
  ];
  for (const [r, col] of rings) {
    ctx.beginPath();
    ctx.arc(c, c, r * c, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
  }
  const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.42);
  g.addColorStop(0, 'rgba(70,60,160,0.65)');
  g.addColorStop(0.6, 'rgba(30,40,120,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return canvasTexture(canvas, { anisotropy: 4 });
}

export function createFlashTexture(): CanvasTexture {
  const S = 128;
  const { canvas, ctx } = makeCanvas(S, S);
  const c = S / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, '#f6efd9');
  g.addColorStop(0.7, '#e2d6b4');
  g.addColorStop(1, '#a89c80');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(120,105,70,0.35)';
  ctx.lineWidth = 2;
  for (let r = 10; r < c; r += 9) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  return canvasTexture(canvas, { anisotropy: 2 });
}

/** Fondo de pantalla abstracto con degradado de marca (para el panel de repuesto). */
export function createWallpaper(w = 320, h = 660): CanvasTexture {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, w, h);
  const blobs: [number, number, number, string, number][] = [
    [0.2, 0.25, 0.9, BRAND.iris, 0.85],
    [0.9, 0.55, 0.8, BRAND.cyan, 0.6],
    [0.4, 0.95, 0.8, BRAND.blue, 0.7],
  ];
  for (const [x, y, r, col, a] of blobs) {
    const g = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
    const n = parseInt(col.slice(1), 16);
    g.addColorStop(0, `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  drawBrandMark(ctx, w / 2 - 40, h * 0.42 - 40, 80);
  return canvasTexture(canvas, { anisotropy: 4 });
}

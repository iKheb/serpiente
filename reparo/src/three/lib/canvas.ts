/**
 * Utilidades de dibujo en Canvas 2D para texturas procedurales.
 */
import { CanvasTexture, LinearMipmapLinearFilter, LinearFilter, SRGBColorSpace, type Texture } from 'three';
import { MARK } from '@/app/brand';
import { BRAND } from './palette';

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

export function canvasTexture(canvas: HTMLCanvasElement, opts: { srgb?: boolean; anisotropy?: number; mipmaps?: boolean } = {}): CanvasTexture {
  const t = new CanvasTexture(canvas);
  if (opts.srgb !== false) t.colorSpace = SRGBColorSpace;
  t.anisotropy = opts.anisotropy ?? 8;
  if (opts.mipmaps === false) {
    t.generateMipmaps = false;
    t.minFilter = LinearFilter;
  } else {
    t.minFilter = LinearMipmapLinearFilter;
  }
  t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** PRNG determinista (mulberry32) — las texturas salen iguales en cada montaje. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number | number[]) {
  ctx.beginPath();
  const anyCtx = ctx as Ctx & { roundRect?: (x: number, y: number, w: number, h: number, r: number | number[]) => void };
  if (anyCtx.roundRect) {
    anyCtx.roundRect(x, y, w, h, r);
  } else {
    const rad = Array.isArray(r) ? r[0] : r;
    const k = Math.min(rad, w / 2, h / 2);
    ctx.moveTo(x + k, y);
    ctx.arcTo(x + w, y, x + w, y + h, k);
    ctx.arcTo(x + w, y + h, x, y + h, k);
    ctx.arcTo(x, y + h, x, y, k);
    ctx.arcTo(x, y, x + w, y, k);
    ctx.closePath();
  }
}

export function brandLinear(ctx: Ctx, x0: number, y0: number, x1: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, BRAND.iris);
  g.addColorStop(0.5, BRAND.blue);
  g.addColorStop(1, BRAND.cyan);
  return g;
}

export function setTracking(ctx: Ctx, em: number, px: number) {
  const c = ctx as Ctx & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${(em * px).toFixed(2)}px`;
}

/**
 * Dibuja el isotipo de Reparo (teselas 64×64 de `MARK`) en (x,y) con tamaño `size`.
 * `pulse` (0..1) recorta el trazo del pulso para animarlo.
 */
export function drawBrandMark(ctx: Ctx, x: number, y: number, size: number, pulse = 1, tile = true) {
  const k = size / 64;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  if (tile) {
    rr(ctx, 0, 0, 64, 64, MARK.tile.r);
    ctx.fillStyle = brandLinear(ctx, 0, 0, 64, 64);
    ctx.fill();
    const h = ctx.createRadialGradient(20, 8, 0, 20, 8, 48);
    h.addColorStop(0, 'rgba(255,255,255,0.35)');
    h.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = h;
    ctx.fill();
  }
  const p = MARK.phone;
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = p.stroke;
  rr(ctx, p.x, p.y, p.w, p.h, p.r);
  ctx.stroke();
  const s = MARK.speaker;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(s.x1, s.y1);
  ctx.lineTo(s.x2, s.y2);
  ctx.stroke();
  if (pulse > 0) {
    const pts = MARK.pulse.split(' ').map((pr) => pr.split(',').map(Number) as [number, number]);
    // longitud total para recorte progresivo
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let remaining = total * Math.min(1, pulse);
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && remaining > 0; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const seg = Math.hypot(bx - ax, by - ay);
      const t = Math.min(1, remaining / seg);
      ctx.lineTo(ax + (bx - ax) * t, ay + (by - ay) * t);
      remaining -= seg;
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Textura radial genérica (sombras, halos, nebulosas, bokeh). */
export function radialTexture(stops: [number, string][], size = 256, squash = 1): Texture {
  const { canvas, ctx } = makeCanvas(size, Math.round(size * squash));
  ctx.save();
  ctx.scale(1, squash);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
  return canvasTexture(canvas, { anisotropy: 1 });
}

export function hexToRgba(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

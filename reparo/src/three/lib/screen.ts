/**
 * Pintor de la pantalla del teléfono: una mini interfaz de Reparo dibujada en
 * Canvas 2D (tipografía Geist, degradado de marca, sparkline) que se usa como
 * `emissiveMap` del display. Se redibuja sólo cuando cambian los datos.
 */
import type { CanvasTexture } from 'three';
import { BRAND, UI, FONT_SANS } from './palette';
import { brandLinear, canvasTexture, drawBrandMark, hexToRgba, makeCanvas, rr, setTracking, type Ctx } from './canvas';

import { DEFAULT_SCREEN, type ScreenData } from './screenData';

export { DEFAULT_SCREEN, type ScreenData };

const DW = 640; // ancho de diseño

const pctFmt =
  typeof Intl !== 'undefined'
    ? new Intl.NumberFormat('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : null;

function font(weight: number, size: number) {
  return `${weight} ${size}px ${FONT_SANS}`;
}

function ellipsize(ctx: Ctx, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function fitFont(ctx: Ctx, text: string, weight: number, size: number, maxW: number, min = 20) {
  let s = size;
  ctx.font = font(weight, s);
  setTracking(ctx, -0.035, s);
  while (s > min && ctx.measureText(text).width > maxW) {
    s -= 2;
    ctx.font = font(weight, s);
    setTracking(ctx, -0.035, s);
  }
  return s;
}

function smoothPath(ctx: Ctx, pts: [number, number][], move = true) {
  if (!pts.length) return;
  if (move) ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = 0.18;
    ctx.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) * t,
      p1[1] + (p2[1] - p0[1]) * t,
      p2[0] - (p3[0] - p1[0]) * t,
      p2[1] - (p3[1] - p1[1]) * t,
      p2[0],
      p2[1],
    );
  }
}

function deltaOf(trend: number[]): number | null {
  if (trend.length < 2) return null;
  const a = trend[0];
  const b = trend[trend.length - 1];
  if (!isFinite(a) || !isFinite(b) || a === 0) return null;
  return ((b - a) / Math.abs(a)) * 100;
}

export class ScreenPainter {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: Ctx;
  readonly texture: CanvasTexture;
  /** Alto de diseño (el ancho de diseño es 640). */
  readonly dh: number;

  constructor(aspect: number, pxWidth: number) {
    const { canvas, ctx } = makeCanvas(pxWidth, pxWidth / aspect);
    this.canvas = canvas;
    this.ctx = ctx;
    this.dh = DW / aspect;
    this.texture = canvasTexture(canvas, { anisotropy: 16 });
  }

  private begin(bg: string = UI.bg) {
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = canvas.width / DW;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, DW, this.dh);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  private end() {
    this.texture.needsUpdate = true;
  }

  /* ------------------------------------------------------------ piezas UI */

  private glow(x: number, y: number, r: number, color: string, a: number) {
    const { ctx } = this;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexToRgba(color, a));
    g.addColorStop(1, hexToRgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  private statusBar() {
    const { ctx } = this;
    ctx.fillStyle = UI.text;
    ctx.font = font(600, 27);
    setTracking(ctx, -0.01, 27);
    ctx.fillText('9:41', 66, 66);
    // Isla dinámica
    rr(ctx, DW / 2 - 92, 30, 184, 52, 26);
    ctx.fillStyle = '#000';
    ctx.fill();
    // señal
    const sx = 488;
    for (let i = 0; i < 4; i++) {
      const h = 8 + i * 4;
      rr(ctx, sx + i * 8, 64 - h, 5.5, h, 2);
      ctx.fillStyle = UI.text;
      ctx.fill();
    }
    // wifi
    ctx.strokeStyle = UI.text;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.4;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(538, 66, 5 + i * 6, -Math.PI * 0.75, -Math.PI * 0.25);
      ctx.stroke();
    }
    // batería
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(238,240,246,0.55)';
    rr(ctx, 560, 46, 40, 21, 6);
    ctx.stroke();
    rr(ctx, 563, 49, 29, 15, 3.5);
    ctx.fillStyle = UI.text;
    ctx.fill();
    rr(ctx, 602, 52, 3, 9, 1.5);
    ctx.fillStyle = 'rgba(238,240,246,0.55)';
    ctx.fill();
  }

  private header(compact: boolean) {
    const { ctx } = this;
    const y = 122;
    const s = compact ? 56 : 60;
    // halo de marca bajo el isotipo
    this.glow(40 + s / 2, y + s / 2, 70, BRAND.iris, 0.28);
    drawBrandMark(ctx, 40, y, s);
    ctx.fillStyle = UI.text;
    ctx.font = font(600, 31);
    setTracking(ctx, -0.02, 31);
    ctx.fillText('Reparo', 40 + s + 18, y + 27);
    ctx.fillStyle = UI.text3;
    ctx.font = font(450, 21);
    setTracking(ctx, 0, 21);
    ctx.fillText('Taller · Centro', 40 + s + 18, y + 56);
    // avatar
    const ax = DW - 70;
    const ay = y + s / 2;
    ctx.beginPath();
    ctx.arc(ax, ay, 29, 0, Math.PI * 2);
    ctx.fillStyle = brandLinear(ctx, ax - 29, ay - 29, ax + 29, ay + 29);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ax, ay, 26, 0, Math.PI * 2);
    ctx.fillStyle = UI.surface3;
    ctx.fill();
    ctx.fillStyle = UI.text;
    ctx.font = font(600, 21);
    ctx.textAlign = 'center';
    ctx.fillText('AR', ax, ay + 7.5);
    ctx.textAlign = 'left';
  }

  private deltaChip(x: number, y: number, delta: number | null, alignRight: boolean, size = 21) {
    if (delta === null) return 0;
    const { ctx } = this;
    const up = delta >= 0;
    const color = up ? UI.income : UI.expense;
    const label = `${pctFmt ? pctFmt.format(Math.abs(delta)) : Math.abs(delta).toFixed(1)} %`;
    ctx.font = font(600, size);
    setTracking(ctx, 0, size);
    const tw = ctx.measureText(label).width;
    const h = size * 1.85;
    const w = tw + size * 2.4;
    const x0 = alignRight ? x - w : x;
    rr(ctx, x0, y, w, h, h / 2);
    ctx.fillStyle = hexToRgba(color, 0.14);
    ctx.fill();
    // triángulo
    const tx = x0 + size * 0.95;
    const ty = y + h / 2;
    const t = size * 0.32;
    ctx.beginPath();
    if (up) {
      ctx.moveTo(tx - t, ty + t * 0.6);
      ctx.lineTo(tx + t, ty + t * 0.6);
      ctx.lineTo(tx, ty - t * 0.8);
    } else {
      ctx.moveTo(tx - t, ty - t * 0.6);
      ctx.lineTo(tx + t, ty - t * 0.6);
      ctx.lineTo(tx, ty + t * 0.8);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillText(label, x0 + size * 1.7, y + h / 2 + size * 0.36);
    return w;
  }

  private sparkline(trend: number[], x: number, y: number, w: number, h: number, lw = 5) {
    const { ctx } = this;
    const vals = trend.length >= 2 ? trend : DEFAULT_SCREEN.trend;
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (max - min < 1e-6) {
      max += 1;
      min -= 1;
    }
    const pad = (max - min) * 0.12;
    min -= pad;
    max += pad;
    const pts: [number, number][] = vals.map((v, i) => [
      x + (i / (vals.length - 1)) * w,
      y + h - ((v - min) / (max - min)) * h,
    ]);
    // retícula
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 8]);
    for (let i = 0; i <= 3; i++) {
      const gy = y + (h * i) / 3;
      ctx.beginPath();
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
      ctx.stroke();
    }
    ctx.restore();
    // área
    ctx.beginPath();
    smoothPath(ctx, pts);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, y, 0, y + h);
    fill.addColorStop(0, 'rgba(124,108,255,0.42)');
    fill.addColorStop(0.55, 'rgba(91,140,255,0.12)');
    fill.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = fill;
    ctx.fill();
    // trazo con brillo
    ctx.save();
    ctx.shadowColor = hexToRgba(BRAND.iris, 0.85);
    ctx.shadowBlur = 18;
    ctx.beginPath();
    smoothPath(ctx, pts);
    ctx.strokeStyle = brandLinear(ctx, x, 0, x + w, 0);
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
    // punto final
    const [lx, ly] = pts[pts.length - 1];
    this.glow(lx, ly, 34, BRAND.cyan, 0.55);
    ctx.beginPath();
    ctx.arc(lx, ly, lw * 1.9, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx, ly, lw * 1.9, 0, Math.PI * 2);
    ctx.strokeStyle = BRAND.cyan;
    ctx.lineWidth = lw * 0.8;
    ctx.stroke();
  }

  private card(x: number, y: number, w: number, h: number, r: number, accent = false) {
    const { ctx } = this;
    rr(ctx, x, y, w, h, r);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, UI.surface2);
    g.addColorStop(1, UI.surface1);
    ctx.fillStyle = g;
    ctx.fill();
    if (accent) {
      ctx.save();
      ctx.clip();
      this.glow(x + w * 0.15, y, w * 0.75, BRAND.iris, 0.22);
      this.glow(x + w * 0.95, y + h * 0.15, w * 0.5, BRAND.cyan, 0.1);
      ctx.restore();
    }
    rr(ctx, x + 1, y + 1, w - 2, h - 2, r - 1);
    ctx.strokeStyle = UI.border;
    ctx.lineWidth = 2;
    ctx.stroke();
    // brillo superior 1px
    ctx.save();
    rr(ctx, x, y, w, h, r);
    ctx.clip();
    const hl = ctx.createLinearGradient(x, 0, x + w, 0);
    hl.addColorStop(0, 'rgba(255,255,255,0)');
    hl.addColorStop(0.5, 'rgba(255,255,255,0.16)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(x, y, w, 2);
    ctx.restore();
  }

  private tabBar() {
    const { ctx, dh } = this;
    const y = dh - 176;
    const x = 52;
    const w = DW - 104;
    const h = 96;
    rr(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = 'rgba(25,29,38,0.94)';
    ctx.fill();
    ctx.strokeStyle = UI.borderStrong;
    ctx.lineWidth = 2;
    ctx.stroke();
    const cxs = [0, 1, 2, 3].map((i) => x + (w / 4) * (i + 0.5));
    // activo
    rr(ctx, cxs[0] - 50, y + 14, 100, h - 28, (h - 28) / 2);
    ctx.fillStyle = 'rgba(124,108,255,0.22)';
    ctx.fill();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    const cy = y + h / 2;
    // inicio (casa)
    ctx.strokeStyle = brandLinear(ctx, cxs[0] - 16, cy - 16, cxs[0] + 16, cy + 16);
    ctx.beginPath();
    ctx.moveTo(cxs[0] - 15, cy - 2);
    ctx.lineTo(cxs[0], cy - 15);
    ctx.lineTo(cxs[0] + 15, cy - 2);
    ctx.moveTo(cxs[0] - 11, cy - 5);
    ctx.lineTo(cxs[0] - 11, cy + 14);
    ctx.lineTo(cxs[0] + 11, cy + 14);
    ctx.lineTo(cxs[0] + 11, cy - 5);
    ctx.stroke();
    ctx.strokeStyle = UI.text3;
    // clientes
    ctx.beginPath();
    ctx.arc(cxs[1], cy - 6, 8, 0, Math.PI * 2);
    ctx.moveTo(cxs[1] - 15, cy + 16);
    ctx.quadraticCurveTo(cxs[1], cy - 2, cxs[1] + 15, cy + 16);
    ctx.stroke();
    // inventario (caja)
    ctx.beginPath();
    rr(ctx, cxs[2] - 15, cy - 13, 30, 27, 5);
    ctx.moveTo(cxs[2] - 15, cy - 3);
    ctx.lineTo(cxs[2] + 15, cy - 3);
    ctx.stroke();
    // reportes (barras)
    ctx.beginPath();
    ctx.moveTo(cxs[3] - 12, cy + 14);
    ctx.lineTo(cxs[3] - 12, cy + 2);
    ctx.moveTo(cxs[3], cy + 14);
    ctx.lineTo(cxs[3], cy - 13);
    ctx.moveTo(cxs[3] + 12, cy + 14);
    ctx.lineTo(cxs[3] + 12, cy - 4);
    ctx.stroke();
    // indicador de inicio
    rr(ctx, DW / 2 - 96, dh - 34, 192, 9, 4.5);
    ctx.fillStyle = 'rgba(238,240,246,0.78)';
    ctx.fill();
  }

  private repairRow(y: number, title: string, sub: string, status: string, color: string) {
    const { ctx } = this;
    rr(ctx, 32, y, DW - 64, 96, 28);
    ctx.fillStyle = UI.surface1;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 2;
    ctx.stroke();
    rr(ctx, 52, y + 18, 60, 60, 18);
    ctx.fillStyle = hexToRgba(color, 0.15);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.4;
    rr(ctx, 70, y + 29, 24, 38, 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(78, y + 35);
    ctx.lineTo(86, y + 35);
    ctx.stroke();
    ctx.fillStyle = UI.text;
    ctx.font = font(600, 25);
    setTracking(ctx, -0.01, 25);
    ctx.fillText(ellipsize(ctx, title, 250), 132, y + 43);
    ctx.fillStyle = UI.text3;
    ctx.font = font(400, 20);
    setTracking(ctx, 0, 20);
    ctx.fillText(ellipsize(ctx, sub, 270), 132, y + 73);
    ctx.font = font(600, 19);
    const tw = ctx.measureText(status).width;
    const cw = tw + 34;
    rr(ctx, DW - 52 - cw, y + 29, cw, 38, 19);
    ctx.fillStyle = hexToRgba(color, 0.15);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(status, DW - 52 - cw + 17, y + 55);
  }

  /* ------------------------------------------------------------- escenas */

  drawDashboard(input: ScreenData | undefined, layout: 'hero' | 'compact' = 'hero') {
    const data: ScreenData = input ?? DEFAULT_SCREEN;
    const trend = input?.trend && input.trend.length >= 2 ? input.trend : DEFAULT_SCREEN.trend;
    const delta = input?.delta !== undefined ? input.delta : deltaOf(trend);
    this.begin();
    const { ctx, dh } = this;
    this.glow(90, 120, 560, BRAND.iris, 0.3);
    this.glow(DW - 40, 420, 460, BRAND.cyan, 0.13);
    this.statusBar();
    this.header(layout === 'compact');

    if (layout === 'hero') {
      const cx = 32;
      const cy = 222;
      const cw = DW - 64;
      const ch = 476;
      this.card(cx, cy, cw, ch, 40, true);
      ctx.fillStyle = UI.text2;
      ctx.font = font(500, 26);
      setTracking(ctx, -0.005, 26);
      const chipW = this.deltaChip(cx + cw - 32, cy + 32, delta, true);
      ctx.fillStyle = UI.text2;
      ctx.font = font(500, 26);
      ctx.fillText(ellipsize(ctx, data.title, cw - 64 - chipW - 16), cx + 32, cy + 64);
      fitFont(ctx, data.value, 700, 82, cw - 64);
      ctx.fillStyle = UI.text;
      ctx.fillText(data.value, cx + 30, cy + 162);
      setTracking(ctx, 0, 22);
      if (data.caption) {
        ctx.fillStyle = UI.text3;
        ctx.font = font(400, 22);
        ctx.fillText(ellipsize(ctx, data.caption, cw - 64), cx + 32, cy + 204);
      }
      this.sparkline(trend, cx + 32, cy + 252, cw - 64, ch - 296, 5);

      const sy = cy + ch + 62;
      ctx.fillStyle = UI.text;
      ctx.font = font(600, 26);
      setTracking(ctx, -0.01, 26);
      ctx.fillText('Reparaciones activas', 40, sy);
      ctx.fillStyle = BRAND.iris;
      ctx.font = font(500, 22);
      ctx.textAlign = 'right';
      ctx.fillText('Ver todo', DW - 40, sy);
      ctx.textAlign = 'left';
      const rows: [string, string, string, string][] = [
        ['iPhone 14 Pro', 'Pantalla · Ana Torres', 'Reparando', UI.pending],
        ['Galaxy S23', 'Batería · Luis Pérez', 'Listo', UI.income],
        ['Moto G84', 'Puerto de carga · Sofía R.', 'Diagnóstico', UI.diag],
      ];
      const maxRows = Math.max(0, Math.floor((dh - 200 - (sy + 26)) / 108));
      rows.slice(0, maxRows).forEach((r, i) => this.repairRow(sy + 26 + i * 108, ...r));
    } else {
      const top = 232;
      ctx.fillStyle = UI.text2;
      ctx.font = font(500, 34);
      setTracking(ctx, -0.01, 34);
      ctx.fillText(ellipsize(ctx, data.title, DW - 88), 44, top + 50);
      fitFont(ctx, data.value, 700, 108, DW - 80);
      ctx.fillStyle = UI.text;
      ctx.fillText(data.value, 40, top + 170);
      const cw = this.deltaChip(44, top + 204, delta, false, 26);
      if (data.caption) {
        ctx.fillStyle = UI.text3;
        ctx.font = font(400, 26);
        setTracking(ctx, 0, 26);
        ctx.fillText(ellipsize(ctx, data.caption, DW - 100 - cw), 44 + cw + (cw ? 16 : 0), top + 236);
      }
      const gy = top + 300;
      const gh = Math.min(380, dh - gy - 470);
      this.card(28, gy - 28, DW - 56, gh + 70, 40, true);
      this.sparkline(trend, 56, gy + 8, DW - 112, gh - 10, 7);
      // barras de la semana
      const by = gy + gh + 92;
      ctx.fillStyle = UI.text;
      ctx.font = font(600, 26);
      ctx.fillText('Esta semana', 44, by);
      const bars = trend.slice(-7);
      const bmax = Math.max(...bars, 1);
      const bmin = Math.min(...bars, 0);
      const bw = (DW - 88) / 7;
      const bh = Math.max(60, dh - 200 - (by + 30));
      bars.forEach((v, i) => {
        const hh = 18 + ((v - bmin) / (bmax - bmin || 1)) * (bh - 18);
        const x = 44 + i * bw + bw * 0.18;
        rr(ctx, x, by + 30 + bh - hh, bw * 0.64, hh, 10);
        ctx.fillStyle = i === bars.length - 1 ? brandLinear(ctx, x, by, x + bw, by + bh) : 'rgba(124,108,255,0.28)';
        ctx.fill();
      });
    }
    this.tabBar();
    this.end();
  }

  /** Pantalla de arranque: isotipo con pulso. `p` 0..1 progreso del trazo, `glow` 0..1. */
  drawBoot(p: number, glow = 1, wordmark = 1) {
    this.begin('#040508');
    const { ctx, dh } = this;
    const cy = dh * 0.43;
    this.glow(DW / 2, cy, 520, BRAND.iris, 0.38 * glow);
    this.glow(DW / 2 + 80, cy + 160, 420, BRAND.cyan, 0.18 * glow);
    const s = 210;
    ctx.save();
    ctx.shadowColor = hexToRgba(BRAND.iris, 0.9 * glow);
    ctx.shadowBlur = 70;
    rr(ctx, DW / 2 - s / 2, cy - s / 2, s, s, (s * 15) / 64);
    ctx.fillStyle = BRAND.blue;
    ctx.fill();
    ctx.restore();
    drawBrandMark(ctx, DW / 2 - s / 2, cy - s / 2, s, p);
    if (wordmark > 0) {
      ctx.globalAlpha = wordmark;
      ctx.textAlign = 'center';
      ctx.fillStyle = UI.text;
      ctx.font = font(650, 70);
      setTracking(ctx, -0.035, 70);
      ctx.fillText('Reparo', DW / 2, cy + s / 2 + 118);
      ctx.fillStyle = UI.text3;
      ctx.font = font(400, 25);
      setTracking(ctx, 0, 25);
      ctx.fillText('Gestión para tu servicio técnico', DW / 2, cy + s / 2 + 166);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
    rr(ctx, DW / 2 - 96, dh - 34, 192, 9, 4.5);
    ctx.fillStyle = 'rgba(238,240,246,0.5)';
    ctx.fill();
    this.end();
  }

  dispose() {
    this.texture.dispose();
    this.canvas.width = this.canvas.height = 0;
  }
}

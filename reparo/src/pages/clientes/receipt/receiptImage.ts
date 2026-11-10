/* Recibo → PNG con canvas 2D (dibujo propio, sin html2canvas). Escala 2x. */
import { BRAND_GRADIENT, MARK } from '@/app/brand';
import type { Client, Settings } from '@/data';
import { buildReceiptModel, PAPER, type ReceiptModel, type ReceiptPiece, type ReceiptRow } from './receiptModel';

const SCALE = 2;
const PAPER_W = 384;
const MARGIN = 28; // fondo alrededor del papel
const PAD = 26; // padding interno del papel
const TOOTH = 7; // alto del borde dentado
const SANS = `'Geist Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;

type Ctx = CanvasRenderingContext2D;

function font(weight: number, size: number) {
  return `${weight} ${size}px ${SANS}`;
}

function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width <= maxWidth || !line) {
        line = test;
        // Palabra más larga que el ancho: córtala por caracteres.
        while (ctx.measureText(line).width > maxWidth && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--;
          out.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      } else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}

/** Como `wrap`, pero con renglones parejos (equivale a `text-wrap: balance`): sin palabras huérfanas. */
function wrapBalanced(ctx: Ctx, text: string, maxWidth: number): string[] {
  const base = wrap(ctx, text, maxWidth);
  if (base.length < 2) return base;
  let lo = maxWidth / base.length;
  let hi = maxWidth;
  let best = base;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const t = wrap(ctx, text, mid);
    if (t.length <= base.length && t.every((l) => ctx.measureText(l).width <= mid + 0.5)) {
      best = t;
      hi = mid;
    } else lo = mid;
  }
  return best;
}

function drawMark(ctx: Ctx, x: number, y: number, size: number) {
  const k = size / 64;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  const g = ctx.createLinearGradient(0, 0, 64, 64);
  g.addColorStop(0, BRAND_GRADIENT[0]);
  g.addColorStop(0.5, BRAND_GRADIENT[1]);
  g.addColorStop(1, BRAND_GRADIENT[2]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(0, 0, 64, 64, MARK.tile.r);
  ctx.fill();
  ctx.strokeStyle = PAPER.paper;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const p = MARK.phone;
  ctx.lineWidth = p.stroke;
  ctx.beginPath();
  ctx.roundRect(p.x, p.y, p.w, p.h, p.r);
  ctx.stroke();
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(MARK.speaker.x1, MARK.speaker.y1);
  ctx.lineTo(MARK.speaker.x2, MARK.speaker.y2);
  ctx.stroke();
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  MARK.pulse.split(' ').forEach((pt, i) => {
    const [px, py] = pt.split(',').map(Number);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  ctx.restore();
}

/** Contorno del papel con dientes arriba y abajo. */
function paperPath(ctx: Ctx, x: number, y: number, w: number, h: number) {
  const teeth = Math.round(w / (TOOTH * 2));
  const step = w / teeth;
  ctx.beginPath();
  ctx.moveTo(x, y + TOOTH);
  for (let i = 0; i < teeth; i++) {
    ctx.lineTo(x + step * i + step / 2, y);
    ctx.lineTo(x + step * (i + 1), y + TOOTH);
  }
  ctx.lineTo(x + w, y + h - TOOTH);
  for (let i = teeth; i > 0; i--) {
    ctx.lineTo(x + step * i - step / 2, y + h);
    ctx.lineTo(x + step * (i - 1), y + h - TOOTH);
  }
  ctx.closePath();
}

/** Recorre el contenido; si `draw` es false sólo mide. Devuelve la altura usada. */
function layout(ctx: Ctx, m: ReceiptModel, ox: number, oy: number, draw: boolean): number {
  const left = ox + PAD;
  const right = ox + PAPER_W - PAD;
  const inner = right - left;
  const cx = ox + PAPER_W / 2;
  let y = oy + TOOTH + 24;

  /**
   * Texto en la familia sans. Con `tab`, las cifras se dibujan en celdas de ancho
   * fijo (el canvas no admite `font-variant-numeric`): importes, fechas, folio y
   * teléfono quedan tabulares sin mezclar una segunda familia monoespaciada.
   */
  const text = (s: string, x: number, yy: number, f: string, color: string, align: CanvasTextAlign = 'left', tab = false) => {
    if (!draw) return;
    ctx.font = f;
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    if (!tab || !/\d/.test(s)) {
      ctx.textAlign = align;
      ctx.fillText(s, x, yy);
      return;
    }
    const digitW = Math.max(...'0123456789'.split('').map((d) => ctx.measureText(d).width));
    const chars = [...s];
    const widths = chars.map((ch) => (/\d/.test(ch) ? digitW : ctx.measureText(ch).width));
    const total = widths.reduce((a, w) => a + w, 0);
    let cx0 = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    ctx.textAlign = 'center';
    chars.forEach((ch, i) => {
      ctx.fillText(ch, cx0 + widths[i] / 2, yy);
      cx0 += widths[i];
    });
  };
  const rule = (dashed = true) => {
    y += 10;
    if (draw) {
      ctx.save();
      ctx.strokeStyle = PAPER.rule;
      ctx.lineWidth = 1;
      if (dashed) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(left, y + 0.5);
      ctx.lineTo(right, y + 0.5);
      ctx.stroke();
      ctx.restore();
    }
    y += 14;
  };
  const centered = (s: string, f: string, color: string, lh: number) => {
    ctx.font = f;
    for (const l of wrapBalanced(ctx, s, inner - 24)) {
      y += lh;
      text(l, cx, y, f, color, 'center');
    }
  };
  // Rejilla etiqueta/valor: la etiqueta a la izquierda y el valor alineado a la
  // derecha. Los textos largos (block) van en bloque: etiqueta arriba y el valor
  // debajo, alineado a la izquierda y a todo el ancho.
  const rows = (list: ReceiptRow[]) => {
    const lf = font(450, 12.5);
    const vf = font(520, 13);
    for (const r of list) {
      if (r.block) {
        y += 24;
        text(r.label, left, y, lf, PAPER.ink3);
        ctx.font = vf;
        for (const l of wrap(ctx, r.value, inner)) {
          y += 18;
          text(l, left, y, vf, PAPER.ink);
        }
        y += 4;
        continue;
      }
      ctx.font = lf;
      const lw = Math.max(ctx.measureText(r.label).width, 64);
      ctx.font = vf;
      const lines = wrap(ctx, r.value, inner - lw - 20);
      lines.forEach((l, i) => {
        y += i === 0 ? 20 : 17;
        if (i === 0) text(r.label, left, y, lf, PAPER.ink3);
        text(l, right, y, vf, PAPER.ink, 'right', true);
      });
    }
  };

  // Encabezado del negocio
  const mark = 40;
  if (draw) drawMark(ctx, cx - mark / 2, y, mark);
  y += mark + 4;
  centered(m.business.name, font(650, 17), PAPER.ink, 24);
  if (m.business.phone) centered(m.business.phone, font(450, 12.5), PAPER.ink2, 18);
  if (m.business.address) centered(m.business.address, font(450, 12.5), PAPER.ink2, 18);
  rule();

  y += 6;
  text('RECIBO DE SERVICIO', cx, y + 6, font(600, 10.5), PAPER.ink3, 'center');
  y += 32;
  text(m.folio, cx, y, font(650, 24), PAPER.ink, 'center', true);
  y += 20;
  text(m.dateText, cx, y, font(450, 12.5), PAPER.ink2, 'center', true);
  rule();

  rows(m.client);
  rows(m.device);

  if (m.piezas.length) {
    rule();
    y += 4;
    text('PIEZAS UTILIZADAS', left, y + 6, font(600, 10.5), PAPER.ink3);
    y += 6;
    for (const p of m.piezas) {
      ctx.font = font(500, 13);
      const lines = wrap(ctx, p.nombre, inner - 44);
      lines.forEach((l, i) => {
        y += i === 0 ? 20 : 17;
        if (i === 0) text(`${p.cantidad} ×`, left, y, font(500, 13), PAPER.ink2, 'left', true);
        text(l, left + 36, y, font(500, 13), PAPER.ink);
      });
    }
  }

  rule();
  // Importes
  y += 4;
  text('Total', left, y + 10, font(600, 15), PAPER.ink);
  text(m.totals.total, right, y + 10, font(650, 18), PAPER.ink, 'right', true);
  y += 14;
  y += 22;
  text('Abonado', left, y, font(450, 13), PAPER.ink2);
  text(m.totals.abonado, right, y, font(520, 13), PAPER.income, 'right', true);
  y += 22;
  const pending = m.totals.saldoCents > 0;
  text(pending ? 'Saldo pendiente' : 'Saldo', left, y, font(pending ? 600 : 450, 13), pending ? PAPER.pending : PAPER.ink2);
  text(m.totals.saldo, right, y, font(600, 13), pending ? PAPER.pending : PAPER.ink, 'right', true);
  // Pastilla de estado de pago
  y += 16;
  {
    const label = m.totals.statusLabel.toUpperCase();
    ctx.font = font(650, 10);
    const w = ctx.measureText(label).width + 18;
    if (draw) {
      ctx.fillStyle = pending ? 'rgba(201,138,16,0.12)' : 'rgba(15,159,118,0.12)';
      ctx.beginPath();
      ctx.roundRect(right - w, y, w, 20, 10);
      ctx.fill();
    }
    text(label, right - w / 2, y + 14, font(650, 10), pending ? PAPER.pending : PAPER.income, 'center');
    if (m.metodo) text(`Pago: ${m.metodo}`, left, y + 14, font(450, 12.5), PAPER.ink2);
    y += 20;
  }
  rule();
  rows([{ label: 'Garantía', value: m.garantia }]);

  if (m.footer) {
    rule();
    y -= 4;
    centered(m.footer, font(450, 12), PAPER.ink3, 17);
  }
  y += 18;
  return y - oy + TOOTH;
}

async function ensureFonts() {
  try {
    if (typeof document === 'undefined' || !document.fonts) return;
    await Promise.all([
      document.fonts.load(`600 16px 'Geist Variable'`),
      document.fonts.load(`450 16px 'Geist Variable'`),
    ]);
  } catch {
    /* sin fuentes propias: usa las del sistema */
  }
}

/** Dibuja el recibo y devuelve un PNG (2x). */
export async function renderReceiptPNG(client: Client, settings: Settings, opts: { piezas?: ReceiptPiece[] } = {}): Promise<Blob> {
  await ensureFonts();
  const model = buildReceiptModel(client, settings, opts.piezas ?? []);

  // 1) Medir
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('Canvas no disponible');
  const paperH = Math.ceil(layout(probe, model, MARGIN, MARGIN, false));
  const W = PAPER_W + MARGIN * 2;
  const H = paperH + MARGIN * 2;

  // 2) Dibujar
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = PAPER.backdrop;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.shadowColor = 'rgba(16,20,30,0.16)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = PAPER.paper;
  paperPath(ctx, MARGIN, MARGIN, PAPER_W, paperH);
  ctx.fill();
  ctx.restore();

  layout(ctx, model, MARGIN, MARGIN, true);

  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), 'image/png'),
  );
}

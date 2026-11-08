/* Generadores de trazados SVG: curva monotónica, barras redondeadas y arcos. */

export type Pt = readonly [number, number];

const r2 = (v: number) => Math.round(v * 100) / 100;

/* ---- Curva monotónica cúbica (Fritsch–Carlson, igual que d3.curveMonotoneX) ---- */

function slope3(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): number {
  const h0 = x1 - x0;
  const h1 = x2 - x1;
  const s0 = h0 ? (y1 - y0) / h0 : 0;
  const s1 = h1 ? (y2 - y1) / h1 : 0;
  const p = h0 + h1 ? (s0 * h1 + s1 * h0) / (h0 + h1) : 0;
  return (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
}

function slope2(x0: number, y0: number, x1: number, y1: number, t: number): number {
  const h = x1 - x0;
  return h ? ((3 * (y1 - y0)) / h - t) / 2 : t;
}

/** Segmentos de la curva (sin el "M" inicial) para reutilizar en áreas. */
function monotoneBody(pts: readonly Pt[]): string {
  const n = pts.length;
  if (n < 2) return '';
  if (n === 2) return `L${r2(pts[1][0])},${r2(pts[1][1])}`;
  const t = new Array<number>(n);
  for (let i = 1; i < n - 1; i++) {
    t[i] = slope3(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  }
  t[0] = slope2(pts[0][0], pts[0][1], pts[1][0], pts[1][1], t[1]);
  t[n - 1] = slope2(pts[n - 2][0], pts[n - 2][1], pts[n - 1][0], pts[n - 1][1], t[n - 2]);
  let d = '';
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const dx = (x1 - x0) / 3;
    d += `C${r2(x0 + dx)},${r2(y0 + dx * t[i])},${r2(x1 - dx)},${r2(y1 - dx * t[i + 1])},${r2(x1)},${r2(y1)}`;
  }
  return d;
}

export type CurveKind = 'monotone' | 'linear';

export function linePath(pts: readonly Pt[], curve: CurveKind = 'monotone'): string {
  if (!pts.length) return '';
  const head = `M${r2(pts[0][0])},${r2(pts[0][1])}`;
  if (pts.length === 1) return head + `h0.01`;
  if (curve === 'linear') return head + pts.slice(1).map((p) => `L${r2(p[0])},${r2(p[1])}`).join('');
  return head + monotoneBody(pts);
}

/** Área entre la curva y la línea base `y0` (normalmente el cero). */
export function areaPath(pts: readonly Pt[], y0: number, curve: CurveKind = 'monotone'): string {
  if (pts.length < 2) return '';
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `${linePath(pts, curve)}L${r2(last[0])},${r2(y0)}L${r2(first[0])},${r2(y0)}Z`;
}

/* ---- Barras: extremo de datos redondeado, base recta ---- */

/**
 * Rectángulo desde `yBase` hasta `yEnd` con las esquinas del extremo de datos
 * redondeadas (arriba si es positivo, abajo si es negativo).
 */
export function barPath(x: number, w: number, yBase: number, yEnd: number, radius: number, roundEnd = true): string {
  const h = Math.abs(yBase - yEnd);
  if (w <= 0 || h <= 0.01) return '';
  const up = yEnd < yBase;
  const r = roundEnd ? Math.max(0, Math.min(radius, w / 2, h)) : 0;
  const x0 = r2(x);
  const x1 = r2(x + w);
  const b = r2(yBase);
  const e = r2(yEnd);
  if (r <= 0.01) return `M${x0},${b}V${e}H${x1}V${b}Z`;
  const rr = r2(r);
  return up ? arcBarUp(x0, x1, b, e, rr) : arcBarDown(x0, x1, b, e, rr);
}

function arcBarUp(x0: number, x1: number, b: number, e: number, r: number): string {
  return `M${x0},${b}V${r2(e + r)}A${r},${r} 0 0 1 ${r2(x0 + r)},${e}H${r2(x1 - r)}A${r},${r} 0 0 1 ${x1},${r2(e + r)}V${b}Z`;
}

function arcBarDown(x0: number, x1: number, b: number, e: number, r: number): string {
  return `M${x0},${b}V${r2(e - r)}A${r},${r} 0 0 0 ${r2(x0 + r)},${e}H${r2(x1 - r)}A${r},${r} 0 0 0 ${x1},${r2(e - r)}V${b}Z`;
}

/* ---- Rebanadas de dona con separación constante y esquinas suavizadas ---- */

/** Punto polar: ángulo en radianes medido en sentido horario desde las 12. */
function polar(cx: number, cy: number, rho: number, theta: number): Pt {
  return [cx + rho * Math.sin(theta), cy - rho * Math.cos(theta)];
}

const fmtPt = (p: Pt) => `${r2(p[0])},${r2(p[1])}`;

/**
 * Sector anular entre `a0` y `a1` con un hueco de ancho constante `gap` (px)
 * entre rebanadas y esquinas redondeadas de radio `corner`.
 */
export function donutSlicePath(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  a0: number,
  a1: number,
  gap: number,
  corner: number,
): string {
  const span = a1 - a0;
  if (span <= 0.0005) return '';
  // Anillo completo (una sola rebanada).
  if (span >= Math.PI * 2 - 1e-6) {
    const top = polar(cx, cy, outer, 0);
    const bot = polar(cx, cy, outer, Math.PI);
    const ti = polar(cx, cy, inner, 0);
    const bi = polar(cx, cy, inner, Math.PI);
    return (
      `M${fmtPt(top)}A${outer},${outer} 0 1 1 ${fmtPt(bot)}A${outer},${outer} 0 1 1 ${fmtPt(top)}Z` +
      `M${fmtPt(ti)}A${inner},${inner} 0 1 0 ${fmtPt(bi)}A${inner},${inner} 0 1 0 ${fmtPt(ti)}Z`
    );
  }
  const h = gap / 2;
  const u = (t: number): Pt => [Math.sin(t), -Math.cos(t)];
  const nrm = (t: number): Pt => [Math.cos(t), Math.sin(t)];
  const along = (t: number, dist: number, off: number): Pt => {
    const a = u(t);
    const b = nrm(t);
    return [cx + a[0] * dist + b[0] * off, cy + a[1] * dist + b[1] * off];
  };

  // Radio de esquina máximo que cabe en el borde exterior.
  let co = Math.min(corner, (outer - inner) / 2);
  while (co > 0 && 2 * Math.asin(Math.min(1, (h + co) / (outer - co))) >= span) co -= 0.25;
  co = Math.max(0, co);
  if (2 * Math.asin(Math.min(1, h / outer)) >= span) return '';

  let ci = Math.min(corner, (outer - inner) / 2);
  while (ci > 0 && 2 * Math.asin(Math.min(1, (h + ci) / (inner + ci))) >= span) ci -= 0.25;
  ci = Math.max(0, ci);
  const innerFits = inner > 0 && 2 * Math.asin(Math.min(1, h / inner)) < span;

  // --- Borde exterior ---
  const dso = Math.asin(Math.min(1, (h + co) / (outer - co)));
  const tso = a0 + dso;
  const teo = a1 - dso;
  const startEdgeOuter = along(a0, (outer - co) * Math.cos(dso), h);
  const outerStart = polar(cx, cy, outer, tso);
  const outerEnd = polar(cx, cy, outer, teo);
  const endEdgeOuter = along(a1, (outer - co) * Math.cos(dso), -h);
  const largeOuter = teo - tso > Math.PI ? 1 : 0;

  let d = `M${fmtPt(startEdgeOuter)}`;
  if (co > 0) d += `A${r2(co)},${r2(co)} 0 0 1 ${fmtPt(outerStart)}`;
  d += `A${outer},${outer} 0 ${largeOuter} 1 ${fmtPt(outerEnd)}`;
  if (co > 0) d += `A${r2(co)},${r2(co)} 0 0 1 ${fmtPt(endEdgeOuter)}`;

  if (innerFits) {
    const dsi = Math.asin(Math.min(1, (h + ci) / (inner + ci)));
    const tsi = a0 + dsi;
    const tei = a1 - dsi;
    const endEdgeInner = along(a1, (inner + ci) * Math.cos(dsi), -h);
    const innerEnd = polar(cx, cy, inner, tei);
    const innerStart = polar(cx, cy, inner, tsi);
    const startEdgeInner = along(a0, (inner + ci) * Math.cos(dsi), h);
    const largeInner = tei - tsi > Math.PI ? 1 : 0;
    d += `L${fmtPt(endEdgeInner)}`;
    if (ci > 0) d += `A${r2(ci)},${r2(ci)} 0 0 1 ${fmtPt(innerEnd)}`;
    d += `A${inner},${inner} 0 ${largeInner} 0 ${fmtPt(innerStart)}`;
    if (ci > 0) d += `A${r2(ci)},${r2(ci)} 0 0 1 ${fmtPt(startEdgeInner)}`;
  } else {
    // Los bordes se cruzan antes del radio interior: punta.
    const rho = h / Math.sin(span / 2);
    d += `L${fmtPt(polar(cx, cy, Math.min(rho, outer - 1), (a0 + a1) / 2))}`;
  }
  return d + 'Z';
}

/** Arco abierto (para anillos de progreso). */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const s = polar(cx, cy, r, a0);
  const e = polar(cx, cy, r, a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${fmtPt(s)}A${r},${r} 0 ${large} 1 ${fmtPt(e)}`;
}

/* Datos de ejemplo realistas de un taller de celulares (sólo para la galería).
   Montos en CENTAVOS, como en el resto de la app. */
import { compact } from './lib/format';

export interface DemoPoint {
  start: number;
  end: number;
  label: string;
  cobradoCents: number;
  gastadoCents: number;
  gananciaCents: number;
  anteriorCents: number;
  servicios: number;
  efectivoCents: number;
  transferenciaCents: number;
  tarjetaCents: number;
}

/* ---- Formato en pesos ---- */
const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
export const money = (cents: number) => mxn.format(cents / 100).replace('-', '−');
export const moneyCompact = (cents: number) => (cents === 0 ? '$0' : compact(cents / 100, '$'));
const int = new Intl.NumberFormat('es-MX');
export const count = (n: number) => int.format(n);

const dayShort = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const dayLong = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
const monthShort = new Intl.DateTimeFormat('es-MX', { month: 'short' });
const monthLong = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const longDay = (ts: number) => cap(dayLong.format(ts).replace(' de ', ' ').replace(' de ', ' '));
export const longMonth = (ts: number) => cap(monthLong.format(ts));
export const weekRange = (start: number, end: number) =>
  `Semana del ${dayShort.format(start)} al ${dayShort.format(end - 1)}`;

/* ---- Generador determinista ---- */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TODAY = new Date(2026, 10, 7);
const DAY = 86_400_000;
const round10 = (pesos: number) => Math.max(0, Math.round(pesos / 10) * 10) * 100;

interface Day {
  ts: number;
  cobrado: number;
  gastado: number;
  servicios: number;
  efectivo: number;
  transferencia: number;
  tarjeta: number;
}

function genDays(days: number, seed: number): Day[] {
  const r = rng(seed);
  const out: Day[] = [];
  for (let k = days - 1; k >= 0; k--) {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - k);
    const dow = d.getDay();
    const idx = days - 1 - k;
    const base = dow === 0 ? 900 : dow === 6 ? 5600 : dow === 1 ? 2600 : 3500;
    const trend = 1 + idx * 0.004;
    const cobrado = round10(base * (0.55 + r() * 0.85) * trend);
    let gastado = 0;
    if (dow === 1) gastado = round10(2200 + r() * 4200); // reposición de los lunes
    else if (r() < 0.42) gastado = round10(250 + r() * 2600);
    const servicios = Math.max(0, Math.round(cobrado / 100 / (520 + r() * 260)));
    const ef = 0.38 + r() * 0.2;
    const tr = 0.3 + r() * 0.18;
    const efectivo = Math.round(cobrado * ef);
    const transferencia = Math.round(cobrado * tr);
    out.push({ ts: d.getTime(), cobrado, gastado, servicios, efectivo, transferencia, tarjeta: cobrado - efectivo - transferencia });
  }
  return out;
}

function toPoint(start: number, end: number, label: string, ds: Day[], prev: number): DemoPoint {
  const sum = (f: (d: Day) => number) => ds.reduce((a, d) => a + f(d), 0);
  const cobrado = sum((d) => d.cobrado);
  const gastado = sum((d) => d.gastado);
  return {
    start,
    end,
    label,
    cobradoCents: cobrado,
    gastadoCents: gastado,
    gananciaCents: cobrado - gastado,
    anteriorCents: prev,
    servicios: sum((d) => d.servicios),
    efectivoCents: sum((d) => d.efectivo),
    transferenciaCents: sum((d) => d.transferencia),
    tarjetaCents: sum((d) => d.tarjeta),
  };
}

/** Últimos 30 días (más los 30 previos como comparación). */
export function daily30(seed = 7): DemoPoint[] {
  const all = genDays(60, seed);
  const prev = all.slice(0, 30);
  return all.slice(30).map((d, i) => {
    const p = prev[i];
    return toPoint(d.ts, d.ts + DAY, dayShort.format(d.ts), [d], p.cobrado - p.gastado);
  });
}

/** Últimas 12 semanas (lunes a domingo). */
export function weekly12(seed = 11): DemoPoint[] {
  const days = genDays(7 * 24, seed);
  // Alinea al lunes de la semana actual.
  const last = new Date(TODAY);
  const offset = (last.getDay() + 6) % 7;
  const currentMonday = new Date(last.getFullYear(), last.getMonth(), last.getDate() - offset).getTime();
  const weeks: DemoPoint[] = [];
  for (let w = 11; w >= 0; w--) {
    const start = currentMonday - w * 7 * DAY;
    const end = start + 7 * DAY;
    const ds = days.filter((d) => d.ts >= start && d.ts < end);
    const pds = days.filter((d) => d.ts >= start - 12 * 7 * DAY && d.ts < end - 12 * 7 * DAY);
    const prev = pds.reduce((a, d) => a + d.cobrado - d.gastado, 0);
    weeks.push(toPoint(start, end, dayShort.format(start), ds, prev));
  }
  return weeks;
}

/** Últimos 12 meses completos. */
export function monthly12(seed = 23): DemoPoint[] {
  const r = rng(seed);
  // Estacionalidad típica: diciembre y mayo (Día de las Madres) fuertes; enero flojo.
  const season = [0.78, 0.86, 0.94, 0.97, 1.12, 0.98, 1.02, 1.0, 1.04, 1.06, 1.08, 1.32];
  const out: DemoPoint[] = [];
  for (let m = 12; m >= 1; m--) {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - m, 1);
    const e = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const growth = 1 + (12 - m) * 0.018;
    const cobrado = round10(84_000 * season[d.getMonth()] * growth * (0.92 + r() * 0.16));
    const gastado = round10((cobrado / 100) * (0.36 + r() * 0.14));
    const ef = Math.round(cobrado * (0.42 + r() * 0.08));
    const tr = Math.round(cobrado * (0.33 + r() * 0.06));
    out.push({
      start: d.getTime(),
      end: e.getTime(),
      label: cap(monthShort.format(d).replace('.', '')),
      cobradoCents: cobrado,
      gastadoCents: gastado,
      gananciaCents: cobrado - gastado,
      anteriorCents: 0,
      servicios: Math.round(cobrado / 100 / 640),
      efectivoCents: ef,
      transferenciaCents: tr,
      tarjetaCents: cobrado - ef - tr,
    });
  }
  return out;
}

/* ---- Categorías y rankings ---- */
export const gastoPorCategoria = [
  { key: 'pantallas', label: 'Pantallas', value: 1_842_000, color: 'var(--chart-1)' },
  { key: 'baterias', label: 'Baterías', value: 786_000, color: 'var(--chart-2)' },
  { key: 'placas', label: 'Placas y chips', value: 415_000, color: 'var(--chart-6)' },
  { key: 'puertos', label: 'Puertos de carga', value: 324_000, color: 'var(--chart-4)' },
  { key: 'camaras', label: 'Cámaras', value: 298_000, color: 'var(--chart-7)' },
  { key: 'herramientas', label: 'Herramientas', value: 189_000, color: 'var(--chart-3)' },
  { key: 'accesorios', label: 'Accesorios', value: 132_000, color: 'var(--chart-5)' },
  { key: 'carcasas', label: 'Carcasas y tapas', value: 96_000, color: 'var(--chart-8)' },
];

export const serviciosTop = [
  { key: 'pantalla', label: 'Cambio de pantalla', value: 7_140_000, sublabel: '42' },
  { key: 'bateria', label: 'Cambio de batería', value: 2_170_000, sublabel: '31' },
  { key: 'puerto', label: 'Puerto de carga', value: 990_000, sublabel: '18' },
  { key: 'camara', label: 'Cámara trasera', value: 810_000, sublabel: '9' },
  { key: 'software', label: 'Software y liberación', value: 770_000, sublabel: '22' },
  { key: 'tapa', label: 'Tapa trasera', value: 660_000, sublabel: '11' },
  { key: 'audio', label: 'Micrófono y bocina', value: 360_000, sublabel: '8' },
  { key: 'mica', label: 'Mica y protector', value: 270_000, sublabel: '27' },
  { key: 'diagnostico', label: 'Diagnóstico', value: 225_000, sublabel: '15' },
];

export const gastoPorProveedor = [
  { key: 'mobilparts', label: 'MobilParts CDMX', value: 1_465_000 },
  { key: 'refacel', label: 'Refacel Mayoreo', value: 982_000 },
  { key: 'techcenter', label: 'Tech Center Plaza', value: 618_000 },
  { key: 'amazon', label: 'Compras en línea', value: 341_000 },
  { key: 'ferreteria', label: 'Ferretería y herramienta', value: 214_000 },
];

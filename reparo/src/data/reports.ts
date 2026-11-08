/* Reportes como funciones PURAS (testeables). Los hooks de hooks.ts las usan.
   Reglas (ARCHITECTURE.md):
   - Cobrado = Σ pagadoCents de clientes no cancelados ni borrados, por su `fecha`.
   - Facturado = Σ cobroCents. Por cobrar = facturado − cobrado.
   - Gastado = Σ totalCents de gastos no borrados, por su `fecha`.
   - Ganancia = cobrado − gastado. Margen = ganancia / cobrado.
   - Entregados = clientes (no cancelados) con fechaEntrega en el rango. */
import type {
  Client,
  DateRange,
  Expense,
  ExpenseCategory,
  ID,
  InventoryItem,
  InventoryMovement,
  RepairStatus,
  SeriesPoint,
  Summary,
  Timestamp,
} from './types';
import { EXPENSE_CATEGORY_LABEL, REPAIR_STATUSES } from './types';
import { buildBuckets, type SeriesBucket } from './periods';
import { needsReorder, normalizeText } from './derive';

const inRange = (ts: number | null | undefined, r: DateRange): boolean => ts != null && ts >= r.start && ts < r.end;

/** Cliente que cuenta para ingresos (no borrado ni cancelado). */
export function isBillable(c: Client): boolean {
  return c.deletedAt == null && c.estado !== 'cancelado';
}

export function isActiveExpense(e: Expense): boolean {
  return e.deletedAt == null;
}

export function emptySummary(range: DateRange): Summary {
  return {
    range: { start: range.start, end: range.end },
    cobradoCents: 0,
    facturadoCents: 0,
    porCobrarCents: 0,
    gastadoCents: 0,
    gananciaCents: 0,
    margen: null,
    servicios: 0,
    entregados: 0,
    ticketPromedioCents: 0,
    numGastos: 0,
  };
}

export function computeSummary(range: DateRange, clients: readonly Client[], expenses: readonly Expense[]): Summary {
  const s = emptySummary(range);
  for (const c of clients) {
    if (!isBillable(c)) continue;
    if (inRange(c.fecha, range)) {
      s.cobradoCents += c.pagadoCents || 0;
      s.facturadoCents += c.cobroCents || 0;
      s.servicios += 1;
    }
    if (inRange(c.fechaEntrega, range)) s.entregados += 1;
  }
  for (const e of expenses) {
    if (!isActiveExpense(e) || !inRange(e.fecha, range)) continue;
    s.gastadoCents += e.totalCents || 0;
    s.numGastos += 1;
  }
  s.porCobrarCents = Math.max(0, s.facturadoCents - s.cobradoCents);
  s.gananciaCents = s.cobradoCents - s.gastadoCents;
  s.margen = s.cobradoCents > 0 ? s.gananciaCents / s.cobradoCents : null;
  s.ticketPromedioCents = s.servicios > 0 ? Math.round(s.facturadoCents / s.servicios) : 0;
  return s;
}

/** Índice de la cubeta que contiene `ts` (búsqueda binaria; −1 si queda fuera). */
function bucketIndex(points: readonly { start: number; end: number }[], ts: number): number {
  let lo = 0;
  let hi = points.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = points[mid];
    if (ts < p.start) hi = mid - 1;
    else if (ts >= p.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

export function computeSeries(
  range: DateRange,
  bucket: SeriesBucket,
  clients: readonly Client[],
  expenses: readonly Expense[],
  weekStartsOn?: 0 | 1,
): SeriesPoint[] {
  const points: SeriesPoint[] = buildBuckets(range, bucket, weekStartsOn).map((b) => ({
    start: b.start,
    end: b.end,
    label: b.label,
    cobradoCents: 0,
    gastadoCents: 0,
    gananciaCents: 0,
    servicios: 0,
  }));
  if (!points.length) return points;
  for (const c of clients) {
    if (!isBillable(c) || !inRange(c.fecha, range)) continue;
    const i = bucketIndex(points, c.fecha);
    if (i < 0) continue;
    points[i].cobradoCents += c.pagadoCents || 0;
    points[i].servicios += 1;
  }
  for (const e of expenses) {
    if (!isActiveExpense(e) || !inRange(e.fecha, range)) continue;
    const i = bucketIndex(points, e.fecha);
    if (i < 0) continue;
    points[i].gastadoCents += e.totalCents || 0;
  }
  for (const p of points) p.gananciaCents = p.cobradoCents - p.gastadoCents;
  return points;
}

export interface CategoryBreakdownRow {
  categoria: ExpenseCategory;
  label: string;
  totalCents: number;
  count: number;
}

/** Gasto por categoría (sólo categorías con movimientos), de mayor a menor. */
export function computeCategoryBreakdown(range: DateRange, expenses: readonly Expense[]): CategoryBreakdownRow[] {
  const map = new Map<ExpenseCategory, CategoryBreakdownRow>();
  for (const e of expenses) {
    if (!isActiveExpense(e) || !inRange(e.fecha, range)) continue;
    let row = map.get(e.categoria);
    if (!row) {
      row = { categoria: e.categoria, label: EXPENSE_CATEGORY_LABEL[e.categoria] ?? e.categoria, totalCents: 0, count: 0 };
      map.set(e.categoria, row);
    }
    row.totalCents += e.totalCents || 0;
    row.count += 1;
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents || b.count - a.count);
}

export interface ServiceBreakdownRow {
  servicio: string;
  cobradoCents: number;
  count: number;
}

/** Cobrado por tipo de servicio, de mayor a menor. */
export function computeServiceBreakdown(range: DateRange, clients: readonly Client[]): ServiceBreakdownRow[] {
  const map = new Map<string, ServiceBreakdownRow>();
  for (const c of clients) {
    if (!isBillable(c) || !inRange(c.fecha, range)) continue;
    const servicio = c.servicio?.trim() || 'Otro';
    let row = map.get(servicio);
    if (!row) {
      row = { servicio, cobradoCents: 0, count: 0 };
      map.set(servicio, row);
    }
    row.cobradoCents += c.pagadoCents || 0;
    row.count += 1;
  }
  return [...map.values()].sort((a, b) => b.cobradoCents - a.cobradoCents || b.count - a.count);
}

/** Conteo por estado de los clientes activos (no borrados). */
export function computeStatusCounts(clients: readonly Client[]): Record<RepairStatus, number> {
  const out = Object.fromEntries(REPAIR_STATUSES.map((s) => [s, 0])) as Record<RepairStatus, number>;
  for (const c of clients) {
    if (c.deletedAt != null) continue;
    if (c.estado in out) out[c.estado] += 1;
  }
  return out;
}

export interface ClientFinancials {
  cobroCents: number;
  pagadoCents: number;
  saldoCents: number;
  gastosCents: number;
  piezasCents: number;
  gananciaCents: number;
}

/**
 * Finanzas de un servicio: gastos ligados (clienteId) y costo de las piezas de
 * inventario usadas (movimientos 'uso'). ganancia = pagado − gastos − piezas.
 */
export function computeClientFinancials(
  client: Pick<Client, 'cobroCents' | 'pagadoCents'> | null | undefined,
  expenses: readonly Expense[],
  movements: readonly InventoryMovement[],
  clientId?: ID,
): ClientFinancials {
  const cobro = client?.cobroCents ?? 0;
  const pagado = client?.pagadoCents ?? 0;
  let gastos = 0;
  for (const e of expenses) {
    if (!isActiveExpense(e)) continue;
    if (clientId && e.clienteId !== clientId) continue;
    gastos += e.totalCents || 0;
  }
  let piezas = 0;
  for (const m of movements) {
    if (m.type !== 'uso') continue;
    if (clientId && m.clienteId !== clientId) continue;
    piezas += Math.abs(m.cantidad) * (m.costoUnitarioCents || 0);
  }
  return {
    cobroCents: cobro,
    pagadoCents: pagado,
    saldoCents: Math.max(0, cobro - pagado),
    gastosCents: gastos,
    piezasCents: piezas,
    gananciaCents: pagado - gastos - piezas,
  };
}

export interface DirectoryEntry {
  nombre: string;
  telefono: string;
  visitas: number;
  ultimaVisita: Timestamp;
}

/**
 * Directorio de personas a partir de los servicios: agrupa por teléfono (últimos
 * 10 dígitos) o, si no hay, por nombre normalizado. Ordenado por última visita.
 */
export function computeCustomerDirectory(clients: readonly Client[]): DirectoryEntry[] {
  const map = new Map<string, DirectoryEntry>();
  for (const c of clients) {
    if (c.deletedAt != null) continue;
    const digits = (c.telefono ?? '').replace(/\D/g, '');
    const key = digits.length >= 7 ? 't:' + digits.slice(-10) : 'n:' + normalizeText(c.nombre);
    if (key === 'n:') continue;
    const row = map.get(key);
    if (!row) {
      map.set(key, { nombre: c.nombre, telefono: c.telefono, visitas: 1, ultimaVisita: c.fecha });
    } else {
      row.visitas += 1;
      if (c.fecha >= row.ultimaVisita) {
        row.ultimaVisita = c.fecha;
        row.nombre = c.nombre || row.nombre;
        row.telefono = c.telefono || row.telefono;
      }
    }
  }
  return [...map.values()].sort((a, b) => b.ultimaVisita - a.ultimaVisita);
}

export interface InventoryStats {
  articulos: number;
  unidades: number;
  valorCents: number;
  porPedir: number;
  agotados: number;
  pedidos: number;
}

export function computeInventoryStats(items: readonly InventoryItem[]): InventoryStats {
  const s: InventoryStats = { articulos: 0, unidades: 0, valorCents: 0, porPedir: 0, agotados: 0, pedidos: 0 };
  for (const i of items) {
    if (i.deletedAt != null) continue;
    s.articulos += 1;
    s.unidades += Math.max(0, i.stock);
    s.valorCents += Math.max(0, i.stock) * (i.costoUnitarioCents || 0);
    if (needsReorder(i)) s.porPedir += 1;
    if (i.stock <= 0) s.agotados += 1;
    if (i.pedidoAt != null) s.pedidos += 1;
  }
  return s;
}

/** Variación relativa entre dos valores (null si la base es 0). 0.12 = +12 %. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return (current - previous) / Math.abs(previous);
}

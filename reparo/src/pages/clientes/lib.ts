import { REPAIR_STATUSES, deviceFullName, formatFolio, matchesQuery, paymentStatus, saldoCents, type Client, type RepairStatus } from '@/data';

export type StatusFilter = 'todos' | 'taller' | 'listo' | 'entregado' | 'cancelado' | RepairStatus;
export type PayFilter = 'todos' | 'pagados' | 'saldo';
export type SortKey = 'recientes' | 'antiguos' | 'folio' | 'saldo' | 'total' | 'nombre';

export const TALLER: RepairStatus[] = ['recibido', 'diagnostico', 'reparando'];

export function parseStatusFilter(v: string | null): StatusFilter {
  if (!v) return 'todos';
  if (v === 'taller' || v === 'todos') return v;
  if ((REPAIR_STATUSES as readonly string[]).includes(v)) return v as RepairStatus;
  if (v === 'listos') return 'listo';
  if (v === 'entregados') return 'entregado';
  if (v === 'cancelados') return 'cancelado';
  return 'todos';
}

export function matchesStatus(c: Client, f: StatusFilter): boolean {
  if (f === 'todos') return true;
  if (f === 'taller') return TALLER.includes(c.estado);
  return c.estado === f;
}

export function matchesPay(c: Client, f: PayFilter): boolean {
  if (f === 'todos') return true;
  const s = paymentStatus(c);
  return f === 'pagados' ? s === 'pagado' : s !== 'pagado';
}

const hayCache = new WeakMap<Client, string>();
export function haystack(c: Client): string {
  let h = hayCache.get(c);
  if (!h) {
    h = [c.nombre, c.telefono, c.email, formatFolio(c.folio), String(c.folio), c.marca, c.modelo, deviceFullName(c), c.imei, c.servicio].join(' ');
    hayCache.set(c, h);
  }
  return h;
}

export function matchesSearch(c: Client, q: string): boolean {
  if (!q.trim()) return true;
  // "#123" o "000123" → folio exacto también
  const folioQ = q.trim().replace(/^#/, '');
  if (/^\d+$/.test(folioQ) && Number(folioQ) === c.folio) return true;
  return matchesQuery(haystack(c), q);
}

export const SORTERS: Record<SortKey, (a: Client, b: Client) => number> = {
  recientes: (a, b) => b.fecha - a.fecha || b.folio - a.folio,
  antiguos: (a, b) => a.fecha - b.fecha || a.folio - b.folio,
  folio: (a, b) => b.folio - a.folio,
  saldo: (a, b) => saldoCents(b) - saldoCents(a) || b.fecha - a.fecha,
  total: (a, b) => b.cobroCents - a.cobroCents || b.fecha - a.fecha,
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }) || b.fecha - a.fecha,
};

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'recientes', label: 'Más recientes' },
  { value: 'antiguos', label: 'Más antiguos' },
  { value: 'folio', label: 'Folio' },
  { value: 'saldo', label: 'Mayor saldo' },
  { value: 'total', label: 'Mayor total' },
  { value: 'nombre', label: 'Nombre (A–Z)' },
];

/** Estado contradictorio: el equipo ya se entregó pero aún hay saldo por cobrar. */
export function deliveredDebtCents(c: Client): number {
  return c.estado === 'entregado' ? Math.max(0, saldoCents(c)) : 0;
}

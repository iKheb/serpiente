/* Hooks reactivos (useLiveQuery). Devuelven `undefined` mientras cargan. */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type {
  AppNotification,
  AuditAction,
  AuditEntry,
  Client,
  ClientPhoto,
  DateRange,
  EntityType,
  Expense,
  ID,
  InventoryItem,
  InventoryMovement,
  Period,
  PeriodKind,
  RepairStatus,
  SeriesPoint,
  Settings,
  Summary,
  Timestamp,
} from './types';
import { db, readSettings } from './db';
import { withSettingsDefaults, defaultSettings } from './defaults';
import { getCachedSettings, subscribeSettings } from './settings-cache';
import { formatDate, formatDateTime, formatMoney, formatRelative, formatTime, type MoneyFormatOptions } from './format';
import { getPeriod, shiftPeriod, type SeriesBucket } from './periods';
import {
  computeCategoryBreakdown,
  computeClientFinancials,
  computeCustomerDirectory,
  computeInventoryStats,
  computeSeries,
  computeServiceBreakdown,
  computeStatusCounts,
  computeSummary,
  type CategoryBreakdownRow,
  type ClientFinancials,
  type DirectoryEntry,
  type InventoryStats,
  type ServiceBreakdownRow,
} from './reports';

const byFechaDesc = <T extends { fecha: number }>(a: T, b: T) => b.fecha - a.fecha;
const notDeleted = <T extends { deletedAt: number | null }>(x: T) => x.deletedAt == null;
const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/* ------------------------------- Ajustes --------------------------------- */

export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => {
    const s = await db.settings.get('settings');
    return s ? withSettingsDefaults(s) : defaultSettings(0);
  }, []);
}

/* ------------------------------- Clientes -------------------------------- */

export function useClients(opts: { includeDeleted?: boolean } = {}): Client[] | undefined {
  const includeDeleted = !!opts.includeDeleted;
  return useLiveQuery(async () => {
    const rows = await db.clients.orderBy('fecha').reverse().toArray();
    return includeDeleted ? rows : rows.filter(notDeleted);
  }, [includeDeleted]);
}

export function useClient(id: ID | null | undefined): Client | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.clients.get(id)) ?? null) : null), [id ?? null]);
}

/* -------------------------------- Gastos --------------------------------- */

export function useExpenses(opts: { includeDeleted?: boolean; clienteId?: ID } = {}): Expense[] | undefined {
  const includeDeleted = !!opts.includeDeleted;
  const clienteId = opts.clienteId ?? null;
  return useLiveQuery(async () => {
    const rows = clienteId
      ? (await db.expenses.where('clienteId').equals(clienteId).toArray()).sort(byFechaDesc)
      : await db.expenses.orderBy('fecha').reverse().toArray();
    return includeDeleted ? rows : rows.filter(notDeleted);
  }, [includeDeleted, clienteId]);
}

export function useExpense(id: ID | null | undefined): Expense | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.expenses.get(id)) ?? null) : null), [id ?? null]);
}

/* ------------------------------ Inventario ------------------------------- */

export function useInventory(opts: { includeDeleted?: boolean } = {}): InventoryItem[] | undefined {
  const includeDeleted = !!opts.includeDeleted;
  return useLiveQuery(async () => {
    const rows = await db.inventory.toArray();
    const list = includeDeleted ? rows : rows.filter(notDeleted);
    return list.sort((a, b) => collator.compare(a.nombre, b.nombre));
  }, [includeDeleted]);
}

export function useInventoryItem(id: ID | null | undefined): InventoryItem | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.inventory.get(id)) ?? null) : null), [id ?? null]);
}

export function useMovements(opts: { itemId?: ID; clienteId?: ID; limit?: number } = {}): InventoryMovement[] | undefined {
  const itemId = opts.itemId ?? null;
  const clienteId = opts.clienteId ?? null;
  const limit = opts.limit ?? 0;
  return useLiveQuery(async () => {
    let rows: InventoryMovement[];
    if (itemId) {
      rows = await db.movements.where('itemId').equals(itemId).toArray();
      if (clienteId) rows = rows.filter((m) => m.clienteId === clienteId);
    } else if (clienteId) {
      rows = await db.movements.where('clienteId').equals(clienteId).toArray();
    } else {
      const q = db.movements.orderBy('ts').reverse();
      return limit > 0 ? q.limit(limit).toArray() : q.toArray();
    }
    rows.sort((a, b) => b.ts - a.ts);
    return limit > 0 ? rows.slice(0, limit) : rows;
  }, [itemId, clienteId, limit]);
}

/* ------------------------------- Actividad ------------------------------- */

export function useAudit(
  opts: { entity?: EntityType; entityId?: ID; action?: AuditAction; limit?: number } = {},
): AuditEntry[] | undefined {
  const entity = opts.entity ?? null;
  const entityId = opts.entityId ?? null;
  const action = opts.action ?? null;
  const limit = opts.limit ?? 0;
  return useLiveQuery(async () => {
    let rows: AuditEntry[];
    if (entityId) {
      rows = await db.audit.where('entityId').equals(entityId).toArray();
    } else if (entity) {
      rows = await db.audit.where('entity').equals(entity).toArray();
    } else if (action) {
      rows = await db.audit.where('action').equals(action).toArray();
    } else {
      const q = db.audit.orderBy('ts').reverse();
      return limit > 0 ? q.limit(limit).toArray() : q.toArray();
    }
    rows = rows.filter((e) => (!entity || e.entity === entity) && (!action || e.action === action));
    rows.sort((a, b) => b.ts - a.ts);
    return limit > 0 ? rows.slice(0, limit) : rows;
  }, [entity, entityId, action, limit]);
}

/* ---------------------------- Notificaciones ----------------------------- */

export function useNotifications(opts: { unreadOnly?: boolean; limit?: number } = {}): AppNotification[] | undefined {
  const unreadOnly = !!opts.unreadOnly;
  const limit = opts.limit ?? 0;
  return useLiveQuery(async () => {
    let q = db.notifications.orderBy('ts').reverse();
    if (unreadOnly) q = q.filter((n) => n.readAt == null);
    return limit > 0 ? q.limit(limit).toArray() : q.toArray();
  }, [unreadOnly, limit]);
}

export function useUnreadCount(): number {
  return useLiveQuery(() => db.notifications.filter((n) => n.readAt == null).count(), [], 0);
}

/* -------------------------------- Papelera ------------------------------- */

export function useTrash(): { clients: Client[]; expenses: Expense[]; inventory: InventoryItem[] } | undefined {
  return useLiveQuery(async () => {
    const [clients, expenses, inventory] = await Promise.all([
      db.clients.filter((c) => c.deletedAt != null).toArray(),
      db.expenses.filter((e) => e.deletedAt != null).toArray(),
      db.inventory.filter((i) => i.deletedAt != null).toArray(),
    ]);
    const byDeleted = <T extends { deletedAt: number | null }>(a: T, b: T) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0);
    return { clients: clients.sort(byDeleted), expenses: expenses.sort(byDeleted), inventory: inventory.sort(byDeleted) };
  }, []);
}

/* -------------------------------- Reportes ------------------------------- */

/** Clientes relevantes para un rango: recibidos en el rango o entregados en él (fecha ≤ fechaEntrega). */
async function clientsForRange(range: DateRange): Promise<Client[]> {
  return db.clients.where('fecha').below(range.end).toArray();
}

async function expensesForRange(range: DateRange): Promise<Expense[]> {
  return db.expenses.where('fecha').between(range.start, range.end, true, false).toArray();
}

export function useSummary(range: DateRange): Summary | undefined {
  const { start, end } = range;
  return useLiveQuery(async () => {
    const r = { start, end };
    const [clients, expenses] = await Promise.all([clientsForRange(r), expensesForRange(r)]);
    return computeSummary(r, clients, expenses);
  }, [start, end]);
}

export function useSeries(range: DateRange, bucket: SeriesBucket): SeriesPoint[] | undefined {
  const { start, end } = range;
  return useLiveQuery(async () => {
    const r = { start, end };
    const [settings, clients, expenses] = await Promise.all([
      readSettings(),
      db.clients.where('fecha').between(start, end, true, false).toArray(),
      expensesForRange(r),
    ]);
    return computeSeries(r, bucket, clients, expenses, settings.weekStartsOn);
  }, [start, end, bucket]);
}

export function usePeriodHistory(
  kind: PeriodKind,
  count: number,
  anchor?: Timestamp,
): { period: Period; summary: Summary }[] | undefined {
  const n = Math.max(1, Math.floor(count || 1));
  const anchorKey = anchor ?? null;
  return useLiveQuery(async () => {
    const settings = await readSettings();
    const ws = settings.weekStartsOn;
    const current = getPeriod(kind, anchorKey ?? Date.now(), ws);
    const periods: Period[] = [current];
    for (let i = 1; i < n; i++) periods.push(shiftPeriod(current, -i, ws));
    const oldest = periods[periods.length - 1];
    const full = { start: oldest.start, end: current.end };
    const [clients, expenses] = await Promise.all([clientsForRange(full), expensesForRange(full)]);
    return periods.map((period) => ({ period, summary: computeSummary(period, clients, expenses) }));
  }, [kind, n, anchorKey]);
}

export function useCategoryBreakdown(range: DateRange): CategoryBreakdownRow[] | undefined {
  const { start, end } = range;
  return useLiveQuery(async () => computeCategoryBreakdown({ start, end }, await expensesForRange({ start, end })), [start, end]);
}

export function useServiceBreakdown(range: DateRange): ServiceBreakdownRow[] | undefined {
  const { start, end } = range;
  return useLiveQuery(
    async () =>
      computeServiceBreakdown({ start, end }, await db.clients.where('fecha').between(start, end, true, false).toArray()),
    [start, end],
  );
}

export function useStatusCounts(): Record<RepairStatus, number> | undefined {
  return useLiveQuery(async () => computeStatusCounts(await db.clients.toArray()), []);
}

export function useClientFinancials(clientId: ID): ClientFinancials | undefined {
  return useLiveQuery(async () => {
    if (!clientId) return computeClientFinancials(null, [], []);
    const [client, expenses, movements] = await Promise.all([
      db.clients.get(clientId),
      db.expenses.where('clienteId').equals(clientId).toArray(),
      db.movements.where('clienteId').equals(clientId).toArray(),
    ]);
    return computeClientFinancials(client ?? null, expenses, movements, clientId);
  }, [clientId]);
}

export function useCustomerDirectory(): DirectoryEntry[] | undefined {
  return useLiveQuery(async () => computeCustomerDirectory(await db.clients.toArray()), []);
}

export function useInventoryStats(): InventoryStats | undefined {
  return useLiveQuery(async () => computeInventoryStats(await db.inventory.toArray()), []);
}

/* ---------------------------------- Fotos -------------------------------- */

export function useClientPhotos(clientId: ID | null | undefined): ClientPhoto[] | undefined {
  return useLiveQuery(async () => {
    if (!clientId) return [];
    return db.photos.where('clientId').equals(clientId).sortBy('ts');
  }, [clientId ?? null]);
}

interface UrlEntry {
  url: string;
  refs: number;
  timer: ReturnType<typeof setTimeout> | null;
}
const urlCache = new WeakMap<Blob, UrlEntry>();

function scheduleRevoke(blob: Blob, entry: UrlEntry): void {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    if (entry.refs <= 0) {
      URL.revokeObjectURL(entry.url);
      urlCache.delete(blob);
    }
  }, 1500);
}

function peekURL(blob: Blob): string | null {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  let entry = urlCache.get(blob);
  if (!entry) {
    entry = { url: URL.createObjectURL(blob), refs: 0, timer: null };
    urlCache.set(blob, entry);
    scheduleRevoke(blob, entry);
  }
  return entry.url;
}

/**
 * Object URL para mostrar un Blob (foto o miniatura). Se revoca automáticamente
 * cuando ningún componente lo usa (compatible con StrictMode).
 */
export function usePhotoURL(blob: Blob | null | undefined): string | null {
  const url = useMemo(() => (blob ? peekURL(blob) : null), [blob]);
  useEffect(() => {
    if (!blob || !url) return;
    const entry = urlCache.get(blob);
    if (!entry) return;
    entry.refs += 1;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    return () => {
      entry.refs -= 1;
      if (entry.refs <= 0) scheduleRevoke(blob, entry);
    };
  }, [blob, url]);
  return url;
}

/* ------------------------------- Formato --------------------------------- */

export interface Formatters {
  money(c: number, o?: MoneyFormatOptions): string;
  dateTime(ts: number): string;
  date(ts: number): string;
  time(ts: number): string;
  relative(ts: number): string;
}

/** Formateadores ligados a la moneda/locale actuales; re-renderiza cuando cambian. */
export function useFormatters(): Formatters {
  const settings = useSyncExternalStore(subscribeSettings, getCachedSettings, getCachedSettings);
  const { currency, locale } = settings;
  return useMemo<Formatters>(
    () => ({
      money: (c, o) => formatMoney(c, { currency, locale, ...o }),
      dateTime: (ts) => formatDateTime(ts),
      date: (ts) => formatDate(ts),
      time: (ts) => formatTime(ts),
      relative: (ts) => formatRelative(ts),
    }),
    [currency, locale],
  );
}

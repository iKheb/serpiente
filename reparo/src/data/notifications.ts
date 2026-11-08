/* Motor de notificaciones: evalúa reglas de negocio, deduplica por `dedupeKey`
   y avisa a los oyentes (p. ej. para mostrarlas como notificación del sistema).
   Las alertas ya emitidas se recuerdan en `meta.notifiedKeys`, así que borrar
   una notificación no hace que se repita. */
import { getISOWeek, getISOWeekYear } from 'date-fns';
import type { AppNotification, Client, ID, InventoryItem, NotificationKind, Settings, Timestamp } from './types';
import { db, META_NOTIFIED, readSettings } from './db';
import { newId } from './ids';
import { deviceLabel, saldoCents, warrantyExpiresAt } from './derive';
import { calendarDayDiff, dayKey, formatDate, formatMoney, monthKey, monthLong } from './format';
import { computeSummary } from './reports';
import { dayRange, getPeriod } from './periods';
import { plural } from './util';

export type NotificationRule = 'stock' | 'listo' | 'saldo' | 'garantia' | 'resumen' | 'respaldo' | 'meta';

export const ALL_NOTIFICATION_RULES: readonly NotificationRule[] = [
  'stock',
  'listo',
  'saldo',
  'garantia',
  'resumen',
  'respaldo',
  'meta',
];

export interface NotificationDraft {
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  entityId: ID | null;
  dedupeKey: string;
}

/** Si hay más de este número de alertas nuevas del mismo tipo, se agrupan en una. */
const GROUP_THRESHOLD = 3;
/** Días que se recuerdan las claves emitidas. */
const LEDGER_TTL_DAYS = 120;
const DAY = 86_400_000;

/* ------------------------------- Oyentes --------------------------------- */

type Listener = (n: AppNotification) => void;
const listeners = new Set<Listener>();

/** Registra un oyente que se llama por cada notificación nueva. Devuelve la función para quitarlo. */
export function onNotificationCreated(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function emit(created: AppNotification[]): void {
  for (const n of created) {
    for (const l of [...listeners]) {
      try {
        l(n);
      } catch (err) {
        console.error('[reparo] oyente de notificaciones falló', err);
      }
    }
  }
}

/* ------------------------------- Ledger ---------------------------------- */

type Ledger = Record<string, number>;

async function readLedger(): Promise<Ledger> {
  const row = await db.meta.get(META_NOTIFIED);
  const v = row?.value;
  return v && typeof v === 'object' ? { ...(v as Ledger) } : {};
}

/** Marca claves como ya notificadas (sin crear notificación). Útil para datos importados o demo. */
export async function markNotificationKeysSeen(keys: readonly string[], ts: Timestamp = Date.now()): Promise<void> {
  if (!keys.length) return;
  await db.transaction('rw', db.meta, async () => {
    const ledger = await readLedger();
    for (const k of keys) ledger[k] = ts;
    await db.meta.put({ key: META_NOTIFIED, value: ledger });
  });
}

/* ------------------------------- Reglas ---------------------------------- */

interface RuleContext {
  now: Timestamp;
  settings: Settings;
  clients: Client[];
  items: InventoryItem[];
}

/** Desde cuándo está "listo" el equipo (según el registro de actividad; si no, su última edición). */
async function readySince(c: Client): Promise<Timestamp> {
  const entries = await db.audit.where('entityId').equals(c.id).toArray();
  let best = 0;
  for (const e of entries) {
    if (e.entity !== 'cliente' || e.ts <= best) continue;
    const toListo = e.changes?.some((ch) => ch.field === 'estado' && ch.to === 'listo');
    if (toListo || (e.action === 'crear' && c.estado === 'listo' && best === 0)) best = e.ts;
  }
  return best || c.updatedAt;
}

function stockRule(ctx: RuleContext): { drafts: NotificationDraft[]; resolvedPrefixes: string[] } {
  const drafts: NotificationDraft[] = [];
  const resolvedPrefixes: string[] = [];
  for (const i of ctx.items) {
    if (i.deletedAt != null) continue;
    if (i.stock > i.stockMinimo) {
      resolvedPrefixes.push(`stock:${i.id}:`);
      continue;
    }
    if (i.pedidoAt != null) continue; // ya se pidió al proveedor
    const agotado = i.stock <= 0;
    drafts.push({
      kind: 'stock_bajo',
      title: agotado ? `Se agotó: ${i.nombre}` : `Stock bajo: ${i.nombre}`,
      body: agotado
        ? 'No quedan unidades. Pídelo al proveedor para no frenar reparaciones.'
        : `Quedan ${plural(i.stock, 'unidad', 'unidades')} (mínimo ${i.stockMinimo}). Conviene reponerlo pronto.`,
      href: `#/inventario/${i.id}`,
      entityId: i.id,
      dedupeKey: `stock:${i.id}:${i.stock}`,
    });
  }
  return { drafts, resolvedPrefixes };
}

async function readyRule(ctx: RuleContext): Promise<NotificationDraft[]> {
  const days = Math.max(1, ctx.settings.readyPickupDays || 3);
  const out: NotificationDraft[] = [];
  for (const c of ctx.clients) {
    if (c.deletedAt != null || c.estado !== 'listo') continue;
    const since = await readySince(c);
    const elapsed = calendarDayDiff(ctx.now, since);
    if (elapsed < days) continue;
    const device = deviceLabel(c) || 'equipo';
    out.push({
      kind: 'listo_sin_entregar',
      title: 'Equipo listo sin entregar',
      body: `El ${device} de ${c.nombre} está listo desde hace ${plural(elapsed, 'día', 'días')}. Avísale que puede pasar por él.`,
      href: `#/clientes/${c.id}`,
      entityId: c.id,
      dedupeKey: `listo:${c.id}`,
    });
  }
  return out;
}

function balanceRule(ctx: RuleContext): { drafts: NotificationDraft[]; resolvedPrefixes: string[] } {
  const drafts: NotificationDraft[] = [];
  const resolvedPrefixes: string[] = [];
  for (const c of ctx.clients) {
    if (c.deletedAt != null || c.estado !== 'entregado') continue;
    const saldo = saldoCents(c);
    if (saldo <= 0) {
      resolvedPrefixes.push(`saldo:${c.id}`);
      continue;
    }
    const device = deviceLabel(c) || 'equipo';
    drafts.push({
      kind: 'pago_pendiente',
      title: `Saldo pendiente de ${c.nombre}`,
      body: `Se entregó el ${device} con ${formatMoney(saldo)} por cobrar.`,
      href: `#/clientes/${c.id}`,
      entityId: c.id,
      dedupeKey: `saldo:${c.id}`,
    });
  }
  return { drafts, resolvedPrefixes };
}

function warrantyRule(ctx: RuleContext): NotificationDraft[] {
  const out: NotificationDraft[] = [];
  for (const c of ctx.clients) {
    if (c.deletedAt != null || c.estado !== 'entregado') continue;
    const expires = warrantyExpiresAt(c);
    if (expires == null || expires <= ctx.now) continue;
    const daysLeft = calendarDayDiff(expires, ctx.now);
    if (daysLeft > 3) continue;
    const when = daysLeft <= 0 ? 'hoy' : daysLeft === 1 ? 'mañana' : `en ${daysLeft} días`;
    const device = deviceLabel(c) || 'equipo';
    out.push({
      kind: 'garantia',
      title: 'Garantía por vencer',
      body: `La garantía del ${device} de ${c.nombre} vence ${when} (${formatDate(expires)}).`,
      href: `#/clientes/${c.id}`,
      entityId: c.id,
      dedupeKey: `garantia:${c.id}`,
    });
  }
  return out;
}

async function dailySummaryRule(ctx: RuleContext): Promise<NotificationDraft[]> {
  const hour = Math.min(23, Math.max(0, ctx.settings.dailySummaryHour ?? 20));
  if (new Date(ctx.now).getHours() < hour) return [];
  const range = dayRange(ctx.now);
  const expenses = await db.expenses.where('fecha').between(range.start, range.end, true, false).toArray();
  const dayClients = ctx.clients.filter((c) => c.fecha >= range.start && c.fecha < range.end);
  const s = computeSummary(range, dayClients, expenses);
  if (s.servicios === 0 && s.gastadoCents === 0 && s.cobradoCents === 0) return [];
  const balance =
    s.gananciaCents >= 0 ? `ganaste ${formatMoney(s.gananciaCents)}` : `el balance quedó en ${formatMoney(s.gananciaCents)}`;
  return [
    {
      kind: 'resumen',
      title: 'Resumen del día',
      body: `Cobraste ${formatMoney(s.cobradoCents)}, gastaste ${formatMoney(s.gastadoCents)} y ${balance} con ${plural(s.servicios, 'servicio', 'servicios')}.`,
      href: '#/reportes?periodo=week',
      entityId: null,
      dedupeKey: `resumen:${dayKey(ctx.now)}`,
    },
  ];
}

async function backupRule(ctx: RuleContext): Promise<NotificationDraft[]> {
  if (!ctx.clients.length && !(await db.expenses.count()) && !ctx.items.length) return [];
  let reference = ctx.settings.lastBackupAt;
  if (reference == null) {
    // Sin respaldo previo: contamos desde el primer registro capturado.
    let first = Infinity;
    for (const c of ctx.clients) first = Math.min(first, c.createdAt);
    for (const i of ctx.items) first = Math.min(first, i.createdAt);
    if (!Number.isFinite(first)) first = ctx.now;
    reference = first;
  }
  if (ctx.now - reference < 7 * DAY) return [];
  const d = new Date(ctx.now);
  const week = `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`;
  const daysAgo = Math.floor((ctx.now - reference) / DAY);
  return [
    {
      kind: 'respaldo',
      title: 'Haz una copia de seguridad',
      body:
        ctx.settings.lastBackupAt == null
          ? 'Aún no has guardado ninguna copia de tus datos. Descárgala desde Ajustes; toma un segundo.'
          : `Tu último respaldo fue hace ${plural(daysAgo, 'día', 'días')}. Descarga uno nuevo desde Ajustes.`,
      href: '#/ajustes',
      entityId: null,
      dedupeKey: `respaldo:${week}`,
    },
  ];
}

async function goalRule(ctx: RuleContext): Promise<NotificationDraft[]> {
  const goal = ctx.settings.monthlyGoalCents || 0;
  if (goal <= 0) return [];
  const month = getPeriod('month', ctx.now);
  const expenses = await db.expenses.where('fecha').between(month.start, month.end, true, false).toArray();
  const s = computeSummary(month, ctx.clients, expenses);
  if (s.gananciaCents < goal) return [];
  return [
    {
      kind: 'meta',
      title: '¡Meta del mes alcanzada!',
      body: `Llevas ${formatMoney(s.gananciaCents)} de ganancia en ${monthLong(new Date(month.start).getMonth())}; tu meta era ${formatMoney(goal)}.`,
      href: '#/reportes?periodo=month',
      entityId: null,
      dedupeKey: `meta:${monthKey(ctx.now)}`,
    },
  ];
}

function hashKeys(keys: string[]): string {
  let h = 5381;
  for (const ch of keys.slice().sort().join('|')) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

/** Agrupa alertas del mismo tipo cuando son muchas a la vez (p. ej. tras importar un respaldo). */
function groupDrafts(kind: NotificationKind, drafts: NotificationDraft[], now: Timestamp, clients: Map<ID, Client>): NotificationDraft[] {
  if (drafts.length <= GROUP_THRESHOLD) return drafts;
  const n = drafts.length;
  const names = drafts
    .map((d) => (d.entityId ? clients.get(d.entityId)?.nombre : null) ?? null)
    .filter((x): x is string => !!x);
  const list = (items: string[]) =>
    items.length > 2 ? `${items.slice(0, 2).join(', ')} y ${items.length - 2} más` : items.join(' y ');
  const key = `${kind}:grupo:${dayKey(now)}:${hashKeys(drafts.map((d) => d.dedupeKey))}`;
  switch (kind) {
    case 'stock_bajo': {
      const titles = drafts.map((d) => d.title.replace(/^(Se agotó|Stock bajo): /, ''));
      return [
        {
          kind,
          title: `${n} repuestos por pedir`,
          body: `${list(titles)} llegaron al mínimo.`,
          href: '#/inventario?filtro=pedir',
          entityId: null,
          dedupeKey: key,
        },
      ];
    }
    case 'listo_sin_entregar':
      return [
        {
          kind,
          title: `${n} equipos listos sin entregar`,
          body: `${list(names)} todavía no pasan por su equipo.`,
          href: '#/clientes',
          entityId: null,
          dedupeKey: key,
        },
      ];
    case 'pago_pendiente': {
      let total = 0;
      for (const d of drafts) {
        const c = d.entityId ? clients.get(d.entityId) : null;
        if (c) total += saldoCents(c);
      }
      return [
        {
          kind,
          title: `${n} servicios entregados con saldo`,
          body: `Suman ${formatMoney(total)} por cobrar (${list(names)}).`,
          href: '#/clientes',
          entityId: null,
          dedupeKey: key,
        },
      ];
    }
    case 'garantia':
      return [
        {
          kind,
          title: `${n} garantías por vencer`,
          body: `Vencen en los próximos 3 días: ${list(names)}.`,
          href: '#/clientes',
          entityId: null,
          dedupeKey: key,
        },
      ];
    default:
      return drafts;
  }
}

interface EvaluateResult {
  /** Alertas candidatas (sin deduplicar). */
  drafts: NotificationDraft[];
  /** Prefijos de claves cuyo problema ya se resolvió (se olvidan para poder volver a avisar). */
  resolvedPrefixes: string[];
}

async function evaluate(now: Timestamp, settings: Settings, rules: readonly NotificationRule[]): Promise<EvaluateResult> {
  const [clients, items] = await Promise.all([db.clients.toArray(), db.inventory.toArray()]);
  const ctx: RuleContext = { now, settings, clients, items };
  const drafts: NotificationDraft[] = [];
  const resolvedPrefixes: string[] = [];
  const want = new Set(rules);

  if (want.has('stock') && settings.notifyLowStock) {
    const r = stockRule(ctx);
    drafts.push(...r.drafts);
    resolvedPrefixes.push(...r.resolvedPrefixes);
  }
  if (want.has('listo') && settings.notifyReadyPickup) drafts.push(...(await readyRule(ctx)));
  if (want.has('saldo') && settings.notifyPendingPayment) {
    const r = balanceRule(ctx);
    drafts.push(...r.drafts);
    resolvedPrefixes.push(...r.resolvedPrefixes);
  }
  if (want.has('garantia')) drafts.push(...warrantyRule(ctx));
  if (want.has('resumen') && settings.notifyDailySummary) drafts.push(...(await dailySummaryRule(ctx)));
  if (want.has('respaldo') && settings.notifyBackupReminder) drafts.push(...(await backupRule(ctx)));
  if (want.has('meta')) drafts.push(...(await goalRule(ctx)));
  return { drafts, resolvedPrefixes };
}

/**
 * Alertas que se emitirían ahora mismo (sin deduplicar ni guardar). Útil para
 * vistas previas y para la carga de datos demo.
 */
export async function previewNotificationDrafts(
  now: Timestamp = Date.now(),
  rules: readonly NotificationRule[] = ALL_NOTIFICATION_RULES,
): Promise<NotificationDraft[]> {
  const settings = await readSettings();
  return (await evaluate(now, settings, rules)).drafts;
}

/** Evalúa las reglas indicadas y crea las notificaciones nuevas (deduplicadas). */
export async function runChecks(
  now: Timestamp = Date.now(),
  rules: readonly NotificationRule[] = ALL_NOTIFICATION_RULES,
): Promise<AppNotification[]> {
  const settings = await readSettings();
  if (!settings.notificationsEnabled) return [];
  const { drafts, resolvedPrefixes } = await evaluate(now, settings, rules);

  const created = await db.transaction('rw', [db.notifications, db.meta, db.clients], async () => {
    const ledger = await readLedger();
    let ledgerChanged = false;

    for (const prefix of resolvedPrefixes) {
      for (const k of Object.keys(ledger)) {
        if (k === prefix || k.startsWith(prefix)) {
          delete ledger[k];
          ledgerChanged = true;
        }
      }
    }
    const cutoff = now - LEDGER_TTL_DAYS * DAY;
    for (const [k, ts] of Object.entries(ledger)) {
      if (ts < cutoff) {
        delete ledger[k];
        ledgerChanged = true;
      }
    }

    const fresh: NotificationDraft[] = [];
    for (const d of drafts) {
      if (ledger[d.dedupeKey] != null) continue;
      if ((await db.notifications.where('dedupeKey').equals(d.dedupeKey).count()) > 0) {
        ledger[d.dedupeKey] = now;
        ledgerChanged = true;
        continue;
      }
      fresh.push(d);
    }

    // Agrupar por tipo cuando llegan demasiadas a la vez.
    const byKind = new Map<NotificationKind, NotificationDraft[]>();
    for (const d of fresh) {
      const list = byKind.get(d.kind) ?? [];
      list.push(d);
      byKind.set(d.kind, list);
    }
    const needsClients = [...byKind.values()].some((l) => l.length > GROUP_THRESHOLD);
    const clientMap = new Map<ID, Client>();
    if (needsClients) (await db.clients.toArray()).forEach((c) => clientMap.set(c.id, c));

    const out: AppNotification[] = [];
    for (const [kind, list] of byKind) {
      const finalDrafts = groupDrafts(kind, list, now, clientMap);
      // Todas las claves individuales quedan registradas aunque se hayan agrupado.
      for (const d of list) ledger[d.dedupeKey] = now;
      for (const d of finalDrafts) {
        ledger[d.dedupeKey] = now;
        const n: AppNotification = { id: newId(), ts: now, readAt: null, ...d };
        await db.notifications.add(n);
        out.push(n);
      }
      ledgerChanged = true;
    }
    if (ledgerChanged) await db.meta.put({ key: META_NOTIFIED, value: ledger });
    return out;
  });

  emit(created);
  return created;
}

/** Evalúa todas las reglas y crea las notificaciones nuevas (con deduplicación). */
export function runNotificationChecks(now: Timestamp = Date.now()): Promise<AppNotification[]> {
  return runChecks(now, ALL_NOTIFICATION_RULES);
}

/**
 * Crea una notificación directa (p. ej. 'sistema'). Si se pasa `dedupeKey` y ya
 * se emitió antes, no se repite. Devuelve null si estaba deduplicada o desactivada.
 */
export async function addNotification(
  d: Omit<NotificationDraft, 'dedupeKey' | 'entityId' | 'href'> & { dedupeKey?: string; entityId?: ID | null; href?: string },
): Promise<AppNotification | null> {
  const settings = await readSettings();
  if (!settings.notificationsEnabled) return null;
  const now = Date.now();
  const n: AppNotification = {
    id: newId(),
    ts: now,
    readAt: null,
    kind: d.kind,
    title: d.title,
    body: d.body,
    href: d.href ?? '',
    entityId: d.entityId ?? null,
    dedupeKey: d.dedupeKey ?? `${d.kind}:${now}:${newId().slice(0, 8)}`,
  };
  const created = await db.transaction('rw', [db.notifications, db.meta], async () => {
    const ledger = await readLedger();
    if (d.dedupeKey && ledger[d.dedupeKey] != null) return null;
    ledger[n.dedupeKey] = now;
    await db.meta.put({ key: META_NOTIFIED, value: ledger });
    await db.notifications.add(n);
    return n;
  });
  if (created) emit([created]);
  return created;
}

/* ------------------------- Bandeja (sin auditoría) ----------------------- */

export async function markNotificationRead(id: ID): Promise<void> {
  await db.notifications.where('id').equals(id).modify((n) => {
    if (n.readAt == null) n.readAt = Date.now();
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  const now = Date.now();
  await db.notifications.filter((n) => n.readAt == null).modify({ readAt: now });
}

export async function deleteNotification(id: ID): Promise<void> {
  await db.notifications.delete(id);
}

export async function clearNotifications(): Promise<void> {
  await db.notifications.clear();
}

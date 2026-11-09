/* Registro de actividad: diff campo por campo, textos formateados y enmascarado
   de datos sensibles (patrón / PIN / contraseña nunca se guardan en claro). */
import type {
  AuditAction,
  AuditEntry,
  Client,
  EntityType,
  Expense,
  FieldChange,
  ID,
  InventoryItem,
  Settings,
  UnlockType,
} from './types';
import { EXPENSE_CATEGORY_LABEL, PAYMENT_METHOD_LABEL, PHOTO_KIND_LABEL, REPAIR_STATUS_LABEL } from './types';
import { db, getDeviceId } from './db';
import { newId } from './ids';
import { formatDateTime, formatMoney } from './format';
import { plural } from './util';
import { FIELD_LABELS, PHOTO_FIELD_LABELS, SETTINGS_FIELD_LABELS, THEME_LABEL, UNLOCK_TYPE_LABEL } from './labels';

/** Campos de metadatos que nunca se auditan. */
const IGNORED_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'rev', 'deviceId', 'deletedAt']);

const DATE_FIELDS = new Set(['fecha', 'fechaEntrega', 'pedidoAt', 'lastSyncAt', 'lastBackupAt', 'ts']);

export type AuditDomain = 'cliente' | 'gasto' | 'inventario' | 'ajustes' | 'foto';

/** Nombres para resolver referencias (clienteId → nombre, inventarioId → artículo). */
export interface NameLookup {
  clients?: Map<ID, string>;
  items?: Map<ID, string>;
}

export const EMPTY_TEXT = '—';

function labelFor(domain: AuditDomain, field: string): string {
  if (domain === 'ajustes') return (SETTINGS_FIELD_LABELS as Record<string, string>)[field] ?? field;
  if (domain === 'foto') return PHOTO_FIELD_LABELS[field] ?? field;
  return FIELD_LABELS[domain][field] ?? field;
}


/** Texto enmascarado para un campo de desbloqueo. */
function maskUnlockValue(field: string, value: unknown, tipo: UnlockType | undefined): string {
  if (field === 'desbloqueoPatron') {
    return Array.isArray(value) && value.length ? 'Patrón guardado' : EMPTY_TEXT;
  }
  if (typeof value !== 'string' || !value) return EMPTY_TEXT;
  return tipo === 'contrasena' ? 'Contraseña ••••••' : 'PIN ••••';
}

/** Formatea un valor para mostrarlo en el registro de actividad. */
export function formatFieldValue(domain: AuditDomain, field: string, value: unknown, names: NameLookup = {}): string {
  if (value === null || value === undefined || value === '') return EMPTY_TEXT;
  if (Array.isArray(value) && value.length === 0) return EMPTY_TEXT;
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';

  if (field.endsWith('Cents') && typeof value === 'number') return formatMoney(value);
  if (DATE_FIELDS.has(field) && typeof value === 'number') return formatDateTime(value);

  switch (field) {
    case 'estado':
      return REPAIR_STATUS_LABEL[value as keyof typeof REPAIR_STATUS_LABEL] ?? String(value);
    case 'metodoPago':
      return PAYMENT_METHOD_LABEL[value as keyof typeof PAYMENT_METHOD_LABEL] ?? String(value);
    case 'categoria':
      return EXPENSE_CATEGORY_LABEL[value as keyof typeof EXPENSE_CATEGORY_LABEL] ?? String(value);
    case 'desbloqueoTipo':
      return UNLOCK_TYPE_LABEL[value as UnlockType] ?? String(value);
    case 'kind':
      return PHOTO_KIND_LABEL[value as keyof typeof PHOTO_KIND_LABEL] ?? String(value);
    case 'theme':
      return THEME_LABEL[value as keyof typeof THEME_LABEL] ?? String(value);
    case 'weekStartsOn':
      return value === 0 ? 'Domingo' : 'Lunes';
    case 'garantiaDias':
      return value === 0 ? 'Sin garantía' : plural(Number(value), 'día', 'días');
    case 'readyPickupDays':
      return plural(Number(value), 'día', 'días');
    case 'dailySummaryHour':
      return `${String(value).padStart(2, '0')}:00`;
    case 'numFotos':
      return value === 0 ? 'Sin fotos' : plural(Number(value), 'foto', 'fotos');
    case 'clienteId':
      return names.clients?.get(String(value)) ?? 'Cliente eliminado';
    case 'inventarioId':
      return names.items?.get(String(value)) ?? 'Artículo eliminado';
    case 'phoneCountryCode':
      return '+' + String(value);
  }

  if (typeof value === 'number') return String(value);
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > 280 ? text.slice(0, 279) + '…' : text;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if ((a === null || a === undefined || a === '') && (b === null || b === undefined || b === '')) return true;
  if (Array.isArray(a) || Array.isArray(b) || (typeof a === 'object' && a && typeof b === 'object' && b)) {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }
  return false;
}

/**
 * Cambios campo por campo entre `before` y `after`. Con `before = null` se
 * listan los campos con valor inicial (alta). Ignora metadatos y enmascara el
 * desbloqueo (tanto `from`/`to` como los textos).
 */
export function diffFields(
  domain: AuditDomain,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  names: NameLookup = {},
  opts: { ignore?: readonly string[] } = {},
): FieldChange[] {
  const ignore = new Set([...IGNORED_FIELDS, ...(opts.ignore ?? [])]);
  const keys: string[] = [];
  const seen = new Set<string>();
  const order = domain === 'ajustes' ? Object.keys(SETTINGS_FIELD_LABELS) : domain === 'foto' ? Object.keys(PHOTO_FIELD_LABELS) : Object.keys(FIELD_LABELS[domain]);
  for (const k of [...order, ...Object.keys(before ?? {}), ...Object.keys(after ?? {})]) {
    if (seen.has(k) || ignore.has(k)) continue;
    seen.add(k);
    keys.push(k);
  }

  const changes: FieldChange[] = [];
  for (const field of keys) {
    const from = before ? before[field] : undefined;
    const to = after ? after[field] : undefined;
    if (before && sameValue(from, to)) continue;
    if (!before && (to === undefined || to === null || to === '' || (Array.isArray(to) && to.length === 0))) continue;
    if (!before && (field === 'numFotos' || field === 'folio') && !to) continue;
    // En un alta no mostramos valores "por defecto" que no aportan (Sin bloqueo, No).
    if (!before && (to === false || (field === 'desbloqueoTipo' && to === 'ninguno'))) continue;

    if (field === 'desbloqueoPatron' || field === 'desbloqueoCodigo') {
      const tipoBefore = (before?.desbloqueoTipo as UnlockType | undefined) ?? undefined;
      const tipoAfter = (after?.desbloqueoTipo as UnlockType | undefined) ?? undefined;
      const fromText = before ? maskUnlockValue(field, from, tipoBefore) : EMPTY_TEXT;
      let toText = maskUnlockValue(field, to, tipoAfter);
      if (before && toText !== EMPTY_TEXT) {
        toText = field === 'desbloqueoPatron' ? 'Patrón actualizado' : toText;
      }
      changes.push({ field, label: labelFor(domain, field), from: fromText, to: toText, fromText, toText });
      continue;
    }

    changes.push({
      field,
      label: labelFor(domain, field),
      from: from === undefined ? null : from,
      to: to === undefined ? null : to,
      fromText: before ? formatFieldValue(domain, field, from, names) : EMPTY_TEXT,
      toText: formatFieldValue(domain, field, to, names),
    });
  }
  return changes;
}

/** Copia del cliente apta para la auditoría (sin patrón ni código en claro). */
export function sanitizeClient<T extends Partial<Client>>(c: T): T {
  const copy = { ...c };
  if ('desbloqueoPatron' in copy) (copy as Partial<Client>).desbloqueoPatron = [];
  if ('desbloqueoCodigo' in copy) (copy as Partial<Client>).desbloqueoCodigo = copy.desbloqueoCodigo ? '••••' : '';
  return copy;
}

/* ------------------------------- Títulos --------------------------------- */

export function expenseTitle(e: Pick<Expense, 'concepto'>): string {
  return e.concepto?.trim() || 'Gasto sin concepto';
}

export function inventoryTitle(i: Pick<InventoryItem, 'nombre'>): string {
  return i.nombre?.trim() || 'Artículo sin nombre';
}

/* ------------------------------- Resúmenes ------------------------------- */

/** Resumen natural de una edición de cliente. */
export function summarizeClientEdit(changes: FieldChange[], after: Client): string {
  const fields = changes.map((c) => c.field);
  const estado = changes.find((c) => c.field === 'estado');
  const pago = changes.find((c) => c.field === 'pagadoCents');
  const others = changes.filter((c) => c.field !== 'estado' && c.field !== 'fechaEntrega');
  if (estado) {
    const label = REPAIR_STATUS_LABEL[after.estado];
    if (after.estado === 'entregado' && pago && Number(pago.to) > Number(pago.from) && others.length === 1) {
      return `Entregó el equipo y cobró ${formatMoney(Number(pago.to) - Number(pago.from))}`;
    }
    const extra = others.length;
    if (extra === 0) return `Cambió el estado a ${label}`;
    return `Cambió el estado a ${label} y editó ${plural(extra, 'campo más', 'campos más')}`;
  }
  if (pago && fields.length === 1) {
    const from = Number(pago.from) || 0;
    const to = Number(pago.to) || 0;
    if (to > from) {
      if (to >= after.cobroCents && after.cobroCents > 0) return `Registró el pago completo (${formatMoney(to - from)})`;
      return `Registró un abono de ${formatMoney(to - from)}`;
    }
    return `Corrigió lo abonado a ${formatMoney(to)}`;
  }
  if (fields.length === 1 && (fields[0] === 'desbloqueoPatron' || fields[0] === 'desbloqueoCodigo' || fields[0] === 'desbloqueoTipo')) {
    return 'Actualizó los datos de desbloqueo';
  }
  return `Editó ${plural(changes.length, 'campo', 'campos')}`;
}

export function summarizeGenericEdit(changes: FieldChange[]): string {
  return `Editó ${plural(changes.length, 'campo', 'campos')}`;
}

export const SUMMARY = {
  crearCliente: 'Registró un nuevo cliente',
  crearGasto: 'Registró un gasto',
  crearInventario: 'Agregó un artículo al inventario',
  eliminar: 'Envió a la papelera',
  restaurar: 'Restauró desde la papelera',
  purgar: 'Eliminó definitivamente',
  ajustes: 'Actualizó los ajustes',
  pedido: 'Marcó como pedido al proveedor',
  quitarPedido: 'Quitó la marca de pedido',
  reorden: 'Marcó para volver a pedir',
  quitarReorden: 'Quitó la marca para volver a pedir',
} as const;

export function summarizeUse(cantidad: number, clientName: string | null): string {
  const base = `Usó ${plural(cantidad, 'pieza', 'piezas')}`;
  return clientName ? `${base} en el servicio de ${clientName}` : base;
}

export function summarizeRestock(cantidad: number): string {
  return `Repuso ${plural(cantidad, 'unidad', 'unidades')}`;
}

export function summarizeAdjust(from: number, to: number): string {
  if (from === to) return `Confirmó el conteo de stock en ${to}`;
  return `Ajustó el stock de ${from} a ${to}`;
}

export function summarizeWaste(cantidad: number): string {
  return `Registró ${plural(cantidad, 'pieza', 'piezas')} como merma`;
}

export function summarizePhotosAdded(n: number): string {
  return `Agregó ${plural(n, 'foto', 'fotos')} de evidencia`;
}

export function summarizePhotosRemoved(n: number): string {
  return `Eliminó ${plural(n, 'foto', 'fotos')} de evidencia`;
}

export function stockChange(from: number, to: number): FieldChange {
  return { field: 'stock', label: 'Stock', from, to, fromText: String(from), toText: String(to) };
}

/* ------------------------------ Escritura -------------------------------- */

export interface AuditDraft {
  action: AuditAction;
  entity: EntityType;
  entityId: ID | null;
  title: string;
  summary: string;
  changes?: FieldChange[];
  snapshot?: AuditEntry['snapshot'];
  ts?: number;
}

/** Construye la entrada (sin escribirla). */
export function buildAuditEntry(d: AuditDraft): AuditEntry {
  return {
    id: newId(),
    ts: d.ts ?? Date.now(),
    action: d.action,
    entity: d.entity,
    entityId: d.entityId,
    title: d.title,
    summary: d.summary,
    changes: d.changes ?? [],
    snapshot: d.snapshot ?? null,
    deviceId: getDeviceId(),
  };
}

/** Escribe la entrada. Llamar DENTRO de la transacción de la mutación (incluyendo `db.audit`). */
export async function writeAudit(d: AuditDraft): Promise<AuditEntry> {
  const entry = buildAuditEntry(d);
  await db.audit.add(entry);
  return entry;
}

/** Diff de ajustes, excluyendo campos técnicos o de preferencia del dispositivo. */
export const SETTINGS_UNAUDITED: readonly (keyof Settings)[] = ['lastSyncAt', 'lastBackupAt', 'pushSubscribed', 'theme'];

/* Respaldo (JSON versionado), CSV, borrado total y almacenamiento persistente. */
import { z } from 'zod';
import type {
  AppNotification,
  AuditEntry,
  Client,
  ClientPhoto,
  Expense,
  InventoryItem,
  InventoryMovement,
  Settings,
} from './types';
import {
  EXPENSE_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  REPAIR_STATUS_LABEL,
} from './types';
import { db, dbReady, getDeviceId, META_DEVICE_ID, META_FOLIO_SEQ, recomputeFolioSequence, type MetaRow } from './db';
import { defaultSettings, withSettingsDefaults } from './defaults';
import { BackupError } from './errors';
import { writeAudit } from './audit';
import { formatIsoLocal } from './format';
import { paymentStatus, saldoCents, stockStatus, clientTitle } from './derive';
import { AUDIT_ACTION_LABEL, ENTITY_LABEL, MOVEMENT_TYPE_LABEL, STOCK_STATUS_LABEL } from './labels';
import { setCachedSettings } from './settings-cache';
import { plural } from './util';

export const BACKUP_SCHEMA = 1;

type SerializedPhoto = Omit<ClientPhoto, 'blob' | 'thumb'> & { blob: string; thumb: string };

export interface BackupFile {
  app: 'reparo';
  schema: number;
  exportedAt: number;
  deviceId: string;
  tables: {
    clients: Client[];
    expenses: Expense[];
    inventory: InventoryItem[];
    movements: InventoryMovement[];
    audit: AuditEntry[];
    notifications: AppNotification[];
    settings: Settings[];
    meta: MetaRow[];
    photos: SerializedPhoto[];
  };
}

/* ------------------------------ Base64 / Blob ----------------------------- */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + '=';
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2]) : 0;
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3]) : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < len) out[o++] = (n >> 16) & 255;
    if (o < len && i + 2 < clean.length) out[o++] = (n >> 8) & 255;
    if (o < len && i + 3 < clean.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Uint8Array(
    await new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(blob);
    }),
  );
}

export async function blobToDataURL(blob: Blob): Promise<string> {
  const bytes = await blobBytes(blob);
  return `data:${blob.type || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`;
}

export function dataURLToBlob(dataUrl: string): Blob {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) throw new BackupError('Una foto del respaldo está dañada');
  const type = m[1] || 'application/octet-stream';
  const bytes = m[2] ? base64ToBytes(m[3]) : new TextEncoder().encode(decodeURIComponent(m[3]));
  return new Blob([bytes as BlobPart], { type });
}

async function blobText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new TextDecoder().decode(await blobBytes(file));
}

/* --------------------------------- Exportar ------------------------------ */

const ALL_TABLES = () =>
  [db.clients, db.expenses, db.inventory, db.movements, db.audit, db.notifications, db.settings, db.meta, db.photos] as const;

/** Lee todas las tablas y arma el objeto de respaldo (sin escribir nada). */
export async function buildBackup(): Promise<BackupFile> {
  await dbReady();
  const data = await db.transaction('r', [...ALL_TABLES()], async () => ({
    clients: await db.clients.toArray(),
    expenses: await db.expenses.toArray(),
    inventory: await db.inventory.toArray(),
    movements: await db.movements.toArray(),
    audit: await db.audit.toArray(),
    notifications: await db.notifications.toArray(),
    settings: await db.settings.toArray(),
    meta: (await db.meta.toArray()).filter((m) => m.key !== META_DEVICE_ID),
    photos: await db.photos.toArray(),
  }));
  const photos: SerializedPhoto[] = [];
  for (const p of data.photos) {
    photos.push({ ...p, blob: await blobToDataURL(p.blob), thumb: await blobToDataURL(p.thumb) });
  }
  return {
    app: 'reparo',
    schema: BACKUP_SCHEMA,
    exportedAt: Date.now(),
    deviceId: getDeviceId(),
    tables: { ...data, photos },
  };
}

/** Exporta todo como JSON versionado. Audita 'exportar' y actualiza lastBackupAt. */
export async function exportBackup(): Promise<Blob> {
  const backup = await buildBackup();
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const now = Date.now();
  const t = backup.tables;
  const saved = await db.transaction('rw', [db.settings, db.audit], async () => {
    const s = withSettingsDefaults((await db.settings.get('settings')) ?? defaultSettings());
    const next: Settings = { ...s, lastBackupAt: now, updatedAt: s.updatedAt };
    await db.settings.put(next);
    await writeAudit({
      action: 'exportar',
      entity: 'sistema',
      entityId: null,
      title: 'Copia de seguridad',
      summary: `Exportó una copia de seguridad (${plural(t.clients.length, 'cliente', 'clientes')}, ${plural(t.expenses.length, 'gasto', 'gastos')}, ${plural(t.inventory.length, 'artículo', 'artículos')})`,
      changes: [],
      snapshot: null,
      ts: now,
    });
    return next;
  });
  setCachedSettings(saved);
  return blob;
}

/* --------------------------------- Importar ------------------------------ */

const num = z.number();
const str = z.string();
const nullableNum = z.number().nullable();
const base = {
  id: str.min(1),
  createdAt: num,
  updatedAt: num,
  deletedAt: nullableNum.optional().default(null),
  deviceId: str.optional().default(''),
  rev: num.optional().default(1),
};

const clientSchema = z.looseObject({
  ...base,
  folio: num.optional().default(0),
  nombre: str,
  telefono: str.optional().default(''),
  email: str.optional().default(''),
  marca: str.optional().default(''),
  modelo: str.optional().default(''),
  imei: str.optional().default(''),
  servicio: str.optional().default(''),
  falla: str.optional().default(''),
  estado: z.enum(['recibido', 'diagnostico', 'reparando', 'listo', 'entregado', 'cancelado']),
  cobroCents: num,
  pagadoCents: num,
  metodoPago: z.enum(['efectivo', 'transferencia', 'tarjeta', 'otro']).catch('otro'),
  fecha: num,
  fechaEntrega: nullableNum.optional().default(null),
  garantiaDias: num.optional().default(0),
  desbloqueoTipo: z.enum(['ninguno', 'patron', 'pin', 'contrasena']).optional().default('ninguno'),
  desbloqueoPatron: z.array(num).optional().default([]),
  desbloqueoCodigo: str.optional().default(''),
  numFotos: num.optional().default(0),
  notas: str.optional().default(''),
});

const categoryEnum = z
  .enum(['pantallas', 'baterias', 'puertos', 'camaras', 'placas', 'carcasas', 'herramientas', 'accesorios', 'otros'])
  .catch('otros');

const expenseSchema = z.looseObject({
  ...base,
  concepto: str,
  categoria: categoryEnum,
  proveedor: str.optional().default(''),
  cantidad: num,
  costoUnitarioCents: num,
  totalCents: num,
  clienteId: str.nullable().optional().default(null),
  inventarioId: str.nullable().optional().default(null),
  metodoPago: z.enum(['efectivo', 'transferencia', 'tarjeta', 'otro']).catch('otro'),
  fecha: num,
  notas: str.optional().default(''),
});

const inventorySchema = z.looseObject({
  ...base,
  nombre: str,
  categoria: categoryEnum,
  marca: str.optional().default(''),
  modelo: str.optional().default(''),
  sku: str.optional().default(''),
  proveedor: str.optional().default(''),
  stock: num,
  stockMinimo: num.optional().default(0),
  cantidadPedido: num.optional().default(0),
  costoUnitarioCents: num.optional().default(0),
  precioVentaCents: num.optional().default(0),
  ubicacion: str.optional().default(''),
  marcadoReorden: z.boolean().optional().default(false),
  pedidoAt: nullableNum.optional().default(null),
  notas: str.optional().default(''),
});

const movementSchema = z.looseObject({
  id: str.min(1),
  itemId: str,
  type: z.enum(['entrada', 'uso', 'ajuste', 'merma']),
  cantidad: num,
  stockAntes: num,
  stockDespues: num,
  costoUnitarioCents: num.optional().default(0),
  clienteId: str.nullable().optional().default(null),
  gastoId: str.nullable().optional().default(null),
  nota: str.optional().default(''),
  ts: num,
  deviceId: str.optional().default(''),
});

const auditSchema = z.looseObject({
  id: str.min(1),
  ts: num,
  action: str,
  entity: str,
  entityId: str.nullable().optional().default(null),
  title: str.optional().default(''),
  summary: str.optional().default(''),
  changes: z.array(z.looseObject({ field: str, label: str, fromText: str, toText: str })).optional().default([]),
  snapshot: z.unknown().optional().default(null),
  deviceId: str.optional().default(''),
});

const notificationSchema = z.looseObject({
  id: str.min(1),
  ts: num,
  kind: str,
  title: str,
  body: str.optional().default(''),
  href: str.optional().default(''),
  entityId: str.nullable().optional().default(null),
  readAt: nullableNum.optional().default(null),
  dedupeKey: str.optional().default(''),
});

const photoSchema = z.looseObject({
  id: str.min(1),
  clientId: str.min(1),
  kind: z.enum(['ingreso', 'reparacion', 'entrega']).catch('ingreso'),
  blob: str.startsWith('data:'),
  thumb: str.startsWith('data:'),
  width: num.optional().default(0),
  height: num.optional().default(0),
  caption: str.optional().default(''),
  ts: num,
  deviceId: str.optional().default(''),
});

const backupSchema = z.object({
  app: z.literal('reparo', { error: 'El archivo no es un respaldo de Reparo' }),
  schema: num,
  exportedAt: num.optional(),
  deviceId: str.optional(),
  tables: z.object({
    clients: z.array(clientSchema).optional().default([]),
    expenses: z.array(expenseSchema).optional().default([]),
    inventory: z.array(inventorySchema).optional().default([]),
    movements: z.array(movementSchema).optional().default([]),
    audit: z.array(auditSchema).optional().default([]),
    notifications: z.array(notificationSchema).optional().default([]),
    settings: z.array(z.looseObject({ id: z.literal('settings') })).optional().default([]),
    meta: z.array(z.looseObject({ key: str, value: z.unknown() })).optional().default([]),
    photos: z.array(photoSchema).optional().default([]),
  }),
});

export interface ImportResult {
  clients: number;
  expenses: number;
  inventory: number;
  movements: number;
  audit: number;
}

function describeIssue(issue: { path: readonly PropertyKey[]; message: string }): string {
  const path = issue.path.map(String);
  const tableNames: Record<string, string> = {
    clients: 'clientes',
    expenses: 'gastos',
    inventory: 'inventario',
    movements: 'movimientos',
    audit: 'actividad',
    notifications: 'notificaciones',
    photos: 'fotos',
  };
  if (path[0] === 'tables' && path[1]) {
    const t = tableNames[path[1]] ?? path[1];
    const row = path[2] != null ? ` (registro ${Number(path[2]) + 1})` : '';
    return `Datos de ${t} inválidos${row}`;
  }
  return issue.message;
}

/**
 * Importa un respaldo. 'merge': combina con lo existente (gana el más reciente
 * por updatedAt; movimientos, actividad, notificaciones y fotos por id).
 * 'replace': borra todo (salvo el deviceId) y carga el respaldo.
 */
export async function importBackup(file: File | Blob, mode: 'merge' | 'replace'): Promise<ImportResult> {
  await dbReady();
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(await blobText(file));
  } catch {
    throw new BackupError('El archivo no es un respaldo válido (no es JSON)');
  }
  const parsed = backupSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new BackupError(`El archivo no es un respaldo válido de Reparo: ${describeIssue(parsed.error.issues[0])}`);
  }
  const backup = parsed.data;
  if (backup.schema > BACKUP_SCHEMA) {
    throw new BackupError('Este respaldo se hizo con una versión más reciente de Reparo. Actualiza la app e inténtalo de nuevo.');
  }
  const t = backup.tables;
  const clients = t.clients as unknown as Client[];
  const expenses = t.expenses as unknown as Expense[];
  const inventory = t.inventory as unknown as InventoryItem[];
  const movements = t.movements as unknown as InventoryMovement[];
  const audit = t.audit as unknown as AuditEntry[];
  const notifications = t.notifications as unknown as AppNotification[];
  const incomingSettings = t.settings[0] ? withSettingsDefaults(t.settings[0] as unknown as Settings) : null;
  const photos: ClientPhoto[] = t.photos.map((p) => ({
    ...(p as unknown as ClientPhoto),
    blob: dataURLToBlob(p.blob),
    thumb: dataURLToBlob(p.thumb),
  }));

  // Asignar folio a clientes de respaldos antiguos que no lo tengan.
  let maxFolio = clients.reduce((m, c) => Math.max(m, c.folio || 0), 0);
  for (const c of [...clients].sort((a, b) => a.createdAt - b.createdAt)) {
    if (!c.folio) c.folio = ++maxFolio;
  }

  const result: ImportResult = { clients: 0, expenses: 0, inventory: 0, movements: 0, audit: 0 };
  const now = Date.now();

  const savedSettings = await db.transaction('rw', [...ALL_TABLES()], async () => {
    const localSettings = withSettingsDefaults((await db.settings.get('settings')) ?? defaultSettings());
    let finalSettings = localSettings;

    if (mode === 'replace') {
      await Promise.all([
        db.clients.clear(),
        db.expenses.clear(),
        db.inventory.clear(),
        db.movements.clear(),
        db.audit.clear(),
        db.notifications.clear(),
        db.photos.clear(),
      ]);
      await db.meta.where('key').notEqual(META_DEVICE_ID).delete();
      await db.clients.bulkPut(clients);
      await db.expenses.bulkPut(expenses);
      await db.inventory.bulkPut(inventory);
      await db.movements.bulkPut(movements);
      await db.audit.bulkPut(audit);
      await db.notifications.bulkPut(notifications);
      await db.photos.bulkPut(photos);
      for (const m of t.meta) {
        if (m.key !== META_DEVICE_ID) await db.meta.put({ key: m.key, value: m.value });
      }
      result.clients = clients.length;
      result.expenses = expenses.length;
      result.inventory = inventory.length;
      result.movements = movements.length;
      result.audit = audit.length;
      if (incomingSettings) {
        finalSettings = {
          ...incomingSettings,
          pushSubscribed: localSettings.pushSubscribed,
          lastSyncAt: localSettings.lastSyncAt,
          updatedAt: now,
        };
      }
    } else {
      const lww = async <T extends { id: string; updatedAt: number }>(
        table: typeof db.clients | typeof db.expenses | typeof db.inventory,
        rows: T[],
      ): Promise<number> => {
        if (!rows.length) return 0;
        const existing = await (table as unknown as { bulkGet(ids: string[]): Promise<(T | undefined)[]> }).bulkGet(
          rows.map((r) => r.id),
        );
        const winners = rows.filter((r, i) => !existing[i] || r.updatedAt > existing[i]!.updatedAt);
        if (winners.length) await (table as unknown as { bulkPut(rows: T[]): Promise<unknown> }).bulkPut(winners);
        return winners.length;
      };
      const addMissing = async <T extends { id: string }>(
        table: typeof db.movements | typeof db.audit | typeof db.notifications | typeof db.photos,
        rows: T[],
      ): Promise<number> => {
        if (!rows.length) return 0;
        const existing = await (table as unknown as { bulkGet(ids: string[]): Promise<(T | undefined)[]> }).bulkGet(
          rows.map((r) => r.id),
        );
        const missing = rows.filter((_, i) => !existing[i]);
        if (missing.length) await (table as unknown as { bulkAdd(rows: T[]): Promise<unknown> }).bulkAdd(missing);
        return missing.length;
      };
      result.clients = await lww(db.clients, clients);
      result.expenses = await lww(db.expenses, expenses);
      result.inventory = await lww(db.inventory, inventory);
      result.movements = await addMissing(db.movements, movements);
      result.audit = await addMissing(db.audit, audit);
      await addMissing(db.notifications, notifications);
      await addMissing(db.photos, photos);

      const incomingSeq = t.meta.find((m) => m.key === META_FOLIO_SEQ)?.value;
      if (typeof incomingSeq === 'number') {
        const local = await db.meta.get(META_FOLIO_SEQ);
        const localSeq = typeof local?.value === 'number' ? local.value : 0;
        await db.meta.put({ key: META_FOLIO_SEQ, value: Math.max(localSeq, incomingSeq) });
      }
      if (incomingSettings && incomingSettings.updatedAt > localSettings.updatedAt) {
        finalSettings = {
          ...incomingSettings,
          pushSubscribed: localSettings.pushSubscribed,
          lastSyncAt: localSettings.lastSyncAt,
          lastBackupAt: localSettings.lastBackupAt,
          updatedAt: now,
        };
      }
      // Recontar fotos por cliente (las fotos importadas pueden cambiar el total).
      if (photos.length) {
        const ids = [...new Set(photos.map((p) => p.clientId))];
        for (const id of ids) {
          const c = await db.clients.get(id);
          if (c) await db.clients.put({ ...c, numFotos: await db.photos.where('clientId').equals(id).count() });
        }
      }
    }

    await db.settings.put(finalSettings);
    await writeAudit({
      action: 'importar',
      entity: 'sistema',
      entityId: null,
      title: 'Copia de seguridad',
      summary: `Importó un respaldo (${mode === 'merge' ? 'combinar' : 'reemplazar'}): ${plural(result.clients, 'cliente', 'clientes')}, ${plural(result.expenses, 'gasto', 'gastos')}, ${plural(result.inventory, 'artículo', 'artículos')}`,
      changes: [],
      snapshot: { mode, exportedAt: backup.exportedAt ?? null, deviceId: backup.deviceId ?? null, ...result },
      ts: now,
    });
    return finalSettings;
  });
  await recomputeFolioSequence();
  setCachedSettings(savedSettings);
  return result;
}

/* ----------------------------------- CSV --------------------------------- */

type Cell = string | number | null | undefined;

function csvCell(v: Cell): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  let s = String(v);
  // Evita inyección de fórmulas al abrir en hojas de cálculo.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: Cell[][]): Blob {
  const lines = [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))];
  return new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
}

/** Centavos → número decimal (1250.5). */
const money = (cents: number | null | undefined): number => Math.round(cents ?? 0) / 100;

export type CsvKind = 'clientes' | 'gastos' | 'inventario' | 'movimientos' | 'actividad';

/** Exporta una tabla a CSV (UTF-8 con BOM, separador ","). Los datos de desbloqueo nunca se exportan. */
export async function exportCSV(kind: CsvKind): Promise<Blob> {
  await dbReady();
  let blob: Blob;
  let count = 0;
  switch (kind) {
    case 'clientes': {
      const rows = (await db.clients.orderBy('fecha').reverse().toArray()).filter((c) => c.deletedAt == null);
      count = rows.length;
      blob = toCsv(
        ['Folio', 'Fecha de recepción', 'Nombre', 'Teléfono', 'Correo', 'Marca', 'Modelo', 'IMEI / serie', 'Servicio', 'Falla', 'Estado', 'Total', 'Abonado', 'Saldo', 'Estado de pago', 'Método de pago', 'Fecha de entrega', 'Garantía (días)', 'Fotos', 'Notas'],
        rows.map((c) => [
          c.folio,
          formatIsoLocal(c.fecha),
          c.nombre,
          c.telefono,
          c.email,
          c.marca,
          c.modelo,
          c.imei,
          c.servicio,
          c.falla,
          REPAIR_STATUS_LABEL[c.estado],
          money(c.cobroCents),
          money(c.pagadoCents),
          money(saldoCents(c)),
          PAYMENT_STATUS_LABEL[paymentStatus(c)],
          PAYMENT_METHOD_LABEL[c.metodoPago],
          formatIsoLocal(c.fechaEntrega),
          c.garantiaDias,
          c.numFotos ?? 0,
          c.notas,
        ]),
      );
      break;
    }
    case 'gastos': {
      const [rows, clients, items] = await Promise.all([
        db.expenses.orderBy('fecha').reverse().toArray(),
        db.clients.toArray(),
        db.inventory.toArray(),
      ]);
      const cName = new Map(clients.map((c) => [c.id, clientTitle(c)]));
      const iName = new Map(items.map((i) => [i.id, i.nombre]));
      const active = rows.filter((e) => e.deletedAt == null);
      count = active.length;
      blob = toCsv(
        ['Fecha', 'Concepto', 'Categoría', 'Proveedor', 'Cantidad', 'Costo unitario', 'Total', 'Método de pago', 'Cliente', 'Artículo de inventario', 'Notas'],
        active.map((e) => [
          formatIsoLocal(e.fecha),
          e.concepto,
          EXPENSE_CATEGORY_LABEL[e.categoria],
          e.proveedor,
          e.cantidad,
          money(e.costoUnitarioCents),
          money(e.totalCents),
          PAYMENT_METHOD_LABEL[e.metodoPago],
          e.clienteId ? (cName.get(e.clienteId) ?? '') : '',
          e.inventarioId ? (iName.get(e.inventarioId) ?? '') : '',
          e.notas,
        ]),
      );
      break;
    }
    case 'inventario': {
      const rows = (await db.inventory.toArray())
        .filter((i) => i.deletedAt == null)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      count = rows.length;
      blob = toCsv(
        ['Nombre', 'Categoría', 'Marca', 'Modelo compatible', 'SKU', 'Proveedor', 'Stock', 'Stock mínimo', 'Cantidad a pedir', 'Costo unitario', 'Precio de venta', 'Valor en stock', 'Estado', 'Ubicación', 'Pedido el', 'Notas'],
        rows.map((i) => [
          i.nombre,
          EXPENSE_CATEGORY_LABEL[i.categoria],
          i.marca,
          i.modelo,
          i.sku,
          i.proveedor,
          i.stock,
          i.stockMinimo,
          i.cantidadPedido,
          money(i.costoUnitarioCents),
          money(i.precioVentaCents),
          money(i.stock * i.costoUnitarioCents),
          STOCK_STATUS_LABEL[stockStatus(i)],
          i.ubicacion,
          formatIsoLocal(i.pedidoAt),
          i.notas,
        ]),
      );
      break;
    }
    case 'movimientos': {
      const [rows, clients, items] = await Promise.all([
        db.movements.orderBy('ts').reverse().toArray(),
        db.clients.toArray(),
        db.inventory.toArray(),
      ]);
      const cName = new Map(clients.map((c) => [c.id, clientTitle(c)]));
      const iName = new Map(items.map((i) => [i.id, i.nombre]));
      count = rows.length;
      blob = toCsv(
        ['Fecha', 'Artículo', 'Tipo', 'Cantidad', 'Stock antes', 'Stock después', 'Costo unitario', 'Cliente', 'Nota'],
        rows.map((m) => [
          formatIsoLocal(m.ts),
          iName.get(m.itemId) ?? 'Artículo eliminado',
          MOVEMENT_TYPE_LABEL[m.type],
          m.cantidad,
          m.stockAntes,
          m.stockDespues,
          money(m.costoUnitarioCents),
          m.clienteId ? (cName.get(m.clienteId) ?? '') : '',
          m.nota,
        ]),
      );
      break;
    }
    case 'actividad': {
      const rows = await db.audit.orderBy('ts').reverse().toArray();
      count = rows.length;
      blob = toCsv(
        ['Fecha', 'Acción', 'Tipo', 'Registro', 'Resumen', 'Detalle'],
        rows.map((a) => [
          formatIsoLocal(a.ts),
          AUDIT_ACTION_LABEL[a.action] ?? a.action,
          ENTITY_LABEL[a.entity] ?? a.entity,
          a.title,
          a.summary,
          (a.changes ?? []).map((ch) => `${ch.label}: ${ch.fromText} → ${ch.toText}`).join('; '),
        ]),
      );
      break;
    }
  }
  const labels: Record<CsvKind, string> = {
    clientes: 'clientes',
    gastos: 'gastos',
    inventario: 'inventario',
    movimientos: 'movimientos de inventario',
    actividad: 'registro de actividad',
  };
  await db.transaction('rw', db.audit, () =>
    writeAudit({
      action: 'exportar',
      entity: 'sistema',
      entityId: null,
      title: 'Exportación CSV',
      summary: `Exportó ${labels[kind]} a CSV (${plural(count, 'registro', 'registros')})`,
      changes: [],
      snapshot: null,
    }),
  );
  return blob;
}

/* ------------------------------- Utilidades ------------------------------ */

/** Descarga un Blob como archivo. */
type HostDownloads = { save(o: { filename: string; data: Blob }): Promise<unknown> };
type HostClaude = { use?(name: string): Promise<unknown> };

/**
 * Entrega un archivo al usuario. Si la app corre dentro de un visor que
 * administra descargas (p. ej. una vista previa embebida), usa su API; si no,
 * un enlace <a download> clásico.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return;
  const host = (window as unknown as { claude?: HostClaude }).claude;
  if (host?.use) {
    host
      .use('downloads')
      .then((d) => {
        if (d) return (d as HostDownloads).save({ filename, data: blob });
        anchorDownload(blob, filename);
      })
      .catch(() => {
        /* el usuario canceló o la vista no permite descargas */
      });
    return;
  }
  anchorDownload(blob, filename);
}

function anchorDownload(blob: Blob, filename: string): void {
  if (typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Nombre sugerido: "reparo-respaldo-2026-11-07-1432.json". */
export function backupFilename(ext: 'json' | 'csv' = 'json', prefix = 'respaldo'): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `reparo-${prefix}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
}

/**
 * Borra todos los datos del dispositivo (clientes, gastos, inventario, fotos,
 * actividad, notificaciones). Conserva el deviceId y la preferencia de tema;
 * los demás ajustes vuelven a sus valores por defecto.
 */
export async function wipeAllData(): Promise<void> {
  await dbReady();
  const saved = await db.transaction('rw', [...ALL_TABLES()], async () => {
    const current = withSettingsDefaults((await db.settings.get('settings')) ?? defaultSettings());
    await Promise.all([
      db.clients.clear(),
      db.expenses.clear(),
      db.inventory.clear(),
      db.movements.clear(),
      db.audit.clear(),
      db.notifications.clear(),
      db.photos.clear(),
    ]);
    await db.meta.where('key').notEqual(META_DEVICE_ID).delete();
    const fresh: Settings = { ...defaultSettings(), theme: current.theme };
    await db.settings.put(fresh);
    return fresh;
  });
  setCachedSettings(saved);
}

/** Pide al navegador que no borre los datos ante falta de espacio. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean }> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return { usage: 0, quota: 0, persisted: false };
    const [est, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false),
    ]);
    return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted };
  } catch {
    return { usage: 0, quota: 0, persisted: false };
  }
}

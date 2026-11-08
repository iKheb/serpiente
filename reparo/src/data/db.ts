/* Base de datos local (IndexedDB vía Dexie 4).
   Los nombres de tabla son fijos: también los usa la sincronización (sync.ts). */
import Dexie, { type EntityTable } from 'dexie';
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
import { defaultSettings, withSettingsDefaults } from './defaults';
import { newId } from './ids';

/** Fila clave/valor de la tabla `meta`. */
export interface MetaRow {
  key: string;
  value: unknown;
}

export class ReparoDB extends Dexie {
  clients!: EntityTable<Client, 'id'>;
  expenses!: EntityTable<Expense, 'id'>;
  inventory!: EntityTable<InventoryItem, 'id'>;
  movements!: EntityTable<InventoryMovement, 'id'>;
  audit!: EntityTable<AuditEntry, 'id'>;
  notifications!: EntityTable<AppNotification, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;
  photos!: EntityTable<ClientPhoto, 'id'>;

  constructor() {
    super('reparo');
    // IndexedDB no indexa null: `deletedAt` se filtra en JS.
    this.version(1).stores({
      clients: 'id, fecha, updatedAt, estado, nombre, telefono',
      expenses: 'id, fecha, updatedAt, categoria, clienteId, inventarioId',
      inventory: 'id, nombre, categoria, updatedAt',
      movements: 'id, itemId, clienteId, ts',
      audit: 'id, ts, entity, entityId, action',
      notifications: 'id, ts, kind, dedupeKey',
      settings: 'id',
      meta: 'key',
      photos: 'id, clientId, ts',
    });
  }
}

export const db = new ReparoDB();

/* --------------------------- Claves de `meta` ---------------------------- */

export const META_DEVICE_ID = 'deviceId';
export const META_FOLIO_SEQ = 'folioSeq';
/** Registro de alertas ya emitidas: { [dedupeKey]: ts }. */
export const META_NOTIFIED = 'notifiedKeys';

/* ----------------------------- Dispositivo ------------------------------- */

const LS_DEVICE_KEY = 'reparo.deviceId';

function readLocalDeviceId(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(LS_DEVICE_KEY) : null;
  } catch {
    return null;
  }
}

function writeLocalDeviceId(id: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LS_DEVICE_KEY, id);
  } catch {
    /* almacenamiento local no disponible (modo privado): basta con `meta` */
  }
}

let deviceId: string = readLocalDeviceId() ?? newId();
writeLocalDeviceId(deviceId);

/**
 * Identificador estable de este dispositivo. Se persiste en `meta` (y en
 * localStorage como caché síncrona). Si `meta` ya tenía uno, ese prevalece.
 */
export function getDeviceId(): string {
  return deviceId;
}

async function reconcileDeviceId(): Promise<void> {
  await db.transaction('rw', db.meta, async () => {
    const row = await db.meta.get(META_DEVICE_ID);
    if (row && typeof row.value === 'string' && row.value) {
      if (row.value !== deviceId) {
        deviceId = row.value;
        writeLocalDeviceId(deviceId);
      }
    } else {
      await db.meta.put({ key: META_DEVICE_ID, value: deviceId });
    }
  });
}

/* ------------------------------- Ajustes --------------------------------- */

/**
 * Garantiza que exista la fila de ajustes (y que tenga todos los campos de la
 * versión actual). Es segura ante carreras: lee y escribe en una transacción rw.
 */
export async function ensureSettings(): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const current = await db.settings.get('settings');
    if (!current) {
      const s = defaultSettings();
      await db.settings.put(s);
      return s;
    }
    const merged = withSettingsDefaults(current);
    if (Object.keys(merged).length !== Object.keys(current).length) {
      await db.settings.put(merged);
    }
    return merged;
  });
}

/** Lee los ajustes (con valores por defecto si aún no existen). */
export async function readSettings(): Promise<Settings> {
  const s = await db.settings.get('settings');
  return s ? withSettingsDefaults(s) : defaultSettings(0);
}

/* -------------------------------- Folio ---------------------------------- */

/** Mayor folio existente entre los clientes (incluye papelera). */
export async function maxClientFolio(): Promise<number> {
  let max = 0;
  await db.clients.each((c) => {
    if (typeof c.folio === 'number' && c.folio > max) max = c.folio;
  });
  return max;
}

/**
 * Siguiente folio consecutivo. DEBE llamarse dentro de una transacción rw que
 * incluya `meta` y `clients` para que sea atómico.
 */
export async function nextFolio(): Promise<number> {
  const row = await db.meta.get(META_FOLIO_SEQ);
  let seq = typeof row?.value === 'number' ? row.value : NaN;
  if (!Number.isFinite(seq)) seq = await maxClientFolio();
  const next = seq + 1;
  await db.meta.put({ key: META_FOLIO_SEQ, value: next });
  return next;
}

/**
 * Ajusta el contador de folios para que nunca quede por debajo del mayor folio
 * existente (útil tras importar o sincronizar). Devuelve el valor resultante.
 */
export async function recomputeFolioSequence(): Promise<number> {
  return db.transaction('rw', db.meta, db.clients, async () => {
    const row = await db.meta.get(META_FOLIO_SEQ);
    const current = typeof row?.value === 'number' ? row.value : 0;
    const max = await maxClientFolio();
    const value = Math.max(current, max);
    if (value !== current || !row) await db.meta.put({ key: META_FOLIO_SEQ, value });
    return value;
  });
}

/* ------------------------------ Arranque --------------------------------- */

let readyPromise: Promise<void> | null = null;

/** Prepara la base (deviceId persistido y ajustes creados). Idempotente. */
export function dbReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      await db.open();
      await reconcileDeviceId();
      await ensureSettings();
    })().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

if (typeof indexedDB !== 'undefined') {
  dbReady().catch((err) => {
    console.error('[reparo] No se pudo abrir la base de datos local', err);
  });
}

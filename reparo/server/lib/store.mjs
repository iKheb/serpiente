// Almacén de sincronización sobre SQLite (node:sqlite, modo WAL).
//
// Cada fila sincronizada se guarda como JSON + columnas de control:
//   ("table", id, updatedAt, deviceId, rev, seq, data, receivedAt)
// - clients / expenses / inventory: fusión LWW por updatedAt
//   (empate → deviceId mayor; empate total → rev mayor; idéntico → sin cambios).
// - movements / audit: sólo se agregan (append-only) por id.
// - Cada fila aceptada recibe un `seq` global incremental: los clientes piden
//   "todo lo que tenga seq > mi cursor".
// - Las purgas definitivas viajan como entradas de auditoría (action 'purgar'):
//   el servidor borra la fila y deja una "lápida" para no resucitarla si otro
//   dispositivo envía después una versión más vieja.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from './sqlite.mjs';

export const LWW_TABLES = Object.freeze(['clients', 'expenses', 'inventory']);
export const APPEND_TABLES = Object.freeze(['movements', 'audit']);
export const SYNC_TABLES = Object.freeze([...LWW_TABLES, ...APPEND_TABLES]);
export const PAGE_SIZE = 2000;
export const MAX_ROW_BYTES = 512 * 1024;
const MAX_ID_LENGTH = 128;

/** Entidad de auditoría → tabla sincronizada (para propagar purgas). */
export const ENTITY_TABLE = Object.freeze({ cliente: 'clients', gasto: 'expenses', inventario: 'inventory' });

const SCHEMA_VERSION = 1;

/** Error de validación de la solicitud (→ HTTP 400 con mensaje en español). */
export class SyncValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'SOLICITUD_INVALIDA';
  }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID_LENGTH;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** ¿La versión `a` gana a la versión `b` según LWW? (true = estrictamente más nueva). */
export function lwwWins(a, b) {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
  const da = String(a.deviceId ?? '');
  const dbb = String(b.deviceId ?? '');
  if (da !== dbb) return da > dbb;
  return (Number(a.rev) || 0) > (Number(b.rev) || 0);
}

export class SyncStore {
  /**
   * @param {string} file Ruta del archivo SQLite o ':memory:'.
   */
  constructor(file = ':memory:') {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.file = file;
    this.db = new DatabaseSync(file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA foreign_keys = ON;
    `);
    this.#migrate();
    this.#prepare();
    this.serverId = this.getMeta('serverId');
    if (!this.serverId) {
      this.serverId = crypto.randomUUID();
      this.setMeta('serverId', this.serverId);
      this.setMeta('createdAt', Date.now());
    }
  }

  #migrate() {
    const { user_version: v } = this.db.prepare('PRAGMA user_version').get();
    if (v >= SCHEMA_VERSION) return;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rows (
        "table"    TEXT    NOT NULL,
        id         TEXT    NOT NULL,
        updatedAt  INTEGER NOT NULL,
        deviceId   TEXT    NOT NULL,
        rev        INTEGER NOT NULL DEFAULT 0,
        seq        INTEGER NOT NULL,
        data       TEXT    NOT NULL,
        receivedAt INTEGER NOT NULL,
        PRIMARY KEY ("table", id)
      ) WITHOUT ROWID;
      CREATE UNIQUE INDEX IF NOT EXISTS rows_seq ON rows(seq);
      CREATE TABLE IF NOT EXISTS tombstones (
        "table"  TEXT    NOT NULL,
        id       TEXT    NOT NULL,
        purgedAt INTEGER NOT NULL,
        PRIMARY KEY ("table", id)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS devices (
        deviceId   TEXT PRIMARY KEY,
        firstSeen  INTEGER NOT NULL,
        lastSeen   INTEGER NOT NULL,
        lastCursor INTEGER NOT NULL DEFAULT 0,
        pushed     INTEGER NOT NULL DEFAULT 0,
        pulled     INTEGER NOT NULL DEFAULT 0,
        userAgent  TEXT,
        ip         TEXT
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint      TEXT PRIMARY KEY,
        deviceId      TEXT    NOT NULL,
        p256dh        TEXT    NOT NULL,
        auth          TEXT    NOT NULL,
        userAgent     TEXT,
        createdAt     INTEGER NOT NULL,
        updatedAt     INTEGER NOT NULL,
        lastSuccessAt INTEGER,
        failures      INTEGER NOT NULL DEFAULT 0
      ) WITHOUT ROWID;
      CREATE INDEX IF NOT EXISTS push_by_device ON push_subscriptions(deviceId);
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
  }

  #prepare() {
    const p = (sql) => this.db.prepare(sql);
    this.q = {
      maxSeq: p('SELECT COALESCE(MAX(seq), 0) AS m FROM rows'),
      getRow: p('SELECT updatedAt, deviceId, rev, data FROM rows WHERE "table" = ? AND id = ?'),
      hasRow: p('SELECT 1 AS x FROM rows WHERE "table" = ? AND id = ?'),
      upsertRow: p(`INSERT INTO rows ("table", id, updatedAt, deviceId, rev, seq, data, receivedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT("table", id) DO UPDATE SET
                      updatedAt = excluded.updatedAt, deviceId = excluded.deviceId, rev = excluded.rev,
                      seq = excluded.seq, data = excluded.data, receivedAt = excluded.receivedAt`),
      deleteRow: p('DELETE FROM rows WHERE "table" = ? AND id = ? AND updatedAt <= ?'),
      getTomb: p('SELECT purgedAt FROM tombstones WHERE "table" = ? AND id = ?'),
      putTomb: p(`INSERT INTO tombstones ("table", id, purgedAt) VALUES (?, ?, ?)
                  ON CONFLICT("table", id) DO UPDATE SET purgedAt = MAX(purgedAt, excluded.purgedAt)`),
      delTomb: p('DELETE FROM tombstones WHERE "table" = ? AND id = ?'),
      page: p('SELECT "table" AS t, seq, data FROM rows WHERE seq > ? ORDER BY seq LIMIT ?'),
      counts: p('SELECT "table" AS t, COUNT(*) AS n FROM rows GROUP BY "table"'),
      getMeta: p('SELECT value FROM meta WHERE key = ?'),
      setMeta: p('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
      touchDevice: p(`INSERT INTO devices (deviceId, firstSeen, lastSeen, lastCursor, pushed, pulled, userAgent, ip)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                      ON CONFLICT(deviceId) DO UPDATE SET
                        lastSeen = excluded.lastSeen, lastCursor = excluded.lastCursor,
                        pushed = pushed + excluded.pushed, pulled = pulled + excluded.pulled,
                        userAgent = COALESCE(excluded.userAgent, userAgent), ip = COALESCE(excluded.ip, ip)`),
      devices: p('SELECT deviceId, firstSeen, lastSeen, lastCursor, pushed, pulled, userAgent FROM devices ORDER BY lastSeen DESC'),
      upsertSub: p(`INSERT INTO push_subscriptions (endpoint, deviceId, p256dh, auth, userAgent, createdAt, updatedAt, failures)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                    ON CONFLICT(endpoint) DO UPDATE SET
                      deviceId = excluded.deviceId, p256dh = excluded.p256dh, auth = excluded.auth,
                      userAgent = COALESCE(excluded.userAgent, userAgent), updatedAt = excluded.updatedAt, failures = 0`),
      delSub: p('DELETE FROM push_subscriptions WHERE endpoint = ?'),
      allSubs: p('SELECT endpoint, deviceId, p256dh, auth FROM push_subscriptions'),
      subsByDevice: p('SELECT endpoint, deviceId, p256dh, auth FROM push_subscriptions WHERE deviceId = ?'),
      subOk: p('UPDATE push_subscriptions SET lastSuccessAt = ?, failures = 0 WHERE endpoint = ?'),
      subFail: p('UPDATE push_subscriptions SET failures = failures + 1 WHERE endpoint = ?'),
      countSubs: p('SELECT COUNT(*) AS n FROM push_subscriptions'),
      cobrado: p(`SELECT COALESCE(SUM(json_extract(data, '$.pagadoCents')), 0) AS total, COUNT(*) AS n
                  FROM rows WHERE "table" = 'clients'
                    AND json_extract(data, '$.deletedAt') IS NULL
                    AND COALESCE(json_extract(data, '$.estado'), '') <> 'cancelado'
                    AND json_extract(data, '$.fecha') >= ? AND json_extract(data, '$.fecha') < ?`),
      gastado: p(`SELECT COALESCE(SUM(json_extract(data, '$.totalCents')), 0) AS total, COUNT(*) AS n
                  FROM rows WHERE "table" = 'expenses'
                    AND json_extract(data, '$.deletedAt') IS NULL
                    AND json_extract(data, '$.fecha') >= ? AND json_extract(data, '$.fecha') < ?`),
      entregados: p(`SELECT COUNT(*) AS n FROM rows WHERE "table" = 'clients'
                    AND json_extract(data, '$.deletedAt') IS NULL
                    AND json_extract(data, '$.fechaEntrega') >= ? AND json_extract(data, '$.fechaEntrega') < ?`),
    };
  }

  /* ------------------------------- meta ---------------------------------- */

  getMeta(key) {
    const row = this.q.getMeta.get(key);
    if (!row) return undefined;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  setMeta(key, value) {
    this.q.setMeta.run(key, JSON.stringify(value));
  }

  maxSeq() {
    return Number(this.q.maxSeq.get().m);
  }

  /** Ejecuta `fn` dentro de una transacción (BEGIN IMMEDIATE … COMMIT). */
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        /* ya revertida */
      }
      throw err;
    }
  }

  /* ---------------------------- sincronización ---------------------------- */

  /**
   * Valida la forma general de una solicitud de sincronización.
   * @returns {{ deviceId: string, cursor: number, changes: Record<string, unknown[]>, ignoredTables: string[] }}
   */
  static parseRequest(body) {
    if (!isObj(body)) throw new SyncValidationError('El cuerpo debe ser un objeto JSON.');
    const { deviceId, cursor = 0, changes = {} } = body;
    if (!isId(deviceId)) throw new SyncValidationError('Falta "deviceId" (texto de 1 a 128 caracteres).');
    if (!Number.isSafeInteger(cursor) || cursor < 0) {
      throw new SyncValidationError('"cursor" debe ser un número entero mayor o igual a 0.');
    }
    if (!isObj(changes)) throw new SyncValidationError('"changes" debe ser un objeto { tabla: filas[] }.');
    const out = {};
    const ignoredTables = [];
    for (const [table, rows] of Object.entries(changes)) {
      if (!SYNC_TABLES.includes(table)) {
        ignoredTables.push(table);
        continue;
      }
      if (rows == null) continue;
      if (!Array.isArray(rows)) throw new SyncValidationError(`"changes.${table}" debe ser una lista.`);
      out[table] = rows;
    }
    return { deviceId, cursor, changes: out, ignoredTables };
  }

  /**
   * Fusiona los cambios recibidos de un dispositivo.
   * @returns {{ accepted: Array<{table:string,id:string,seq:number,row:object,prev:object|null}>, acceptedSeqs: Set<number>, rejected: Array<{table:string,id:unknown,reason:string}>, unchanged: number, purged: number }}
   */
  applyChanges(deviceId, changes, { now = Date.now() } = {}) {
    let seq = this.maxSeq();
    const accepted = [];
    const acceptedSeqs = new Set();
    const rejected = [];
    const purges = [];
    let unchanged = 0;

    const reject = (table, row, reason) => rejected.push({ table, id: isObj(row) ? row.id : undefined, reason });

    for (const table of SYNC_TABLES) {
      const rows = changes[table];
      if (!rows || rows.length === 0) continue;
      const lww = LWW_TABLES.includes(table);
      for (const row of rows) {
        if (!isObj(row)) {
          reject(table, row, 'La fila no es un objeto.');
          continue;
        }
        if (!isId(row.id)) {
          reject(table, row, 'La fila no tiene un "id" válido.');
          continue;
        }
        const stamp = lww ? row.updatedAt : row.ts;
        if (!finite(stamp)) {
          reject(table, row, lww ? 'La fila no tiene "updatedAt" numérico.' : 'La fila no tiene "ts" numérico.');
          continue;
        }
        const rowDevice = isId(row.deviceId) ? row.deviceId : deviceId;
        const data = JSON.stringify(row);
        if (data.length > MAX_ROW_BYTES) {
          reject(table, row, 'La fila es demasiado grande.');
          continue;
        }
        const rev = Number.isSafeInteger(row.rev) ? row.rev : 0;
        let prev = null;

        if (lww) {
          const existing = this.q.getRow.get(table, row.id);
          if (existing) {
            if (!lwwWins({ updatedAt: stamp, deviceId: rowDevice, rev }, existing)) {
              unchanged++;
              continue;
            }
            prev = JSON.parse(existing.data);
          } else {
            const tomb = this.q.getTomb.get(table, row.id);
            if (tomb && Number(tomb.purgedAt) >= stamp) {
              unchanged++;
              continue;
            }
            if (tomb) this.q.delTomb.run(table, row.id);
          }
        } else if (this.q.hasRow.get(table, row.id)) {
          unchanged++;
          continue;
        }

        seq += 1;
        this.q.upsertRow.run(table, row.id, Math.trunc(stamp), rowDevice, rev, seq, data, now);
        accepted.push({ table, id: row.id, seq, row, prev });
        acceptedSeqs.add(seq);

        if (table === 'audit' && row.action === 'purgar' && ENTITY_TABLE[row.entity] && isId(row.entityId)) {
          purges.push({ table: ENTITY_TABLE[row.entity], id: row.entityId, ts: stamp });
        }
      }
    }

    let purged = 0;
    for (const p of purges) {
      purged += Number(this.q.deleteRow.run(p.table, p.id, Math.trunc(p.ts)).changes);
      this.q.putTomb.run(p.table, p.id, Math.trunc(p.ts));
    }

    return { accepted, acceptedSeqs, rejected, unchanged, purged };
  }

  /**
   * Filas con seq > cursor (orden de seq), en páginas de `limit`.
   * `exclude` = seqs que el propio solicitante acaba de enviar (no se le devuelven).
   */
  pull(cursor, { limit = PAGE_SIZE, exclude = new Set() } = {}) {
    const rows = this.q.page.all(cursor, limit + 1);
    const more = rows.length > limit;
    const pageRows = more ? rows.slice(0, limit) : rows;
    const changes = Object.fromEntries(SYNC_TABLES.map((t) => [t, []]));
    let count = 0;
    for (const r of pageRows) {
      if (exclude.has(Number(r.seq))) continue;
      changes[r.t].push(JSON.parse(r.data));
      count++;
    }
    const nextCursor = more ? Number(pageRows[pageRows.length - 1].seq) : this.maxSeq();
    return { cursor: nextCursor, changes, more, count };
  }

  /**
   * Operación completa de POST /api/sync, atómica.
   * @returns {{ response: object, merge: ReturnType<SyncStore['applyChanges']> }}
   */
  sync(body, { pageSize = PAGE_SIZE, now = Date.now(), userAgent = null, ip = null } = {}) {
    const req = SyncStore.parseRequest(body);
    return this.transaction(() => {
      const before = this.maxSeq();
      // Cursor mayor que lo que existe → la base del servidor se restauró/reinició:
      // el cliente debe reenviar todo y empezar desde 0.
      const resync = req.cursor > before;
      const cursor = resync ? 0 : req.cursor;
      const merge = this.applyChanges(req.deviceId, req.changes, { now });
      const page = this.pull(cursor, { limit: pageSize, exclude: merge.acceptedSeqs });
      const pushed = merge.accepted.length;
      this.q.touchDevice.run(req.deviceId, now, now, page.cursor, pushed, page.count, userAgent, ip);
      const response = {
        ok: true,
        serverId: this.serverId,
        cursor: page.cursor,
        more: page.more,
        changes: page.changes,
        accepted: pushed,
        unchanged: merge.unchanged,
        rejected: merge.rejected.length,
        serverTime: now,
      };
      if (resync) response.resync = true;
      if (req.ignoredTables.length) response.ignoredTables = req.ignoredTables;
      if (merge.rejected.length) response.rejectedRows = merge.rejected.slice(0, 20);
      return { response, merge, request: req };
    });
  }

  counts() {
    const out = Object.fromEntries(SYNC_TABLES.map((t) => [t, 0]));
    for (const r of this.q.counts.all()) out[r.t] = Number(r.n);
    return out;
  }

  devices() {
    return this.q.devices.all().map((d) => ({ ...d }));
  }

  /** Lee una fila sincronizada (o null). */
  getRow(table, id) {
    const r = this.q.getRow.get(table, id);
    return r ? JSON.parse(r.data) : null;
  }

  /* ------------------------------ Web Push -------------------------------- */

  upsertSubscription({ endpoint, deviceId, p256dh, auth, userAgent = null, now = Date.now() }) {
    this.q.upsertSub.run(endpoint, deviceId, p256dh, auth, userAgent, now, now);
  }

  removeSubscription(endpoint) {
    return Number(this.q.delSub.run(endpoint).changes) > 0;
  }

  /** Suscripciones: todas, las de un dispositivo, o todas menos las de un dispositivo. */
  subscriptions({ deviceId, excludeDeviceId } = {}) {
    const rows = deviceId ? this.q.subsByDevice.all(deviceId) : this.q.allSubs.all();
    return rows.filter((s) => !excludeDeviceId || s.deviceId !== excludeDeviceId).map((s) => ({ ...s }));
  }

  subscriptionCount() {
    return Number(this.q.countSubs.get().n);
  }

  markSubscription(endpoint, ok, now = Date.now()) {
    if (ok) this.q.subOk.run(now, endpoint);
    else this.q.subFail.run(endpoint);
  }

  /* ------------------------------- Reportes ------------------------------- */

  /** Totales de un rango [start, end) a partir de los datos sincronizados (centavos). */
  totals(start, end) {
    const c = this.q.cobrado.get(start, end);
    const g = this.q.gastado.get(start, end);
    const e = this.q.entregados.get(start, end);
    const cobradoCents = Math.round(Number(c.total));
    const gastadoCents = Math.round(Number(g.total));
    return {
      cobradoCents,
      gastadoCents,
      gananciaCents: cobradoCents - gastadoCents,
      servicios: Number(c.n),
      gastos: Number(g.n),
      entregados: Number(e.n),
    };
  }

  close() {
    try {
      this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      /* base en memoria o ya cerrada */
    }
    this.db.close();
  }
}

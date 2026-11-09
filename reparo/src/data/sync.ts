/* ==========================================================================
   Sincronización opcional con el servidor de Reparo (server/index.mjs).
   --------------------------------------------------------------------------
   Protocolo (POST {syncUrl}/api/sync):
     → { deviceId, cursor, changes: { clients, expenses, inventory, movements, audit } }
     ← { serverId, cursor, more, changes, accepted, resync? }
   - Se envían las filas locales con updatedAt/ts > meta.syncPushedAt[tabla]
     (la primera vez contra un servidor se envía todo).
   - Se aplican las remotas con LWW (updatedAt → deviceId → rev) SIN generar
     auditoría nueva; las entradas de auditoría remotas se insertan tal cual.
   - Las purgas definitivas viajan como auditoría 'purgar' y se replican.
   - Fotos, notificaciones y ajustes NO se sincronizan (son por dispositivo).
   ========================================================================== */
import { useMemo, useSyncExternalStore } from 'react';
import { liveQuery, type Table } from 'dexie';
import { db, dbReady, getDeviceId, readSettings, recomputeFolioSequence } from '@/data/db';
import { updateSettings, useSettings } from '@/data';
import type { AuditEntry, Timestamp } from './types';

/* ------------------------------- Tipos ----------------------------------- */

export type SyncState = 'disabled' | 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncStatus {
  state: SyncState;
  lastSyncAt: number | null;
  error: string | null;
  /** Resultado de la última sincronización correcta de esta sesión. */
  lastResult: SyncResult | null;
}

export interface SyncResult {
  /** Filas locales aceptadas por el servidor. */
  pushed: number;
  /** Filas remotas aplicadas en este dispositivo. */
  pulled: number;
}

const LWW_TABLES = ['clients', 'expenses', 'inventory'] as const;
const APPEND_TABLES = ['movements', 'audit'] as const;
const SYNC_TABLES = [...LWW_TABLES, ...APPEND_TABLES] as const;
type SyncTable = (typeof SYNC_TABLES)[number];
type Row = Record<string, unknown> & { id: string; deviceId?: string };
type Changes = Partial<Record<SyncTable, Row[]>>;

interface SyncResponse {
  ok: boolean;
  serverId: string;
  cursor: number;
  more: boolean;
  changes: Changes;
  accepted: number;
  resync?: boolean;
}

/** Error de sincronización con mensaje en español listo para mostrar. */
export class SyncError extends Error {
  constructor(
    message: string,
    public kind: 'offline' | 'config' | 'auth' | 'server' | 'network' = 'server',
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

/* ----------------------------- Constantes -------------------------------- */

const AUTO_INTERVAL_MS = 2 * 60 * 1000;
const DEBOUNCE_MS = 3000;
const REQUEST_TIMEOUT_MS = 60_000;
const TEST_TIMEOUT_MS = 8000;
const CHUNK_ROWS = 1000;
const CHUNK_BYTES = 4 * 1024 * 1024;
const GZIP_OVER_BYTES = 64 * 1024;
const MAX_PAGES = 500;
/** Ventana para detectar movimientos con fecha retroactiva aún no enviados. */
const MOVEMENT_WINDOW_MS = 60 * 24 * 3600 * 1000;

/** Entidad de auditoría → tabla (para replicar purgas). */
const ENTITY_TABLE: Record<string, SyncTable | undefined> = { cliente: 'clients', gasto: 'expenses', inventario: 'inventory' };

const META = {
  cursor: 'syncCursor',
  pushedAt: 'syncPushedAt',
  serverId: 'syncServerId',
  serverUrl: 'syncServerUrl',
  movements: 'syncMovementsPushed',
} as const;

/* ------------------------------ URL y token ------------------------------ */

/**
 * Normaliza la URL del servidor. Acepta "192.168.1.10:8787", "http://host:8787/",
 * ".../api" y un token opcional como "?token=…" o "#token=…".
 */
export function parseSyncUrl(raw: string | null | undefined): { base: string; token: string } | null {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `http://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname) return null;
  const hashParams = new URLSearchParams(u.hash.replace(/^#/, ''));
  const token = (u.searchParams.get('token') ?? hashParams.get('token') ?? '').trim();
  const path = u.pathname.replace(/\/+$/, '').replace(/\/api$/i, '');
  return { base: `${u.protocol}//${u.host}${path}`, token };
}

function isLoopback(host: string): boolean {
  return host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127\./.test(host);
}

function mixedContentProblem(base: string): string | null {
  if (typeof location === 'undefined' || location.protocol !== 'https:') return null;
  const u = new URL(base);
  if (u.protocol === 'https:' || isLoopback(u.hostname)) return null;
  return 'La app está abierta con HTTPS y el servidor usa HTTP: el navegador bloquea esa conexión. Usa la dirección https:// del servidor.';
}

/* ------------------------------ Red (fetch) ------------------------------ */

function timeoutSignal(ms: number): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

async function request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();
  const t = timeoutSignal(timeoutMs);
  try {
    return await fetch(url, { ...init, signal: t.signal, cache: 'no-store', credentials: 'omit' });
  } catch (err) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new SyncError('Sin conexión de red. Se sincronizará al volver la conexión.', 'offline');
    }
    if ((err as Error)?.name === 'AbortError') {
      throw new SyncError(`El servidor (${host}) tardó demasiado en responder.`, 'network');
    }
    throw new SyncError(
      `No se pudo conectar con el servidor (${host}). Verifica que esté encendido, que la dirección sea correcta y que estés en la misma red.`,
      'network',
    );
  } finally {
    t.done();
  }
}

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function httpErrorMessage(status: number, body: Record<string, unknown> | null): SyncError {
  const serverMsg = typeof body?.error === 'string' ? body.error : '';
  if (status === 401) {
    return new SyncError(
      'El servidor requiere un token válido. Agrega ?token=TU_TOKEN al final de la URL del servidor (el mismo de REPARO_TOKEN).',
      'auth',
    );
  }
  if (status === 403) return new SyncError(serverMsg || 'El servidor rechazó la conexión (403).', 'auth');
  if (status === 404) return new SyncError('Esa dirección no parece un servidor de Reparo (no existe /api/sync).', 'config');
  if (status === 413) return new SyncError(serverMsg || 'Demasiados datos en una sola sincronización.', 'server');
  if (status >= 500) return new SyncError(`El servidor tuvo un error (${status}). Intenta de nuevo en unos minutos.`, 'server');
  return new SyncError(serverMsg || `El servidor respondió con un error (${status}).`, 'server');
}

async function gzip(text: string): Promise<Blob | null> {
  if (typeof CompressionStream === 'undefined' || typeof Blob === 'undefined') return null;
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return await new Response(stream).blob();
  } catch {
    return null;
  }
}

async function postSync(base: string, token: string, body: { deviceId: string; cursor: number; changes: Changes }): Promise<SyncResponse> {
  const json = JSON.stringify(body);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: BodyInit = json;
  if (json.length > GZIP_OVER_BYTES) {
    const gz = await gzip(json);
    if (gz) {
      payload = gz;
      headers['Content-Encoding'] = 'gzip';
    }
  }
  const res = await request(`${base}/api/sync`, { method: 'POST', headers, body: payload }, REQUEST_TIMEOUT_MS);
  const data = await readJson(res);
  if (!res.ok) throw httpErrorMessage(res.status, data);
  if (!data || typeof data.cursor !== 'number' || typeof data.changes !== 'object' || data.changes === null) {
    throw new SyncError('Respuesta inesperada del servidor. ¿La dirección apunta a un servidor de Reparo?', 'config');
  }
  return data as unknown as SyncResponse;
}

/* ------------------------------ Meta local ------------------------------- */

interface SyncMeta {
  cursor: number;
  pushedAt: Partial<Record<SyncTable, number>>;
  serverId: string | null;
  serverUrl: string | null;
  /** id → ts de movimientos ya enviados dentro de la ventana MOVEMENT_WINDOW_MS. */
  movements: Record<string, number>;
}

const emptyMeta = (serverUrl: string | null = null): SyncMeta => ({ cursor: 0, pushedAt: {}, serverId: null, serverUrl, movements: {} });

async function loadMeta(): Promise<SyncMeta> {
  const rows = await db.meta.bulkGet(Object.values(META));
  const [cursor, pushedAt, serverId, serverUrl, movements] = rows.map((r) => r?.value);
  return {
    cursor: typeof cursor === 'number' && cursor >= 0 ? cursor : 0,
    pushedAt: pushedAt && typeof pushedAt === 'object' ? { ...(pushedAt as SyncMeta['pushedAt']) } : {},
    serverId: typeof serverId === 'string' ? serverId : null,
    serverUrl: typeof serverUrl === 'string' ? serverUrl : null,
    movements: movements && typeof movements === 'object' ? { ...(movements as Record<string, number>) } : {},
  };
}

async function saveMeta(m: SyncMeta): Promise<void> {
  const floor = Date.now() - MOVEMENT_WINDOW_MS;
  for (const [id, ts] of Object.entries(m.movements)) if (!(ts > floor)) delete m.movements[id];
  await db.meta.bulkPut([
    { key: META.cursor, value: m.cursor },
    { key: META.pushedAt, value: m.pushedAt },
    { key: META.serverId, value: m.serverId },
    { key: META.serverUrl, value: m.serverUrl },
    { key: META.movements, value: m.movements },
  ]);
}

/** Olvida el estado de sincronización: la próxima vez se reenvía y se descarga todo. */
export async function resetSyncState(): Promise<void> {
  await db.meta.bulkDelete(Object.values(META));
}

/* --------------------------- Cambios pendientes -------------------------- */

const isLww = (t: SyncTable) => (LWW_TABLES as readonly string[]).includes(t);
const stampOf = (t: SyncTable, r: Row): number => Number(isLww(t) ? r.updatedAt : r.ts);
const tableOf = (t: SyncTable) => db.table(t) as Table<Row, string>;

async function collectPending(m: SyncMeta, deviceId: string, now: number): Promise<Record<SyncTable, Row[]>> {
  const isLocal = (r: Row) => !r.deviceId || r.deviceId === deviceId;
  const out = {} as Record<SyncTable, Row[]>;
  for (const t of SYNC_TABLES) {
    const wm = m.pushedAt[t];
    const field = isLww(t) ? 'updatedAt' : 'ts';
    let rows: Row[];
    if (wm === undefined) {
      // Primera vez contra este servidor: se envía todo (incluidos datos importados de otros equipos).
      rows = await tableOf(t).toArray();
    } else if (t === 'movements') {
      // Los movimientos pueden registrarse con fecha retroactiva: además del umbral,
      // se revisan los de la ventana reciente que aún no se hayan enviado.
      const floor = Math.min(wm, now - MOVEMENT_WINDOW_MS);
      rows = await tableOf(t)
        .where(field)
        .above(floor)
        .filter((r) => isLocal(r) && (stampOf(t, r) > wm || !(r.id in m.movements)))
        .toArray();
    } else {
      rows = await tableOf(t).where(field).above(wm).filter(isLocal).toArray();
    }
    out[t] = rows.filter((r) => typeof r.id === 'string' && Number.isFinite(stampOf(t, r))).sort((a, b) => stampOf(t, a) - stampOf(t, b));
  }
  return out;
}

/** true si hay cambios locales sin enviar (consulta barata, sin red). */
export async function hasPendingChanges(): Promise<boolean> {
  await dbReady();
  const pending = await collectPending(await loadMeta(), getDeviceId(), Date.now());
  return SYNC_TABLES.some((t) => pending[t].length > 0);
}

function chunk(pending: Record<SyncTable, Row[]>): Changes[] {
  const chunks: Changes[] = [];
  let current: Changes = {};
  let rows = 0;
  let bytes = 0;
  for (const t of SYNC_TABLES) {
    for (const r of pending[t]) {
      const size = JSON.stringify(r).length;
      if (rows > 0 && (rows >= CHUNK_ROWS || bytes + size > CHUNK_BYTES)) {
        chunks.push(current);
        current = {};
        rows = 0;
        bytes = 0;
      }
      (current[t] ??= []).push(r);
      rows++;
      bytes += size;
    }
  }
  chunks.push(current);
  return chunks;
}

function nextWatermarks(m: SyncMeta, pending: Record<SyncTable, Row[]>, deviceId: string, startedAt: number): SyncMeta['pushedAt'] {
  const out: SyncMeta['pushedAt'] = { ...m.pushedAt };
  for (const t of SYNC_TABLES) {
    let wm = m.pushedAt[t] ?? 0;
    for (const r of pending[t]) {
      if (!r.deviceId || r.deviceId === deviceId) wm = Math.max(wm, Math.min(stampOf(t, r), startedAt));
    }
    out[t] = wm;
  }
  return out;
}

/* ---------------------------- Aplicar remotos ---------------------------- */

function lwwWins(a: Row, b: Row): boolean {
  const ua = Number(a.updatedAt);
  const ub = Number(b.updatedAt);
  if (ua !== ub) return ua > ub;
  const da = String(a.deviceId ?? '');
  const dbb = String(b.deviceId ?? '');
  if (da !== dbb) return da > dbb;
  return (Number(a.rev) || 0) > (Number(b.rev) || 0);
}

/** Aplica una página de cambios remotos en una sola transacción. Devuelve cuántas filas cambiaron. */
async function applyRemote(changes: Changes): Promise<number> {
  const incoming = SYNC_TABLES.map((t) => [t, (changes[t] ?? []).filter((r) => r && typeof r.id === 'string' && Number.isFinite(stampOf(t, r)))] as const);
  if (incoming.every(([, rows]) => rows.length === 0)) return 0;
  let applied = 0;
  let clientsTouched = false;

  await db.transaction('rw', [db.clients, db.expenses, db.inventory, db.movements, db.audit, db.photos], async () => {
    for (const [t, rows] of incoming) {
      if (!rows.length) continue;
      const table = tableOf(t);
      const locals = await table.bulkGet(rows.map((r) => r.id));
      const toPut: Row[] = [];
      rows.forEach((r, i) => {
        const local = locals[i];
        if (isLww(t) ? !local || lwwWins(r, local) : !local) toPut.push(r);
      });
      if (!toPut.length) continue;
      if (t === 'clients') {
        // Las fotos no se sincronizan: numFotos refleja las fotos de ESTE dispositivo.
        for (const r of toPut) r.numFotos = await db.photos.where('clientId').equals(r.id).count();
        clientsTouched = true;
      }
      await table.bulkPut(toPut);
      applied += toPut.length;
    }

    // Purgas definitivas hechas en otro dispositivo (llegan como auditoría 'purgar').
    const audits = (incoming.find(([t]) => t === 'audit')?.[1] ?? []) as unknown as AuditEntry[];
    for (const a of audits) {
      const t = a.action === 'purgar' && a.entityId ? ENTITY_TABLE[a.entity] : undefined;
      if (!t || !a.entityId) continue;
      const local = await tableOf(t).get(a.entityId);
      if (!local || Number(local.updatedAt) > a.ts) continue;
      await tableOf(t).delete(a.entityId);
      if (t === 'clients') await db.photos.where('clientId').equals(a.entityId).delete();
      applied++;
    }
  });

  if (clientsTouched) {
    try {
      await recomputeFolioSequence();
    } catch {
      /* el contador de folios se corrige en el próximo alta */
    }
  }
  return applied;
}

/* ------------------------------ Estado UI -------------------------------- */

interface InternalStatus {
  running: boolean;
  error: string | null;
  errorKind: SyncError['kind'] | null;
  lastSyncAt: number | null;
  lastResult: SyncResult | null;
}

let status: InternalStatus = { running: false, error: null, errorKind: null, lastSyncAt: null, lastResult: null };
const statusListeners = new Set<() => void>();

function setStatus(patch: Partial<InternalStatus>): void {
  status = { ...status, ...patch };
  for (const l of [...statusListeners]) l();
}

function subscribeStatus(cb: () => void): () => void {
  statusListeners.add(cb);
  return () => statusListeners.delete(cb);
}

const getStatus = () => status;

function subscribeOnline(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

const getOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

/** Estado de la sincronización para la UI (Ajustes, barra superior…). */
export function useSyncStatus(): SyncStatus {
  const settings = useSettings();
  const s = useSyncExternalStore(subscribeStatus, getStatus, getStatus);
  const online = useSyncExternalStore(subscribeOnline, getOnline, () => true);
  const enabled = !!settings?.syncEnabled && !!parseSyncUrl(settings?.syncUrl);
  const lastSyncAt = Math.max(settings?.lastSyncAt ?? 0, s.lastSyncAt ?? 0) || null;
  return useMemo<SyncStatus>(() => {
    const state: SyncState = !enabled
      ? 'disabled'
      : s.running
        ? 'syncing'
        : !online || s.errorKind === 'offline'
          ? 'offline'
          : s.error
            ? 'error'
            : 'idle';
    return { state, lastSyncAt, error: state === 'error' ? s.error : null, lastResult: s.lastResult };
  }, [enabled, s, online, lastSyncAt]);
}

/* ------------------------------ Sincronizar ------------------------------ */

async function runSync(): Promise<SyncResult> {
  await dbReady();
  const settings = await readSettings();
  const target = parseSyncUrl(settings.syncUrl);
  if (!target) throw new SyncError('Configura la dirección del servidor de sincronización en Ajustes.', 'config');
  const mixed = mixedContentProblem(target.base);
  if (mixed) throw new SyncError(mixed, 'config');
  if (!getOnline()) throw new SyncError('Sin conexión de red. Se sincronizará al volver la conexión.', 'offline');

  const deviceId = getDeviceId();
  let meta = await loadMeta();
  if (meta.serverUrl !== target.base) meta = emptyMeta(target.base);
  let pushed = 0;
  let pulled = 0;

  for (let attempt = 0; attempt < 3; attempt++) {
    const startedAt = Date.now();
    const pending = await collectPending(meta, deviceId, startedAt);
    let res: SyncResponse | null = null;
    let restart = false;

    for (const changes of chunk(pending)) {
      res = await postSync(target.base, target.token, { deviceId, cursor: meta.cursor, changes });
      if (res.resync || (meta.serverId && res.serverId !== meta.serverId)) {
        // El servidor es otro o se restauró: empezar de cero y reenviar todo.
        meta = { ...emptyMeta(target.base), serverId: res.serverId };
        restart = true;
        break;
      }
      meta.serverId = res.serverId;
      pushed += Number(res.accepted) || 0;
      pulled += await applyRemote(res.changes);
      meta.cursor = res.cursor;
      for (const r of changes.movements ?? []) if (r.deviceId === deviceId || !r.deviceId) meta.movements[r.id] = Number(r.ts);
      await saveMeta(meta);
    }
    if (restart) continue;

    // Todos los lotes llegaron: avanzan las marcas de "ya enviado".
    meta.pushedAt = nextWatermarks(meta, pending, deviceId, startedAt);
    await saveMeta(meta);

    for (let page = 0; res?.more && page < MAX_PAGES; page++) {
      res = await postSync(target.base, target.token, { deviceId, cursor: meta.cursor, changes: {} });
      if (res.resync || res.serverId !== meta.serverId) {
        meta = { ...emptyMeta(target.base), serverId: res.serverId };
        restart = true;
        break;
      }
      pulled += await applyRemote(res.changes);
      meta.cursor = res.cursor;
      await saveMeta(meta);
    }
    if (!restart) break;
  }

  const now = Date.now();
  await updateSettings({ lastSyncAt: now });
  return { pushed, pulled };
}

let current: Promise<SyncResult> | null = null;
let queued: Promise<SyncResult> | null = null;

/**
 * Sincroniza ahora. Si ya hay una sincronización en curso, se encola UNA más
 * (para no perder cambios hechos mientras tanto) y se devuelve esa.
 */
export function syncNow(): Promise<SyncResult> {
  if (!current) {
    setStatus({ running: true });
    current = runSync()
      .then((r) => {
        setStatus({ running: false, error: null, errorKind: null, lastSyncAt: Date.now(), lastResult: r });
        return r;
      })
      .catch((err: unknown) => {
        const e = err instanceof SyncError ? err : new SyncError(`No se pudo sincronizar: ${(err as Error)?.message ?? String(err)}`);
        setStatus({ running: false, error: e.message, errorKind: e.kind });
        throw e;
      })
      .finally(() => {
        current = null;
      });
    return current;
  }
  if (!queued) {
    queued = current
      .catch(() => undefined)
      .then(() => {
        queued = null;
        return syncNow();
      });
  }
  return queued;
}

/* ---------------------------- Sincronía automática ----------------------- */

let auto: { refs: number; stop: () => void } | null = null;

function runAutoSync(): () => void {
  let active = false;
  let url = '';
  let kickTimer: ReturnType<typeof setTimeout> | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const run = () => {
    if (active && getOnline()) syncNow().catch(() => undefined);
  };
  const kick = (delay = 0) => {
    clearTimeout(kickTimer);
    kickTimer = setTimeout(run, delay);
  };

  const settingsSub = liveQuery(() => db.settings.get('settings')).subscribe({
    next: (s) => {
      const nextUrl = parseSyncUrl(s?.syncUrl)?.base ?? '';
      const nextActive = !!s?.syncEnabled && !!nextUrl;
      if (nextActive && (!active || nextUrl !== url)) kick(300);
      if (!nextActive && active) setStatus({ error: null, errorKind: null });
      active = nextActive;
      url = nextUrl;
    },
    error: () => undefined,
  });

  // Cambios locales: liveQuery sobre las tablas sincronizadas + espera de 3 s.
  let first = true;
  const changesSub = liveQuery(() => Promise.all(SYNC_TABLES.map((t) => db.table(t).count()))).subscribe({
    next: () => {
      if (first) {
        first = false;
        return;
      }
      if (!active) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        hasPendingChanges()
          .then((yes) => yes && run())
          .catch(() => undefined);
      }, DEBOUNCE_MS);
    },
    error: () => undefined,
  });

  const interval = setInterval(run, AUTO_INTERVAL_MS);
  const onOnline = () => kick(1000);
  const onOffline = () => setStatus({});
  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - (status.lastSyncAt ?? 0) > 30_000) kick(500);
  };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    settingsSub.unsubscribe();
    changesSub.unsubscribe();
    clearInterval(interval);
    clearTimeout(kickTimer);
    clearTimeout(debounceTimer);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/**
 * Inicia la sincronización automática (montar UNA vez, p. ej. en el Shell).
 * Sólo actúa si `settings.syncEnabled` y `syncUrl` están configurados, y
 * reacciona en vivo a cambios en Ajustes: al iniciar, al volver la conexión,
 * al volver a la app, cada 2 minutos y 3 s después de cada cambio local.
 * Devuelve la función para detenerla.
 */
export function startAutoSync(): () => void {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return () => {};
  if (!auto) auto = { refs: 0, stop: runAutoSync() };
  auto.refs++;
  let released = false;
  return () => {
    if (released || !auto) return;
    released = true;
    auto.refs--;
    if (auto.refs <= 0) {
      auto.stop();
      auto = null;
    }
  };
}

/* ------------------------------ Diagnóstico ------------------------------ */

/** Prueba la conexión con un servidor (para el botón "Probar conexión" de Ajustes). */
export async function testSyncServer(url: string): Promise<{ ok: boolean; message: string }> {
  const target = parseSyncUrl(url);
  if (!target) return { ok: false, message: 'La dirección no es válida. Ejemplo: http://192.168.1.10:8787' };
  const mixed = mixedContentProblem(target.base);
  if (mixed) return { ok: false, message: mixed };
  try {
    const res = await request(`${target.base}/api/health`, { method: 'GET' }, TEST_TIMEOUT_MS);
    const health = await readJson(res);
    if (!res.ok || !health || health.ok !== true || (health.service && health.service !== 'reparo')) {
      return { ok: false, message: res.ok ? 'Esa dirección responde, pero no es un servidor de Reparo.' : httpErrorMessage(res.status, health).message };
    }
    if (health.authRequired && !target.token) {
      return { ok: false, message: 'El servidor requiere un token. Agrega ?token=TU_TOKEN al final de la dirección.' };
    }
    const headers: Record<string, string> = {};
    if (target.token) headers.Authorization = `Bearer ${target.token}`;
    const st = await request(`${target.base}/api/sync/status`, { method: 'GET', headers }, TEST_TIMEOUT_MS);
    const info = await readJson(st);
    if (!st.ok) return { ok: false, message: httpErrorMessage(st.status, info).message };

    const devices = Array.isArray(info?.devices) ? info.devices.length : 0;
    const rows = info?.rows && typeof info.rows === 'object' ? Object.values(info.rows as Record<string, number>).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
    let message = `Conectado a Reparo ${String(health.version ?? '')}`.trim() + `. ${devices} ${devices === 1 ? 'dispositivo' : 'dispositivos'} · ${rows.toLocaleString('es')} registros en el servidor.`;
    const skew = typeof health.time === 'number' ? Math.abs(health.time - Date.now()) : 0;
    if (skew > 2 * 60 * 1000) {
      message += ` Atención: el reloj de este dispositivo difiere ${Math.round(skew / 60000)} min del servidor; corrige la hora para que los cambios se ordenen bien.`;
    }
    return { ok: true, message };
  } catch (err) {
    return { ok: false, message: err instanceof SyncError ? err.message : 'No se pudo conectar con el servidor.' };
  }
}

/**
 * Si la app se abrió desde un servidor de Reparo (p. ej. http://192.168.1.10:8787),
 * devuelve esa dirección para sugerirla en Ajustes. null si no aplica.
 */
export async function detectLocalServer(): Promise<string | null> {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
  try {
    const res = await request(`${location.origin}/api/health`, { method: 'GET' }, 3000);
    const j = await readJson(res);
    return res.ok && j?.service === 'reparo' ? location.origin : null;
  } catch {
    return null;
  }
}

/** Marca de tiempo de la última sincronización correcta (null si nunca). */
export function getLastSyncAt(): Timestamp | null {
  return status.lastSyncAt;
}

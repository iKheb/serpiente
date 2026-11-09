/* ==========================================================================
   Nube (Supabase) — motor de sincronización
   --------------------------------------------------------------------------
   Modelo remoto: una tabla genérica `reparo_rows(user_id, tbl, id, data,
   updated_at, device_id, seq)`. `seq` lo asigna un trigger en cada escritura,
   así que "lo nuevo desde mi cursor" = `seq > cursor order by seq`.

   Ciclo (runCloudCycle):
     1. Calcula lo pendiente local (ANTES de bajar, para no reenviar lo que llega).
     2. Pull paginado (1000) y aplica con LWW SIN generar auditoría.
     3. Push en lotes de 500 vía rpc('reparo_push') (LWW en el servidor).
     4. Avanza marcas (meta) y vuelve a bajar lo que haya entrado mientras tanto.

   - clients/expenses/inventory: LWW por updatedAt (el borrado lógico es un
     cambio más). movements/audit: sólo se insertan (append-only).
   - Ajustes del negocio: fila tbl='settings', id='negocio' con un subconjunto
     de Settings (sin tema, notificaciones ni sync).
   - Fotos y notificaciones NO viajan. `numFotos` remoto nunca pisa el local.
   - Purgas definitivas: viajan como auditoría 'purgar' y se replican.
   ========================================================================== */
import type { Table } from 'dexie';
import { db, dbReady, getDeviceId, readSettings, recomputeFolioSequence } from '@/data/db';
import { defaultSettings, withSettingsDefaults } from '@/data/defaults';
import { setCachedSettings } from '@/data/settings-cache';
import type { AuditEntry, Settings } from '@/data/types';
import type { CloudClient } from './client';
import { CloudError, toCloudError } from './errors';

/* ------------------------------ Constantes ------------------------------- */

export const LWW_TABLES = ['clients', 'expenses', 'inventory'] as const;
export const APPEND_TABLES = ['movements', 'audit'] as const;
export const CLOUD_TABLES = [...LWW_TABLES, ...APPEND_TABLES] as const;
export type CloudTable = (typeof CLOUD_TABLES)[number];

export const SETTINGS_TBL = 'settings';
export const SETTINGS_ID = 'negocio';

/** Campos de Settings que se comparten entre dispositivos. */
export const SHARED_SETTINGS_KEYS = [
  'businessName',
  'ownerName',
  'businessPhone',
  'businessAddress',
  'receiptFooter',
  'phoneCountryCode',
  'currency',
  'locale',
  'weekStartsOn',
  'monthlyGoalCents',
] as const satisfies readonly (keyof Settings)[];
type SharedSettings = Pick<Settings, (typeof SHARED_SETTINGS_KEYS)[number]> & { updatedAt: number };

export const PUSH_BATCH = 500;
export const PULL_PAGE = 1000;
const MAX_PULL_PAGES = 2000;
/** Ventana para detectar movimientos/auditoría con fecha retroactiva aún no enviados. */
const APPEND_WINDOW_MS = 60 * 24 * 3600 * 1000;

export const META = {
  account: 'cloudAccount',
  cursor: 'cloudCursor',
  pushedAt: 'cloudPushedAt',
  pushedIds: 'cloudPushedIds',
  settings: 'cloudSettings',
  lastSyncAt: 'cloudLastSyncAt',
} as const;

const ENTITY_TABLE: Record<string, CloudTable | undefined> = { cliente: 'clients', gasto: 'expenses', inventario: 'inventory' };

type Row = Record<string, unknown> & { id: string; deviceId?: string };

/** Fila tal como viaja a/desde Supabase. */
export interface RemoteRow {
  tbl: string;
  id: string;
  data: Record<string, unknown>;
  updated_at: number;
  device_id: string | null;
  seq?: number;
}

/* -------------------------------- Meta ----------------------------------- */

interface CloudMeta {
  account: string | null;
  cursor: number;
  pushedAt: Partial<Record<CloudTable, number>>;
  /** id → ts de filas append-only ya enviadas dentro de la ventana. */
  pushedIds: Record<string, number>;
  /** Últimos ajustes compartidos conocidos (enviados o recibidos). */
  settings: { sig: string; updatedAt: number } | null;
}

const emptyMeta = (account: string | null): CloudMeta => ({ account, cursor: 0, pushedAt: {}, pushedIds: {}, settings: null });

async function loadMeta(): Promise<CloudMeta> {
  const rows = await db.meta.bulkGet([META.account, META.cursor, META.pushedAt, META.pushedIds, META.settings]);
  const [account, cursor, pushedAt, pushedIds, settings] = rows.map((r) => r?.value);
  const s = settings as CloudMeta['settings'];
  return {
    account: typeof account === 'string' ? account : null,
    cursor: typeof cursor === 'number' && cursor >= 0 ? cursor : 0,
    pushedAt: pushedAt && typeof pushedAt === 'object' ? { ...(pushedAt as CloudMeta['pushedAt']) } : {},
    pushedIds: pushedIds && typeof pushedIds === 'object' ? { ...(pushedIds as Record<string, number>) } : {},
    settings: s && typeof s.sig === 'string' && typeof s.updatedAt === 'number' ? s : null,
  };
}

async function saveMeta(m: CloudMeta): Promise<void> {
  const floor = Date.now() - APPEND_WINDOW_MS;
  for (const [id, ts] of Object.entries(m.pushedIds)) if (!(ts > floor)) delete m.pushedIds[id];
  await db.meta.bulkPut([
    { key: META.account, value: m.account },
    { key: META.cursor, value: m.cursor },
    { key: META.pushedAt, value: m.pushedAt },
    { key: META.pushedIds, value: m.pushedIds },
    { key: META.settings, value: m.settings },
  ]);
}

/** Olvida cursores y marcas: la próxima sincronización baja y revisa todo. */
export async function resetCloudState(): Promise<void> {
  await db.meta.bulkDelete([META.account, META.cursor, META.pushedAt, META.pushedIds, META.settings, META.lastSyncAt]);
}

/* ------------------------------ Utilidades ------------------------------- */

const isLww = (t: string): t is (typeof LWW_TABLES)[number] => (LWW_TABLES as readonly string[]).includes(t);
const isCloudTable = (t: string): t is CloudTable => (CLOUD_TABLES as readonly string[]).includes(t);
const stampOf = (t: CloudTable, r: Row): number => Number(isLww(t) ? r.updatedAt : r.ts);
const tableOf = (t: CloudTable) => db.table(t) as Table<Row, string>;
const keyOf = (tbl: string, id: string) => `${tbl}:${id}`;

/** JSON con claves ordenadas (jsonb no conserva el orden). */
export function stableStringify(v: unknown, omit?: ReadonlySet<string>): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map((x) => stableStringify(x)).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined && !omit?.has(k))
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

const CLIENT_OMIT = new Set(['numFotos']);
const sameContent = (t: CloudTable, a: Row, b: Row) => stableStringify(a, t === 'clients' ? CLIENT_OMIT : undefined) === stableStringify(b, t === 'clients' ? CLIENT_OMIT : undefined);

export function sharedSettingsOf(s: Settings): Omit<SharedSettings, 'updatedAt'> {
  const out = {} as Record<string, unknown>;
  for (const k of SHARED_SETTINGS_KEYS) out[k] = s[k];
  return out as Omit<SharedSettings, 'updatedAt'>;
}

const settingsSig = (s: Settings) => stableStringify(sharedSettingsOf(s));
const DEFAULT_SETTINGS_SIG = settingsSig(defaultSettings(0));

/* ---------------------------- Pendientes locales ------------------------- */

interface Pending {
  rows: Record<CloudTable, Row[]>;
}

async function collectPending(m: CloudMeta, deviceId: string, now: number): Promise<Pending> {
  const isLocal = (r: Row) => !r.deviceId || r.deviceId === deviceId;
  const rows = {} as Record<CloudTable, Row[]>;
  for (const t of CLOUD_TABLES) {
    const wm = m.pushedAt[t];
    const field = isLww(t) ? 'updatedAt' : 'ts';
    let list: Row[];
    if (wm === undefined) {
      // Primera vez con esta cuenta: se considera todo (incluidos datos importados).
      list = await tableOf(t).toArray();
    } else if (!isLww(t)) {
      const floor = Math.min(wm, now - APPEND_WINDOW_MS);
      list = await tableOf(t)
        .where(field)
        .above(floor)
        .filter((r) => isLocal(r) && (stampOf(t, r) > wm || !(r.id in m.pushedIds)))
        .toArray();
    } else {
      list = await tableOf(t).where(field).above(wm).filter(isLocal).toArray();
    }
    rows[t] = list.filter((r) => typeof r.id === 'string' && Number.isFinite(stampOf(t, r))).sort((a, b) => stampOf(t, a) - stampOf(t, b));
  }
  return { rows };
}

interface LocalSettingsState {
  local: Settings;
  sig: string;
  /** Hay cambios del negocio sin enviar. */
  changed: boolean;
  /** Sin historial de ajustes con esta cuenta. */
  firstTime: boolean;
  /** Marca para LWW de la versión local. */
  stamp: number;
}

async function localSettingsState(m: CloudMeta): Promise<LocalSettingsState> {
  const local = await readSettings();
  const sig = settingsSig(local);
  const firstTime = m.settings === null;
  const changed = firstTime ? sig !== DEFAULT_SETTINGS_SIG : sig !== m.settings!.sig;
  const stamp = Math.max(local.updatedAt || 0, (m.settings?.updatedAt ?? 0) + 1);
  return { local, sig, changed, firstTime, stamp };
}

/** true si hay cambios locales sin enviar (sin red). */
export async function hasCloudPending(): Promise<boolean> {
  await dbReady();
  const meta = await loadMeta();
  const p = await collectPending(meta, getDeviceId(), Date.now());
  return (await localSettingsState(meta)).changed || CLOUD_TABLES.some((t) => p.rows[t].length > 0);
}

/* ---------------------------- Aplicar remotos ---------------------------- */

interface ApplyContext {
  /** tbl:id → updated_at remoto visto en este ciclo. */
  seen: Map<string, number>;
  meta: CloudMeta;
}

function remoteToRow(r: RemoteRow): Row | null {
  if (!r || typeof r.id !== 'string' || !r.data || typeof r.data !== 'object') return null;
  return { ...r.data, id: r.id } as Row;
}

async function applySettings(r: RemoteRow, ctx: ApplyContext): Promise<boolean> {
  const st = await localSettingsState(ctx.meta);
  const incoming = r.data as Partial<SharedSettings>;
  const patch: Partial<Settings> = {};
  for (const k of SHARED_SETTINGS_KEYS) {
    if (incoming[k] !== undefined) (patch as Record<string, unknown>)[k] = incoming[k];
  }
  const remoteSig = settingsSig({ ...st.local, ...patch });
  const remoteStamp = Number(r.updated_at) || 0;

  let remoteWins: boolean;
  if (!st.changed || st.sig === remoteSig) remoteWins = true;
  else if (st.firstTime) {
    // Primera vez en este dispositivo con esta cuenta: si la nube trae los
    // valores de fábrica y aquí ya hay datos reales, ganan los locales.
    remoteWins = remoteSig !== DEFAULT_SETTINGS_SIG && remoteStamp >= st.local.updatedAt;
  } else remoteWins = remoteStamp >= st.stamp;

  if (!remoteWins) return false;
  ctx.meta.settings = { sig: remoteSig, updatedAt: remoteStamp };
  if (remoteSig === st.sig) return false;
  // Escritura directa: NO pasa por updateSettings, así que no genera auditoría.
  const saved = await db.transaction('rw', db.settings, async () => {
    const fresh = withSettingsDefaults(await db.settings.get('settings'));
    const next: Settings = { ...fresh, ...patch, id: 'settings', updatedAt: Math.max(fresh.updatedAt || 0, remoteStamp) };
    await db.settings.put(next);
    return next;
  });
  setCachedSettings(saved);
  return true;
}

/** Aplica una página de filas remotas (LWW, sin auditoría). Devuelve cuántas cambiaron algo. */
async function applyRemote(page: RemoteRow[], ctx: ApplyContext): Promise<number> {
  let applied = 0;
  const byTable = new Map<CloudTable, Row[]>();
  for (const r of page) {
    if (r.tbl === SETTINGS_TBL) {
      if (r.id === SETTINGS_ID && (await applySettings(r, ctx))) applied++;
      continue;
    }
    if (!isCloudTable(r.tbl)) continue;
    const row = remoteToRow(r);
    if (!row || !Number.isFinite(stampOf(r.tbl, row))) continue;
    ctx.seen.set(keyOf(r.tbl, r.id), Number(r.updated_at) || stampOf(r.tbl, row));
    const list = byTable.get(r.tbl) ?? [];
    // Dentro de una página, la última versión de un id es la que vale.
    const i = list.findIndex((x) => x.id === row.id);
    if (i >= 0) list[i] = row;
    else list.push(row);
    byTable.set(r.tbl, list);
  }
  if (!byTable.size) return applied;

  let clientsTouched = false;
  await db.transaction('rw', [db.clients, db.expenses, db.inventory, db.movements, db.audit, db.photos], async () => {
    for (const t of CLOUD_TABLES) {
      const rows = byTable.get(t);
      if (!rows?.length) continue;
      const table = tableOf(t);
      const locals = await table.bulkGet(rows.map((r) => r.id));
      const toPut: Row[] = [];
      rows.forEach((r, i) => {
        const local = locals[i];
        if (!local) toPut.push(r);
        else if (isLww(t) && stampOf(t, r) >= stampOf(t, local) && !sameContent(t, r, local)) toPut.push(r);
      });
      if (!toPut.length) continue;
      if (t === 'clients') {
        // Las fotos no viajan: numFotos refleja las fotos guardadas en ESTE dispositivo.
        for (const r of toPut) r.numFotos = await db.photos.where('clientId').equals(r.id).count();
        clientsTouched = true;
      }
      await table.bulkPut(toPut);
      applied += toPut.length;
    }

    // Purgas definitivas hechas en otro dispositivo.
    for (const a of (byTable.get('audit') ?? []) as unknown as AuditEntry[]) {
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
      /* se corrige en la próxima alta */
    }
  }
  return applied;
}

/* --------------------------------- Red ----------------------------------- */

async function pullPage(client: CloudClient, cursor: number): Promise<RemoteRow[]> {
  const { data, error } = await client
    .from('reparo_rows')
    .select('tbl,id,data,updated_at,device_id,seq')
    .gt('seq', cursor)
    .order('seq', { ascending: true })
    .limit(PULL_PAGE);
  if (error) throw toCloudError(error, 'No se pudieron descargar los cambios.');
  return ((data ?? []) as RemoteRow[]).map((r) => ({ ...r, updated_at: Number(r.updated_at), seq: Number(r.seq) }));
}

async function pushBatch(client: CloudClient, rows: RemoteRow[]): Promise<number> {
  const { data, error } = await client.rpc('reparo_push', { rows });
  if (error) throw toCloudError(error, 'No se pudieron enviar los cambios.');
  return Number(data) || 0;
}

/* -------------------------------- Ciclo ---------------------------------- */

export interface CloudSyncResult {
  pushed: number;
  pulled: number;
}

async function pullAll(client: CloudClient, ctx: ApplyContext): Promise<number> {
  let pulled = 0;
  for (let i = 0; i < MAX_PULL_PAGES; i++) {
    const page = await pullPage(client, ctx.meta.cursor);
    if (!page.length) break;
    pulled += await applyRemote(page, ctx);
    ctx.meta.cursor = Math.max(ctx.meta.cursor, ...page.map((r) => r.seq ?? 0));
    await saveMeta(ctx.meta);
    if (page.length < PULL_PAGE) break;
  }
  return pulled;
}

/**
 * Una sincronización completa (pull → push → pull) para la cuenta `userId`
 * del proyecto `projectUrl`. Si la cuenta cambió, reinicia cursores.
 */
export async function runCloudCycle(client: CloudClient, account: { projectUrl: string; userId: string }): Promise<CloudSyncResult> {
  await dbReady();
  const accountKey = `${account.projectUrl}|${account.userId}`;
  let meta = await loadMeta();
  if (meta.account !== accountKey) {
    meta = emptyMeta(accountKey);
    await saveMeta(meta);
  }
  const deviceId = getDeviceId();
  const startedAt = Date.now();
  const pending = await collectPending(meta, deviceId, startedAt);
  const ctx: ApplyContext = { seen: new Map(), meta };

  // 1) Bajar primero: lo que llega puede anular lo pendiente (LWW).
  let pulled = await pullAll(client, ctx);

  // 2) Subir lo local que sigue siendo lo más nuevo.
  const ids = CLOUD_TABLES.flatMap((t) => pending.rows[t].map((r) => [t, r.id] as const));
  const fresh = new Map<string, Row>();
  for (const t of CLOUD_TABLES) {
    const list = pending.rows[t];
    if (!list.length) continue;
    const now = await tableOf(t).bulkGet(list.map((r) => r.id));
    now.forEach((r) => r && fresh.set(keyOf(t, r.id), r));
  }
  const out: RemoteRow[] = [];
  for (const [t, id] of ids) {
    const r = fresh.get(keyOf(t, id));
    if (!r) continue;
    const seenStamp = ctx.seen.get(keyOf(t, id));
    if (seenStamp !== undefined && (!isLww(t) || seenStamp >= stampOf(t, r))) continue;
    const data: Record<string, unknown> = { ...r };
    out.push({ tbl: t, id, data, updated_at: stampOf(t, r), device_id: typeof r.deviceId === 'string' ? r.deviceId : null });
  }
  const st = await localSettingsState(meta);
  const settingsToPush = st.changed ? { sig: st.sig, data: { ...sharedSettingsOf(st.local), updatedAt: st.stamp } } : null;
  if (settingsToPush) {
    out.push({ tbl: SETTINGS_TBL, id: SETTINGS_ID, data: settingsToPush.data, updated_at: settingsToPush.data.updatedAt, device_id: deviceId });
  }

  for (let i = 0; i < out.length; i += PUSH_BATCH) {
    await pushBatch(client, out.slice(i, i + PUSH_BATCH));
  }

  // 3) Marcas de "ya enviado" (sólo si todos los lotes llegaron).
  for (const t of CLOUD_TABLES) {
    let wm = meta.pushedAt[t] ?? 0;
    for (const r of pending.rows[t]) {
      if (!r.deviceId || r.deviceId === deviceId) wm = Math.max(wm, Math.min(stampOf(t, r), startedAt));
      if (!isLww(t)) meta.pushedIds[r.id] = stampOf(t, r);
    }
    meta.pushedAt[t] = wm;
  }
  if (settingsToPush) meta.settings = { sig: settingsToPush.sig, updatedAt: settingsToPush.data.updatedAt };
  await saveMeta(meta);

  // 4) Lo que haya entrado mientras tanto (incluye el eco de lo enviado).
  if (out.length) pulled += await pullAll(client, { seen: new Map(), meta });

  await db.meta.put({ key: META.lastSyncAt, value: Date.now() });
  return { pushed: out.length, pulled };
}

export async function readLastCloudSyncAt(): Promise<number | null> {
  const row = await db.meta.get(META.lastSyncAt);
  return typeof row?.value === 'number' ? row.value : null;
}

export { CloudError };

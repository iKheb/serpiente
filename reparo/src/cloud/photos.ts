/* ==========================================================================
   Nube (Supabase) — fotos de evidencia
   --------------------------------------------------------------------------
   - Metadatos: fila tbl='photos' en reparo_rows (LWW por updated_at) con
     { id, clientId, kind, caption, ts, width, height, deletedAt, deviceId, updatedAt }.
   - Archivos: bucket privado 'reparo-fotos' (supabase/storage.sql):
       `${userId}/${photoId}.jpg` (completa) y `${userId}/${photoId}_t.jpg` (miniatura);
       .webp/.png si el Blob es de ese tipo (la fila lleva `ext`/`thumbExt`).
     Se suben ANTES de enviar la fila; si falla, la foto sigue pendiente y se
     reintenta en la siguiente sincronización.
   - Al bajar una foto que no existe aquí: primero todas las miniaturas (la foto
     ya se ve) y luego las imágenes completas, 3 a la vez. numFotos se recalcula
     sin auditoría.
   - Borrados: lápida local (deleteClientPhoto) o foto conocida que desapareció
     (purga del cliente) → fila con deletedAt + borrado en storage (cola si falla).
     Lápida remota → se borra la foto local.
   ========================================================================== */
import { db } from '@/data/db';
import { clearPhotoTombstones, readPhotoTombstones, type StoredPhoto } from '@/data/photos';
import type { PhotoKind } from '@/data/types';
import type { CloudClient } from './client';
import { toCloudError } from './errors';

export const PHOTO_BUCKET = 'reparo-fotos';
export const PHOTOS_TBL = 'photos';
const CONCURRENCY = 3;

export const PHOTO_META = {
  /** id → { s: marca enviada/recibida, f: archivos ya están en storage }. */
  state: 'cloudPhotoState',
  /** id → metadatos remotos pendientes de descargar (stage thumb|full). */
  downloads: 'cloudPhotoDownloads',
  /** ids cuyos archivos hay que borrar de storage (reintentos). */
  removals: 'cloudPhotoRemovals',
} as const;

export interface PhotoMetaRow {
  id: string;
  clientId: string;
  kind: PhotoKind;
  caption: string;
  ts: number;
  width: number;
  height: number;
  deletedAt: number | null;
  deviceId: string;
  updatedAt: number;
  /** Extensión de los archivos en storage (por defecto 'jpg'). */
  ext?: PhotoExt;
  thumbExt?: PhotoExt;
}

export interface PhotoProgress {
  phase: 'upload' | 'download';
  done: number;
  total: number;
}
export type ProgressFn = (p: PhotoProgress | null) => void;

type StateMap = Record<string, { s: number; f: boolean }>;
type DownloadMap = Record<string, PhotoMetaRow & { stage: 'thumb' | 'full' }>;

export type PhotoExt = 'jpg' | 'webp' | 'png';
const EXT_TYPE: Record<PhotoExt, string> = { jpg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
/** Extensión según el tipo del Blob (el bucket sólo acepta JPEG, WebP y PNG). */
export function extFor(b: Blob): PhotoExt {
  return b.type === 'image/webp' ? 'webp' : b.type === 'image/png' ? 'png' : 'jpg';
}
const asExt = (v: unknown): PhotoExt => (v === 'webp' || v === 'png' ? v : 'jpg');
export const photoPath = (userId: string, id: string, thumb = false, ext: PhotoExt = 'jpg') => `${userId}/${id}${thumb ? '_t' : ''}.${ext}`;
const stampOf = (p: StoredPhoto) => Number(p.updatedAt ?? p.ts) || 0;

async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const v = (await db.meta.get(key))?.value;
  return v && typeof v === 'object' ? ({ ...(v as object) } as T) : fallback;
}
const putMeta = (key: string, value: unknown) => db.meta.put({ key, value });

export async function resetPhotoState(): Promise<void> {
  await db.meta.bulkDelete(Object.values(PHOTO_META));
}

function toMetaRow(p: StoredPhoto): PhotoMetaRow {
  return {
    id: p.id,
    clientId: p.clientId,
    kind: p.kind,
    caption: p.caption ?? '',
    ts: p.ts,
    width: p.width ?? 0,
    height: p.height ?? 0,
    deletedAt: null,
    deviceId: p.deviceId ?? '',
    updatedAt: stampOf(p),
    ext: extFor(p.blob),
    thumbExt: extFor(p.thumb),
  };
}

/** Recalcula numFotos de esos clientes sin tocar updatedAt (no se reenvían ni auditan). */
async function recount(clientIds: Iterable<string>): Promise<void> {
  const ids = [...new Set(clientIds)];
  if (!ids.length) return;
  await db.transaction('rw', db.clients, db.photos, async () => {
    for (const id of ids) {
      const c = await db.clients.get(id);
      if (!c) continue;
      const n = await db.photos.where('clientId').equals(id).count();
      if (c.numFotos !== n) await db.clients.update(id, { numFotos: n });
    }
  });
}

/** true si hay fotos locales sin enviar, borrados o descargas pendientes. */
export async function hasPhotoWork(): Promise<boolean> {
  const [state, tomb, downloads, removals] = await Promise.all([
    getMeta<StateMap>(PHOTO_META.state, {}),
    readPhotoTombstones(),
    getMeta<DownloadMap>(PHOTO_META.downloads, {}),
    getMeta<Record<string, true>>(PHOTO_META.removals, {}),
  ]);
  if (Object.keys(tomb).length || Object.keys(downloads).length || Object.keys(removals).length) return true;
  let pending = false;
  const localIds = new Set<string>();
  await db.photos.each((p) => {
    localIds.add(p.id);
    const st = state[p.id];
    if (!st || !st.f || stampOf(p) > st.s) pending = true;
  });
  return pending || Object.keys(state).some((id) => !localIds.has(id));
}

/* ------------------------------ Aplicar remotas -------------------------- */

/** Aplica filas remotas de fotos: lápidas borran; metadatos nuevos se encolan para descargar. */
export async function applyRemotePhotoRows(rows: { id: string; data: Record<string, unknown>; updated_at: number }[]): Promise<number> {
  if (!rows.length) return 0;
  const state = await getMeta<StateMap>(PHOTO_META.state, {});
  const downloads = await getMeta<DownloadMap>(PHOTO_META.downloads, {});
  const tomb = await readPhotoTombstones();
  const touched: string[] = [];
  let applied = 0;

  for (const r of rows) {
    const d = r.data as Partial<PhotoMetaRow>;
    const stamp = Number(r.updated_at) || Number(d.updatedAt) || 0;
    if (!d || typeof d.clientId !== 'string') continue;
    const local = (await db.photos.get(r.id)) as StoredPhoto | undefined;
    if (d.deletedAt) {
      delete downloads[r.id];
      delete state[r.id];
      if (local) {
        await db.photos.delete(r.id);
        touched.push(local.clientId);
        applied++;
      }
      continue;
    }
    if (tomb[r.id]) continue; // borrada aquí: se enviará la lápida
    if (local) {
      if (stamp > stampOf(local) && (local.caption !== d.caption || local.kind !== d.kind)) {
        await db.photos.update(r.id, { caption: String(d.caption ?? ''), kind: (d.kind ?? local.kind) as PhotoKind, updatedAt: stamp } as Partial<StoredPhoto>);
        applied++;
      }
      state[r.id] = { s: Math.max(stamp, state[r.id]?.s ?? 0), f: state[r.id]?.f ?? true };
      continue;
    }
    // Ya la teníamos y desapareció aquí (p. ej. purga del cliente): se enviará su lápida.
    const known = state[r.id];
    if (known && stamp <= known.s) continue;
    const prev = downloads[r.id];
    downloads[r.id] = {
      id: r.id,
      clientId: d.clientId,
      kind: (d.kind ?? 'ingreso') as PhotoKind,
      caption: String(d.caption ?? ''),
      ts: Number(d.ts) || stamp,
      width: Number(d.width) || 0,
      height: Number(d.height) || 0,
      deletedAt: null,
      deviceId: String(d.deviceId ?? ''),
      updatedAt: stamp,
      ext: asExt(d.ext),
      thumbExt: asExt(d.thumbExt),
      stage: prev?.stage ?? 'thumb',
    };
  }
  await putMeta(PHOTO_META.state, state);
  await putMeta(PHOTO_META.downloads, downloads);
  await recount(touched);
  return applied;
}

/* ------------------------------- Subir ----------------------------------- */

async function pool<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) await fn(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

export interface PhotoPushPlan {
  rows: { tbl: string; id: string; data: Record<string, unknown>; updated_at: number; device_id: string | null }[];
  /** Llamar tras enviar las filas con éxito. */
  commit(): Promise<void>;
  /** Errores de subida (se reintentan la próxima vez). */
  failures: number;
  /** Mensaje si ninguna foto pudo subirse por un problema general. */
  error: string | null;
}

/**
 * Sube los archivos de las fotos nuevas/no subidas y arma las filas a enviar
 * (incluidas lápidas). `seen` = ids con versión remota igual o más nueva ya vista.
 */
export async function preparePhotoPush(client: CloudClient, userId: string, onProgress?: ProgressFn): Promise<PhotoPushPlan> {
  const bucket = client.storage.from(PHOTO_BUCKET);
  const state = await getMeta<StateMap>(PHOTO_META.state, {});
  const downloads = await getMeta<DownloadMap>(PHOTO_META.downloads, {});
  const tomb = await readPhotoTombstones();
  const localIds = new Set<string>();
  const pending: StoredPhoto[] = [];
  await db.photos.each((p) => {
    localIds.add(p.id);
    const st = state[p.id];
    if (!st || !st.f || stampOf(p) > st.s) pending.push(p);
  });

  // Lápidas: explícitas + fotos ya sincronizadas que desaparecieron (purga del cliente).
  const now = Date.now();
  const deletions = new Map<string, { clientId: string; deletedAt: number }>();
  for (const [id, t] of Object.entries(tomb)) deletions.set(id, t);
  for (const id of Object.keys(state)) if (!localIds.has(id) && !deletions.has(id) && !downloads[id]) deletions.set(id, { clientId: '', deletedAt: now });

  const toUpload = pending.filter((p) => !state[p.id]?.f);
  const uploaded = new Set<string>();
  let failures = 0;
  let firstError: unknown = null;
  let done = 0;
  if (toUpload.length) onProgress?.({ phase: 'upload', done: 0, total: toUpload.length });
  await pool(toUpload, async (p) => {
    try {
      const te = extFor(p.thumb);
      const fe = extFor(p.blob);
      const t = await bucket.upload(photoPath(userId, p.id, true, te), p.thumb, { upsert: true, contentType: EXT_TYPE[te], cacheControl: '31536000' });
      if (t.error) throw t.error;
      const f = await bucket.upload(photoPath(userId, p.id, false, fe), p.blob, { upsert: true, contentType: EXT_TYPE[fe], cacheControl: '31536000' });
      if (f.error) throw f.error;
      uploaded.add(p.id);
    } catch (err) {
      failures++;
      firstError ??= err;
    } finally {
      onProgress?.({ phase: 'upload', done: ++done, total: toUpload.length });
    }
  });
  // Si fallan, los datos igual se sincronizan; las fotos se reintentan la próxima vez.
  const error = failures && firstError ? toCloudError(firstError, 'No se pudieron subir algunas fotos.').message : null;

  const sendable = pending.filter((p) => state[p.id]?.f || uploaded.has(p.id));
  const rows: PhotoPushPlan['rows'] = sendable.map((p) => ({ tbl: PHOTOS_TBL, id: p.id, data: { ...toMetaRow(p) }, updated_at: stampOf(p), device_id: p.deviceId || null }));
  for (const [id, t] of deletions) {
    rows.push({ tbl: PHOTOS_TBL, id, data: { id, clientId: t.clientId, deletedAt: t.deletedAt, updatedAt: t.deletedAt }, updated_at: t.deletedAt, device_id: null });
  }

  return {
    rows,
    failures,
    error,
    async commit() {
      const st = await getMeta<StateMap>(PHOTO_META.state, {});
      for (const p of sendable) st[p.id] = { s: stampOf(p), f: true };
      for (const p of pending) if (!uploaded.has(p.id) && !st[p.id]?.f) delete st[p.id];
      for (const id of deletions.keys()) delete st[id];
      await putMeta(PHOTO_META.state, st);
      await clearPhotoTombstones([...deletions.keys()].filter((id) => tomb[id]));
      if (deletions.size) {
        const removals = await getMeta<Record<string, true>>(PHOTO_META.removals, {});
        for (const id of deletions.keys()) removals[id] = true;
        await putMeta(PHOTO_META.removals, removals);
      }
      await processRemovals(client, userId);
    },
  };
}

/** Borra de storage los archivos de fotos eliminadas (lo que falle queda en cola). */
export async function processRemovals(client: CloudClient, userId: string): Promise<void> {
  const removals = await getMeta<Record<string, true>>(PHOTO_META.removals, {});
  const ids = Object.keys(removals);
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    try {
      // Se desconoce la extensión exacta de una foto ya borrada: se piden todas las variantes.
      const paths = part.flatMap((id) => (['jpg', 'webp', 'png'] as const).flatMap((e) => [photoPath(userId, id, false, e), photoPath(userId, id, true, e)]));
      const { error } = await client.storage.from(PHOTO_BUCKET).remove(paths);
      if (error) throw error;
      for (const id of part) delete removals[id];
    } catch {
      /* se reintenta en la próxima sincronización */
    }
  }
  await putMeta(PHOTO_META.removals, removals);
}

/* ------------------------------- Bajar ----------------------------------- */

/** Descarga las fotos encoladas: primero miniaturas, luego completas. Devuelve cuántas se guardaron. */
export async function runPhotoDownloads(client: CloudClient, userId: string, onProgress?: ProgressFn): Promise<number> {
  const bucket = client.storage.from(PHOTO_BUCKET);
  let saved = 0;
  for (const stage of ['thumb', 'full'] as const) {
    const queue = Object.values(await getMeta<DownloadMap>(PHOTO_META.downloads, {})).filter((d) => d.stage === stage);
    if (!queue.length) continue;
    const thumbsTotal = stage === 'thumb' ? queue.length : 0;
    let done = 0;
    const total = queue.length;
    onProgress?.({ phase: 'download', done: 0, total });
    await pool(queue, async (d) => {
      try {
        const res = await bucket.download(stage === 'thumb' ? photoPath(userId, d.id, true, d.thumbExt ?? 'jpg') : photoPath(userId, d.id, false, d.ext ?? 'jpg'));
        if (res.error || !res.data) throw res.error ?? new Error('vacío');
        const blob = res.data;
        const changed = await db.transaction('rw', [db.photos, db.meta], async () => {
          const downloads = await getMeta<DownloadMap>(PHOTO_META.downloads, {});
          const cur = downloads[d.id];
          if (!cur) return false; // llegó una lápida mientras tanto
          const tomb = await readPhotoTombstones();
          if (tomb[d.id]) {
            delete downloads[d.id];
            await putMeta(PHOTO_META.downloads, downloads);
            return false;
          }
          const existing = (await db.photos.get(d.id)) as StoredPhoto | undefined;
          const photo: StoredPhoto = {
            id: d.id,
            clientId: cur.clientId,
            kind: cur.kind,
            caption: cur.caption,
            ts: cur.ts,
            width: cur.width,
            height: cur.height,
            deviceId: cur.deviceId,
            updatedAt: cur.updatedAt,
            thumb: stage === 'thumb' ? blob : (existing?.thumb ?? blob),
            blob: stage === 'full' ? blob : (existing?.blob ?? blob),
          };
          await db.photos.put(photo);
          if (stage === 'thumb') downloads[d.id] = { ...cur, stage: 'full' };
          else delete downloads[d.id];
          await putMeta(PHOTO_META.downloads, downloads);
          const state = await getMeta<StateMap>(PHOTO_META.state, {});
          state[d.id] = { s: cur.updatedAt, f: true };
          await putMeta(PHOTO_META.state, state);
          return !existing;
        });
        if (changed) {
          saved++;
          await recount([d.clientId]);
        }
      } catch {
        /* queda en la cola: se reintenta en la próxima sincronización */
      } finally {
        onProgress?.({ phase: 'download', done: ++done, total: total || thumbsTotal });
      }
    });
  }
  onProgress?.(null);
  return saved;
}

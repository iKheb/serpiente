/* Fotos de evidencia del equipo: se comprimen en el dispositivo (≤1600 px, JPEG
   0.82) con miniatura (≤360 px) y se guardan como Blob en IndexedDB. Se auditan
   como entity 'cliente'. La nube (src/cloud) las sincroniza: por eso cada edición
   marca `updatedAt` y cada borrado deja una "lápida" en meta ('photoTombstones'). */
import type { ClientPhoto, ID, PhotoKind } from './types';
import { db, dbReady, getDeviceId } from './db';
import { newId } from './ids';
import { NotFoundError, ValidationError } from './errors';
import { clientTitle } from './derive';
import { diffFields, summarizePhotosAdded, summarizePhotosRemoved, writeAudit } from './audit';

/** Clave de `meta`: { [photoId]: { clientId, deletedAt } } de fotos borradas aún no propagadas. */
export const META_PHOTO_TOMBSTONES = 'photoTombstones';

export interface PhotoTombstone {
  clientId: ID;
  deletedAt: number;
}

/** Foto tal como se guarda: `updatedAt` (opcional) marca la última edición de sus datos. */
export type StoredPhoto = ClientPhoto & { updatedAt?: number };

/** Lápidas de fotos borradas en este dispositivo (para la sincronización). */
export async function readPhotoTombstones(): Promise<Record<ID, PhotoTombstone>> {
  const row = await db.meta.get(META_PHOTO_TOMBSTONES);
  const v = row?.value;
  return v && typeof v === 'object' ? { ...(v as Record<ID, PhotoTombstone>) } : {};
}

/** Olvida lápidas ya propagadas. */
export async function clearPhotoTombstones(ids: ID[]): Promise<void> {
  if (!ids.length) return;
  await db.transaction('rw', db.meta, async () => {
    const all = await readPhotoTombstones();
    for (const id of ids) delete all[id];
    await db.meta.put({ key: META_PHOTO_TOMBSTONES, value: all });
  });
}

export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_THUMB_SIDE = 360;
export const PHOTO_QUALITY = 0.82;
export const PHOTO_THUMB_QUALITY = 0.74;
const MAX_INPUT_BYTES = 40 * 1024 * 1024;
const PHOTO_KINDS: readonly PhotoKind[] = ['ingreso', 'reparacion', 'entrega'];

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

interface Processed {
  blob: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

function canvasSupported(): boolean {
  if (typeof OffscreenCanvas !== 'undefined') return true;
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return typeof c.getContext === 'function' && !!c.getContext('2d');
  } catch {
    return false;
  }
}

/** true si este navegador puede decodificar y recomprimir imágenes. */
function processingAvailable(): boolean {
  return typeof createImageBitmap === 'function' && canvasSupported();
}

async function decode(file: Blob): Promise<Decoded | null> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch {
    /* algunos navegadores no aceptan opciones: reintentamos sin ellas */
  }
  try {
    const bmp = await createImageBitmap(file);
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch {
    return null;
  }
}

async function render(src: Decoded, maxSide: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const scale = Math.min(1, maxSide / Math.max(src.width, src.height));
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src.source, 0, 0, width, height);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    return { blob, width, height };
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no disponible');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src.source, 0, 0, width, height);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo comprimir la imagen'))), 'image/jpeg', quality),
  );
  return { blob, width, height };
}

/** Comprime una imagen y genera su miniatura. */
export async function processPhoto(file: Blob): Promise<Processed> {
  if (file.size > MAX_INPUT_BYTES) throw new ValidationError({ fotos: 'La imagen pesa demasiado (máximo 40 MB)' });
  const looksLikeImage = !file.type || file.type.startsWith('image/');
  if (!looksLikeImage) throw new ValidationError({ fotos: 'El archivo no es una imagen' });

  if (!processingAvailable()) {
    // Sin canvas (entornos muy antiguos o de prueba): se guarda tal cual.
    return { blob: file, thumb: file, width: 0, height: 0 };
  }
  const decoded = await decode(file);
  if (!decoded) throw new ValidationError({ fotos: 'No se pudo leer la imagen. Usa una foto JPG o PNG.' });
  try {
    const full = await render(decoded, PHOTO_MAX_SIDE, PHOTO_QUALITY);
    const thumb = await render(decoded, PHOTO_THUMB_SIDE, PHOTO_THUMB_QUALITY);
    // Si la original ya era un JPEG pequeño, no la hacemos más pesada.
    const blob = file.type === 'image/jpeg' && file.size <= full.blob.size && decoded.width <= PHOTO_MAX_SIDE && decoded.height <= PHOTO_MAX_SIDE ? file : full.blob;
    return { blob, thumb: thumb.blob, width: full.width, height: full.height };
  } finally {
    decoded.close();
  }
}

async function countPhotos(clientId: ID): Promise<number> {
  return db.photos.where('clientId').equals(clientId).count();
}

/** Agrega fotos de evidencia a un cliente. Actualiza numFotos y audita. */
export async function addClientPhotos(
  clientId: ID,
  files: (File | Blob)[],
  o: { kind?: PhotoKind; caption?: string } = {},
): Promise<ClientPhoto[]> {
  await dbReady();
  if (!files.length) return [];
  const kind: PhotoKind = o.kind && PHOTO_KINDS.includes(o.kind) ? o.kind : 'ingreso';
  const caption = (o.caption ?? '').trim().slice(0, 300);
  const exists = await db.clients.get(clientId);
  if (!exists) throw new NotFoundError('El cliente ya no existe');

  // El procesamiento de imagen ocurre fuera de la transacción (IndexedDB no admite esperas largas).
  const processed: Processed[] = [];
  for (const f of files) processed.push(await processPhoto(f));

  return db.transaction('rw', [db.clients, db.photos, db.audit], async () => {
    const client = await db.clients.get(clientId);
    if (!client) throw new NotFoundError('El cliente ya no existe');
    const base = Date.now();
    const photos: ClientPhoto[] = processed.map((p, idx) => ({
      id: newId(),
      clientId,
      kind,
      blob: p.blob,
      thumb: p.thumb,
      width: p.width,
      height: p.height,
      caption,
      ts: base + idx,
      deviceId: getDeviceId(),
    }));
    await db.photos.bulkAdd(photos);
    const numFotos = await countPhotos(clientId);
    const now = Date.now();
    const updated = { ...client, numFotos, updatedAt: now, rev: (client.rev || 0) + 1, deviceId: getDeviceId() };
    await db.clients.put(updated);
    await writeAudit({
      action: 'editar',
      entity: 'cliente',
      entityId: clientId,
      title: clientTitle(client),
      summary: summarizePhotosAdded(photos.length),
      changes: diffFields('cliente', { numFotos: client.numFotos ?? 0 }, { numFotos }),
      snapshot: null,
      ts: now,
    });
    return photos;
  });
}

/** Elimina una foto de evidencia. Actualiza numFotos y audita. */
export async function deleteClientPhoto(id: ID): Promise<void> {
  await dbReady();
  await db.transaction('rw', [db.clients, db.photos, db.audit, db.meta], async () => {
    const photo = await db.photos.get(id);
    if (!photo) return;
    await db.photos.delete(id);
    const tombstones = await readPhotoTombstones();
    tombstones[id] = { clientId: photo.clientId, deletedAt: Date.now() };
    await db.meta.put({ key: META_PHOTO_TOMBSTONES, value: tombstones });
    const client = await db.clients.get(photo.clientId);
    if (!client) return;
    const numFotos = await countPhotos(photo.clientId);
    const now = Date.now();
    await db.clients.put({ ...client, numFotos, updatedAt: now, rev: (client.rev || 0) + 1, deviceId: getDeviceId() });
    await writeAudit({
      action: 'editar',
      entity: 'cliente',
      entityId: client.id,
      title: clientTitle(client),
      summary: summarizePhotosRemoved(1),
      changes: diffFields('cliente', { numFotos: client.numFotos ?? 0 }, { numFotos }),
      snapshot: null,
      ts: now,
    });
  });
}

/** Cambia la descripción o el momento de una foto. */
export async function updateClientPhoto(id: ID, patch: { caption?: string; kind?: PhotoKind }): Promise<void> {
  await dbReady();
  await db.transaction('rw', [db.clients, db.photos, db.audit], async () => {
    const photo = await db.photos.get(id);
    if (!photo) throw new NotFoundError('La foto ya no existe');
    const next: StoredPhoto = { ...photo };
    if (patch.caption !== undefined) next.caption = patch.caption.trim().slice(0, 300);
    if (patch.kind !== undefined) {
      if (!PHOTO_KINDS.includes(patch.kind)) throw new ValidationError({ kind: 'Elige cuándo se tomó la foto' });
      next.kind = patch.kind;
    }
    const changes = diffFields(
      'foto',
      { caption: photo.caption, kind: photo.kind },
      { caption: next.caption, kind: next.kind },
    );
    if (!changes.length) return;
    next.updatedAt = Math.max(Date.now(), ((photo as StoredPhoto).updatedAt ?? photo.ts) + 1);
    await db.photos.put(next);
    const client = await db.clients.get(photo.clientId);
    await writeAudit({
      action: 'editar',
      entity: 'cliente',
      entityId: photo.clientId,
      title: client ? clientTitle(client) : 'Foto de evidencia',
      summary: 'Actualizó una foto de evidencia',
      changes,
      snapshot: null,
    });
  });
}

/* Mutaciones de clientes (servicios). Cada una audita en la MISMA transacción. */
import type { Client, ClientInput, ID } from './types';
import { db, dbReady, getDeviceId, nextFolio } from './db';
import { newId } from './ids';
import { NotFoundError } from './errors';
import { clientInputSchema, normalizeClientInput, parseOrThrow, pickClientInput } from './schemas';
import { clientTitle } from './derive';
import { SUMMARY, diffFields, sanitizeClient, summarizeClientEdit, writeAudit } from './audit';
import { stripUndefined } from './util';

export async function createClient(input: ClientInput): Promise<Client> {
  await dbReady();
  const data = normalizeClientInput(pickClientInput(input));
  const now = Date.now();
  if (data.estado === 'entregado' && data.fechaEntrega == null) data.fechaEntrega = Math.max(now, data.fecha);
  parseOrThrow(clientInputSchema, data);

  return db.transaction('rw', [db.clients, db.meta, db.audit], async () => {
    const folio = await nextFolio();
    const client: Client = {
      ...data,
      id: newId(),
      folio,
      numFotos: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deviceId: getDeviceId(),
      rev: 1,
    };
    await db.clients.add(client);
    await writeAudit({
      action: 'crear',
      entity: 'cliente',
      entityId: client.id,
      title: clientTitle(client),
      summary: SUMMARY.crearCliente,
      changes: diffFields('cliente', null, sanitizeForDiff(client)),
      snapshot: sanitizeClient(client),
      ts: now,
    });
    return client;
  });
}

/** El diff necesita el valor real para detectar cambios, pero nunca lo expone (diffFields enmascara). */
function sanitizeForDiff(c: Client): Record<string, unknown> {
  return c as unknown as Record<string, unknown>;
}

export async function updateClient(id: ID, patch: Partial<ClientInput>): Promise<Client> {
  await dbReady();
  return db.transaction('rw', [db.clients, db.audit], async () => {
    const current = await db.clients.get(id);
    if (!current) throw new NotFoundError('El cliente ya no existe');
    const now = Date.now();
    const merged = normalizeClientInput({ ...pickClientInput(current), ...stripUndefined(patch) });

    // Fecha de entrega automática al pasar a "Entregado" (y se limpia al salir de ese estado).
    if (merged.estado === 'entregado' && current.estado !== 'entregado' && merged.fechaEntrega == null) {
      merged.fechaEntrega = Math.max(now, merged.fecha);
    } else if (merged.estado !== 'entregado' && current.estado === 'entregado' && !('fechaEntrega' in patch)) {
      merged.fechaEntrega = null;
    }
    parseOrThrow(clientInputSchema, merged);

    const next: Client = { ...current, ...merged };
    const changes = diffFields('cliente', sanitizeForDiff(current), sanitizeForDiff(next), {}, { ignore: ['folio', 'numFotos'] });
    if (changes.length === 0) return current;

    const updated: Client = { ...next, updatedAt: now, rev: (current.rev || 0) + 1, deviceId: getDeviceId() };
    await db.clients.put(updated);
    await writeAudit({
      action: 'editar',
      entity: 'cliente',
      entityId: id,
      title: clientTitle(updated),
      summary: summarizeClientEdit(changes, updated),
      changes,
      snapshot: sanitizeClient(updated),
      ts: now,
    });
    return updated;
  });
}

export async function deleteClient(id: ID): Promise<void> {
  await dbReady();
  await db.transaction('rw', [db.clients, db.audit], async () => {
    const current = await db.clients.get(id);
    if (!current) throw new NotFoundError('El cliente ya no existe');
    if (current.deletedAt != null) return;
    const now = Date.now();
    const updated: Client = { ...current, deletedAt: now, updatedAt: now, rev: (current.rev || 0) + 1, deviceId: getDeviceId() };
    await db.clients.put(updated);
    await writeAudit({
      action: 'eliminar',
      entity: 'cliente',
      entityId: id,
      title: clientTitle(current),
      summary: SUMMARY.eliminar,
      snapshot: sanitizeClient(current),
      ts: now,
    });
  });
}

export async function restoreClient(id: ID): Promise<void> {
  await dbReady();
  await db.transaction('rw', [db.clients, db.audit], async () => {
    const current = await db.clients.get(id);
    if (!current) throw new NotFoundError('El cliente ya no existe');
    if (current.deletedAt == null) return;
    const now = Date.now();
    const updated: Client = { ...current, deletedAt: null, updatedAt: now, rev: (current.rev || 0) + 1, deviceId: getDeviceId() };
    await db.clients.put(updated);
    await writeAudit({
      action: 'restaurar',
      entity: 'cliente',
      entityId: id,
      title: clientTitle(updated),
      summary: SUMMARY.restaurar,
      snapshot: sanitizeClient(updated),
      ts: now,
    });
  });
}

/** Elimina definitivamente el cliente y sus fotos de evidencia. */
export async function purgeClient(id: ID): Promise<void> {
  await dbReady();
  await db.transaction('rw', [db.clients, db.photos, db.audit], async () => {
    const current = await db.clients.get(id);
    if (!current) return;
    await db.photos.where('clientId').equals(id).delete();
    await db.clients.delete(id);
    await writeAudit({
      action: 'purgar',
      entity: 'cliente',
      entityId: id,
      title: clientTitle(current),
      summary: SUMMARY.purgar,
      snapshot: sanitizeClient(current),
    });
  });
}

import { beforeEach, describe, expect, it } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';

// fake-indexeddb clona con structuredClone de Node, que no conserva el Blob de jsdom
// (en el navegador IndexedDB guarda Blobs de forma nativa). Usamos el Blob de Node.
globalThis.Blob = NodeBlob as unknown as typeof Blob;
import { db } from '../db';
import { createClient } from '../clients';
import { addClientPhotos, deleteClientPhoto, updateClientPhoto } from '../photos';
import { ValidationError } from '../errors';
import { clientInput, resetDb } from './helpers';

beforeEach(resetDb);

const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], { type: 'image/jpeg' });

describe('fotos de evidencia', () => {
  it('agrega, edita y elimina fotos actualizando numFotos y la auditoría', async () => {
    const c = await createClient(clientInput());
    const photos = await addClientPhotos(c.id, [jpeg(), jpeg()], { kind: 'ingreso', caption: ' Golpe en esquina ' });
    expect(photos).toHaveLength(2);
    expect(photos[0].caption).toBe('Golpe en esquina');
    expect((await db.clients.get(c.id))?.numFotos).toBe(2);

    await updateClientPhoto(photos[0].id, { kind: 'reparacion' });
    expect((await db.photos.get(photos[0].id))?.kind).toBe('reparacion');

    await deleteClientPhoto(photos[1].id);
    const after = await db.clients.get(c.id);
    expect(after?.numFotos).toBe(1);
    expect(after?.rev).toBe(3);

    const summaries = (await db.audit.where('entityId').equals(c.id).sortBy('ts')).map((a) => a.summary);
    expect(summaries).toEqual([
      'Registró un nuevo cliente',
      'Agregó 2 fotos de evidencia',
      'Actualizó una foto de evidencia',
      'Eliminó 1 foto de evidencia',
    ]);
    const add = (await db.audit.where('entityId').equals(c.id).sortBy('ts'))[1];
    expect(add.changes[0]).toMatchObject({ label: 'Fotos de evidencia', fromText: 'Sin fotos', toText: '2 fotos' });
  });

  it('rechaza archivos que no son imágenes', async () => {
    const c = await createClient(clientInput());
    await expect(addClientPhotos(c.id, [new Blob(['hola'], { type: 'text/plain' })])).rejects.toBeInstanceOf(ValidationError);
    expect(await db.photos.count()).toBe(0);
  });
});

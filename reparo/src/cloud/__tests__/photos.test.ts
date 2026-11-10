/* Fotos de evidencia en la nube: Storage falso en memoria + dos dispositivos. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import Dexie from 'dexie';
import { IDBFactory } from 'fake-indexeddb';
import { FakeSupabaseServer, fakeClient } from './fakeSupabase';

// fake-indexeddb clona con structuredClone de Node: usamos el Blob de Node (como src/data/__tests__/photos.test.ts).
globalThis.Blob = NodeBlob as unknown as typeof Blob;

const URL_OK = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY_OK = 'sb_publishable_TEST_not_a_real_key_000';

async function loadDevice(server: FakeSupabaseServer) {
  Dexie.dependencies.indexedDB = new IDBFactory();
  localStorage.clear();
  vi.resetModules();
  const data = await import('@/data');
  const helpers = await import('@/data/__tests__/helpers');
  const client = await import('@/cloud/client');
  const config = await import('@/cloud/config');
  const sync = await import('@/cloud/sync');
  const engine = await import('@/cloud/engine');
  const photos = await import('@/cloud/photos');
  const fake = fakeClient(server);
  client.__setCloudClientFactory(() => fake);
  await data.dbReady();
  await config.saveCloudConfig({ url: URL_OK, anonKey: KEY_OK });
  return { data, helpers, client, sync, engine, photos, fake };
}
type Device = Awaited<ReturnType<typeof loadDevice>>;

const jpeg = (n: number) => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, n, n, n])], { type: 'image/jpeg' });
const bytes = async (b: Blob | undefined) => (b ? Array.from(new Uint8Array(await b.arrayBuffer())) : null);
const tick = (ms = 3) => new Promise((r) => setTimeout(r, ms));
const auditIds = async (d: Device) => (await d.data.db.audit.toArray()).map((a) => a.id).sort();

let server: FakeSupabaseServer;
let pc: Device;
let phone: Device;
let userId: string;

async function connectBoth(): Promise<void> {
  await pc.client.cloudSignUp('taller@example.com', 'secreta123');
  await pc.sync.cloudSyncNow();
  userId = server.users.get('taller@example.com')!.id;
  await phone.client.cloudSignIn('taller@example.com', 'secreta123');
  await phone.sync.restoreFromCloud();
  await phone.sync.cloudSyncNow(); // espera la descarga de fotos en segundo plano
}

beforeEach(async () => {
  server = new FakeSupabaseServer();
  pc = await loadDevice(server);
  phone = await loadDevice(server);
});

describe('fotos de evidencia en la nube', () => {
  it('se suben (archivo + miniatura) y se descargan en otro dispositivo con numFotos correcto y sin auditar', async () => {
    const c = await pc.data.createClient(pc.helpers.clientInput());
    const [p1, p2] = await pc.data.addClientPhotos(c.id, [jpeg(1), jpeg(2)], { caption: 'Golpe' });
    await connectBoth();

    expect([...server.files.keys()].sort()).toEqual(
      [`${userId}/${p1.id}.jpg`, `${userId}/${p1.id}_t.jpg`, `${userId}/${p2.id}.jpg`, `${userId}/${p2.id}_t.jpg`].map((k) => `reparo-fotos/${k}`).sort(),
    );
    const row = server.rowsOf(userId).find((r) => r.tbl === 'photos' && r.id === p1.id)!;
    expect(JSON.parse(row.data)).toMatchObject({ id: p1.id, clientId: c.id, caption: 'Golpe', deletedAt: null, ext: 'jpg' });
    expect(row.data).not.toContain('blob');

    const got = await phone.data.db.photos.get(p1.id);
    expect(got).toMatchObject({ clientId: c.id, caption: 'Golpe', kind: 'ingreso' });
    expect(await bytes(got?.blob)).toEqual(await bytes(jpeg(1)));
    expect(await bytes(got?.thumb)).toEqual(await bytes(jpeg(1)));
    expect((await phone.data.db.clients.get(c.id))?.numFotos).toBe(2);
    expect(await auditIds(phone)).toEqual(await auditIds(pc));
    expect(await phone.engine.hasCloudPending()).toBe(false);
    expect(await pc.engine.hasCloudPending()).toBe(false);
  });

  it('los borrados se propagan (lápida) y se eliminan de storage', async () => {
    const c = await pc.data.createClient(pc.helpers.clientInput());
    const [p1, p2] = await pc.data.addClientPhotos(c.id, [jpeg(1), jpeg(2)]);
    await connectBoth();
    expect(await phone.data.db.photos.count()).toBe(2);

    await tick();
    await phone.data.deleteClientPhoto(p1.id); // borrado en el celular
    await phone.sync.cloudSyncNow();
    expect(server.files.has(`reparo-fotos/${userId}/${p1.id}.jpg`)).toBe(false);
    expect(server.files.has(`reparo-fotos/${userId}/${p1.id}_t.jpg`)).toBe(false);
    expect(server.files.has(`reparo-fotos/${userId}/${p2.id}.jpg`)).toBe(true);
    expect(await phone.data.db.meta.get('photoTombstones')).toMatchObject({ value: {} });

    const before = await pc.data.db.audit.count();
    await pc.sync.cloudSyncNow();
    expect(await pc.data.db.photos.get(p1.id)).toBeUndefined();
    expect(await pc.data.db.photos.count()).toBe(1);
    expect((await pc.data.db.clients.get(c.id))?.numFotos).toBe(1);
    // Sólo llegó la auditoría del celular ("Eliminó 1 foto"); aplicar no creó otra.
    expect(await pc.data.db.audit.count()).toBe(before + 1);
    expect(await auditIds(pc)).toEqual(await auditIds(phone));
  });

  it('purgar el cliente borra sus fotos en storage y en el otro dispositivo', async () => {
    const c = await pc.data.createClient(pc.helpers.clientInput());
    const [p1] = await pc.data.addClientPhotos(c.id, [jpeg(1)]);
    await connectBoth();
    await tick();
    await pc.data.deleteClient(c.id);
    await tick();
    await pc.data.purgeClient(c.id);
    await pc.sync.cloudSyncNow();
    expect(server.files.size).toBe(0);
    await phone.sync.cloudSyncNow();
    expect(await phone.data.db.photos.get(p1.id)).toBeUndefined();
  });

  it('si la subida falla, los datos se sincronizan y las fotos se reintentan después', async () => {
    const c = await pc.data.createClient(pc.helpers.clientInput());
    const [p1] = await pc.data.addClientPhotos(c.id, [jpeg(7)]);
    await pc.client.cloudSignUp('taller@example.com', 'secreta123');
    userId = server.users.get('taller@example.com')!.id;
    server.storageFailures = 100;
    const r = await pc.sync.cloudSyncNow();
    expect(r.photoFailures).toBe(1);
    expect(r.photoError).toMatch(/conectar/);
    expect(server.rowsOf(userId).some((x) => x.tbl === 'clients')).toBe(true);
    // La fila de la foto NO se envía hasta que su archivo esté en storage.
    expect(server.rowsOf(userId).some((x) => x.tbl === 'photos')).toBe(false);
    expect(await pc.engine.hasCloudPending()).toBe(true);

    server.storageFailures = 0;
    const r2 = await pc.sync.cloudSyncNow();
    expect(r2.photoFailures).toBe(0);
    expect(server.files.has(`reparo-fotos/${userId}/${p1.id}.jpg`)).toBe(true);
    expect(server.rowsOf(userId).some((x) => x.tbl === 'photos' && x.id === p1.id)).toBe(true);
  });

  it('si la descarga falla, queda en cola y llega en la siguiente sincronización', async () => {
    const c = await pc.data.createClient(pc.helpers.clientInput());
    const [p1] = await pc.data.addClientPhotos(c.id, [jpeg(3)]);
    await pc.client.cloudSignUp('taller@example.com', 'secreta123');
    await pc.sync.cloudSyncNow();
    await phone.client.cloudSignIn('taller@example.com', 'secreta123');
    server.storageFailures = 100;
    await phone.sync.cloudSyncNow();
    expect(await phone.data.db.photos.get(p1.id)).toBeUndefined();
    expect((await phone.data.db.clients.get(c.id))?.numFotos).toBe(0);
    expect(await phone.engine.hasCloudPending()).toBe(true);

    server.storageFailures = 0;
    await phone.sync.cloudSyncNow();
    expect(await bytes((await phone.data.db.photos.get(p1.id))?.blob)).toEqual(await bytes(jpeg(3)));
    expect((await phone.data.db.clients.get(c.id))?.numFotos).toBe(1);
  });

  it('descarga primero las miniaturas y luego las completas, con progreso', async () => {
    const c = await pc.data.createClient(pc.helpers.clientInput());
    const ps = await pc.data.addClientPhotos(c.id, [jpeg(1), jpeg(2), jpeg(3), jpeg(4), jpeg(5)]);
    await pc.client.cloudSignUp('taller@example.com', 'secreta123');
    const progress: string[] = [];
    const user = (await pc.client.getCloudUser())!;
    await pc.engine.runCloudCycle(pc.fake, { projectUrl: URL_OK, userId: user.id }, { onProgress: (p) => p && progress.push(`${p.phase} ${p.done}/${p.total}`) });
    expect(progress[0]).toBe('upload 0/5');
    expect(progress).toContain('upload 5/5');

    await phone.client.cloudSignIn('taller@example.com', 'secreta123');
    const order: string[] = [];
    const bucket = phone.fake.storage.from('reparo-fotos');
    const spy = vi.spyOn(phone.fake.storage, 'from').mockReturnValue({
      ...bucket,
      download: (path: string) => {
        order.push(path.endsWith('_t.jpg') ? 't' : 'f');
        return bucket.download(path);
      },
    });
    const dl: string[] = [];
    await phone.engine.runCloudCycle(phone.fake, { projectUrl: URL_OK, userId: user.id }, { onProgress: (p) => p && dl.push(`${p.phase} ${p.done}/${p.total}`) });
    spy.mockRestore();
    expect(order.join('')).toBe('tttttfffff');
    expect(dl).toContain('download 5/5');
    expect(await phone.data.db.photos.count()).toBe(ps.length);
  });

  it('editar la descripción de una foto viaja al otro dispositivo', async () => {
    const c = await pc.data.createClient(pc.helpers.clientInput());
    const [p1] = await pc.data.addClientPhotos(c.id, [jpeg(1)], { caption: 'Antes' });
    await connectBoth();
    await tick();
    await pc.data.updateClientPhoto(p1.id, { caption: 'Pantalla rota', kind: 'reparacion' });
    await pc.sync.cloudSyncNow();
    await phone.sync.cloudSyncNow();
    expect(await phone.data.db.photos.get(p1.id)).toMatchObject({ caption: 'Pantalla rota', kind: 'reparacion' });
    // No se volvieron a subir los archivos por un cambio de descripción.
    expect(server.storageCalls.upload).toBe(2);
  });
});

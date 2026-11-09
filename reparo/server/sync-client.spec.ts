// Integración del cliente REAL de sincronización (src/data/sync.ts) con el servidor real.
// Corre con Vitest (`npm test`: jsdom + fake-indexeddb); `node --test server/` no la carga.
// Usa sólo exportaciones del contrato de '@/data' (docs/data-api.md).
import { afterAll, beforeAll, expect, it } from 'vitest';
// @ts-ignore — módulo JS del servidor (sin tipos)
import { SimDevice, startTempServer } from './tools/simular-dispositivos.mjs';
import { db, dbReady, getDeviceId } from '@/data/db';
import {
  consumeInventory,
  createClient,
  createInventoryItem,
  emptyClientInput,
  emptyInventoryInput,
  purgeClient,
  updateClient,
  updateSettings,
} from '@/data';
import { hasPendingChanges, parseSyncUrl, syncNow, testSyncServer } from '@/data/sync';

const token = 'tok-123';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let srv: any;
beforeAll(async () => { srv = await startTempServer({ env: { REPARO_TOKEN: token } }); await dbReady(); });
afterAll(async () => { const r = await srv.stop(); expect(r.code).toBe(0); });

it('parseSyncUrl', () => {
  expect(parseSyncUrl('192.168.1.10:8787')).toEqual({ base: 'http://192.168.1.10:8787', token: '' });
  expect(parseSyncUrl('https://x.com/reparo/api/?token=abc')).toEqual({ base: 'https://x.com/reparo', token: 'abc' });
  expect(parseSyncUrl('  ')).toBeNull();
});

it('testSyncServer: token correcto, ausente e incorrecto; URL muerta', async () => {
  expect((await testSyncServer(`${srv.url}/?token=${token}`)).ok).toBe(true);
  const sinToken = await testSyncServer(srv.url);
  expect(sinToken.ok).toBe(false); expect(sinToken.message).toMatch(/requiere un token/);
  const malo = await testSyncServer(`${srv.url}?token=nope`);
  expect(malo.ok).toBe(false); expect(malo.message).toMatch(/token/);
  const muerta = await testSyncServer('http://127.0.0.1:1');
  expect(muerta.ok).toBe(false); expect(muerta.message).toMatch(/No se pudo conectar/);
});

it('el cliente real de sincronización converge con otro dispositivo', async () => {
  await updateSettings({ syncUrl: `${srv.url}/?token=${token}`, syncEnabled: true });
  const c = await createClient({ ...emptyClientInput(), nombre: 'Ana', telefono: '5551234567', marca: 'Apple', modelo: 'iPhone 13', servicio: 'Cambio de pantalla', desbloqueoTipo: 'pin', desbloqueoCodigo: '0000' } as any);
  const item = await createInventoryItem({ ...emptyInventoryInput(), nombre: 'Pantalla iPhone 13', stock: 3, stockMinimo: 1 } as any);
  await consumeInventory(item.id, { cantidad: 1, clienteId: c.id, ts: Date.now() - 2 * 86400e3 });
  expect(await hasPendingChanges()).toBe(true);
  const r1 = await syncNow();
  expect(r1.pushed).toBeGreaterThan(3);
  expect(await hasPendingChanges()).toBe(false);
  const s = await db.settings.get('settings');
  expect(s?.lastSyncAt).toBeTypeOf('number');
  const syncAudits = (await db.audit.toArray()).filter((a) => a.entity === 'ajustes' && a.changes.some((ch) => ch.field === 'lastSyncAt'));
  expect(syncAudits.length).toBe(0);

  // Otro dispositivo (simulado) baja todo, edita y crea.
  const B = new SimDevice('otro', srv.url, { token });
  await B.sync();
  expect(B.tables.clients.get(c.id).nombre).toBe('Ana');
  expect(B.tables.movements.size).toBeGreaterThanOrEqual(2);
  B.put('clients', { id: c.id, estado: 'listo', numFotos: 9 });
  B.put('clients', { id: 'remoto-1', folio: 50, nombre: 'Remoto', estado: 'recibido', fecha: Date.now() });
  await B.sync();

  const auditBefore = await db.audit.count();
  const r2 = await syncNow();
  expect(r2.pulled).toBeGreaterThanOrEqual(2);
  const local = await db.clients.get(c.id);
  expect(local?.estado).toBe('listo');
  expect(local?.numFotos).toBe(0); // numFotos refleja las fotos de ESTE dispositivo
  expect((await db.clients.get('remoto-1'))?.nombre).toBe('Remoto');
  // Sólo se insertaron las entradas de auditoría remotas (2), ninguna nueva local.
  expect(await db.audit.count()).toBe(auditBefore + 2);
  expect((await db.meta.get('folioSeq'))?.value).toBeGreaterThanOrEqual(50);

  // Edición local posterior gana; purga remota se replica.
  await updateClient(c.id, { notas: 'local gana' } as any);
  await syncNow();
  await B.sync();
  expect(B.tables.clients.get(c.id).notas).toBe('local gana');
  B.purge('clients', 'remoto-1');
  await B.sync();
  await syncNow();
  expect(await db.clients.get('remoto-1')).toBeUndefined();

  // Purga local se replica al otro.
  await purgeClient(c.id);
  await syncNow();
  await B.sync();
  expect(B.tables.clients.has(c.id)).toBe(false);

  // Convergencia de conteos con el servidor.
  const st = await (await fetch(`${srv.url}/api/sync/status`, { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(st.rows.clients).toBe(await db.clients.count());
  expect(st.rows.audit).toBe(await db.audit.count());
  expect(st.rows.movements).toBe(await db.movements.count());
  expect(st.devices.map((d: any) => d.deviceId)).toContain(getDeviceId());
  const again = await syncNow();
  expect(again).toEqual({ pushed: 0, pulled: 0 });
});

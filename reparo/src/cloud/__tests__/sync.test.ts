/* Dos "dispositivos" (dos bases IndexedDB y dos grafos de módulos independientes)
   sincronizando contra un Supabase falso en memoria. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { IDBFactory } from 'fake-indexeddb';
import { FakeSupabaseServer, fakeClient } from './fakeSupabase';

const URL_OK = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY_OK = 'sb_publishable_TEST_not_a_real_key_000';

type Device = Awaited<ReturnType<typeof loadDevice>>;

async function loadDevice(server: FakeSupabaseServer, name: string) {
  Dexie.dependencies.indexedDB = new IDBFactory();
  localStorage.clear();
  vi.resetModules();
  const data = await import('@/data');
  const helpers = await import('@/data/__tests__/helpers');
  const client = await import('@/cloud/client');
  const config = await import('@/cloud/config');
  const sync = await import('@/cloud/sync');
  const engine = await import('@/cloud/engine');
  const fake = fakeClient(server);
  client.__setCloudClientFactory(() => fake);
  await data.dbReady();
  await config.saveCloudConfig({ url: URL_OK, anonKey: KEY_OK });
  return { name, data, helpers, client, config, sync, engine, fake, deviceId: data.getDeviceId() };
}

const tick = (ms = 3) => new Promise((r) => setTimeout(r, ms));

async function auditIds(d: Device): Promise<string[]> {
  return (await d.data.db.audit.toArray()).map((a) => a.id).sort();
}

let server: FakeSupabaseServer;
let pc: Device;
let phone: Device;

beforeEach(async () => {
  server = new FakeSupabaseServer();
  pc = await loadDevice(server, 'pc');
  phone = await loadDevice(server, 'phone');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sincronización en la nube (Supabase falso)', () => {
  it('dos dispositivos convergen: el celular nuevo baja todo con restoreFromCloud', async () => {
    const { data, helpers } = pc;
    await data.updateSettings({ businessName: 'Taller Centro', ownerName: 'Luis', currency: 'COP', locale: 'es-CO', monthlyGoalCents: 5_000_000, theme: 'light', notifyLowStock: false });
    const c = await data.createClient(helpers.clientInput());
    await data.createExpense(helpers.expenseInput({ clienteId: c.id }));
    const item = await data.createInventoryItem(helpers.itemInput());
    await data.consumeInventory(item.id, { cantidad: 1, clienteId: c.id });

    await pc.client.cloudSignUp('taller@example.com', 'secreta123');
    const r1 = await pc.sync.cloudSyncNow();
    expect(r1.pushed).toBeGreaterThan(5);

    await phone.client.cloudSignIn('taller@example.com', 'secreta123');
    const restored = await phone.sync.restoreFromCloud();
    expect(restored).toMatchObject({ clients: 1, expenses: 1, inventory: 1 });

    const pDb = phone.data.db;
    expect((await pDb.clients.get(c.id))?.nombre).toBe('Ana López');
    expect((await pDb.inventory.get(item.id))?.stock).toBe(2);
    expect(await pDb.movements.count()).toBe(await pc.data.db.movements.count());
    // Auditoría: exactamente las mismas entradas (no se generaron nuevas al aplicar).
    expect(await auditIds(phone)).toEqual(await auditIds(pc));

    // Ajustes del negocio viajan; tema y notificaciones no.
    const s = await phone.data.readSettings();
    expect(s).toMatchObject({ businessName: 'Taller Centro', ownerName: 'Luis', currency: 'COP', locale: 'es-CO', monthlyGoalCents: 5_000_000, onboarded: true });
    expect(s.theme).toBe('dark');
    expect(s.notifyLowStock).toBe(true);
    // La caché de formato quedó al día.
    expect(phone.data.getCachedSettings().currency).toBe('COP');
    // El folio continúa desde el máximo recibido.
    const c2 = await phone.data.createClient(phone.helpers.clientInput({ nombre: 'Beto' }));
    expect(c2.folio).toBe(c.folio + 1);
  });

  it('ediciones y borrados lógicos viajan en ambos sentidos, sin auditorías extra', async () => {
    const c = await pc.data.createClient(pc.helpers.clientInput());
    const e = await pc.data.createExpense(pc.helpers.expenseInput());
    await pc.client.cloudSignUp('taller@example.com', 'secreta123');
    await pc.sync.cloudSyncNow();
    await phone.client.cloudSignIn('taller@example.com', 'secreta123');
    await phone.sync.restoreFromCloud();

    await tick();
    await phone.data.updateClient(c.id, { estado: 'listo', pagadoCents: 280_000 });
    await phone.data.deleteExpense(e.id);
    await phone.sync.cloudSyncNow();
    const phoneAudits = await auditIds(phone);

    await pc.sync.cloudSyncNow();
    expect((await pc.data.db.clients.get(c.id))).toMatchObject({ estado: 'listo', pagadoCents: 280_000 });
    expect((await pc.data.db.expenses.get(e.id))?.deletedAt).toEqual(expect.any(Number));
    expect(await auditIds(pc)).toEqual(phoneAudits);

    // Restaurar en la PC vuelve al celular.
    await tick();
    await pc.data.restoreExpense(e.id);
    await pc.sync.cloudSyncNow();
    await phone.sync.cloudSyncNow();
    expect((await phone.data.db.expenses.get(e.id))?.deletedAt).toBeNull();
    expect(await auditIds(phone)).toEqual(await auditIds(pc));

    // Una segunda vuelta sin cambios no envía ni aplica nada.
    const again = await phone.sync.cloudSyncNow();
    expect(again).toEqual({ pushed: 0, pulled: 0 });
    expect(await phone.engine.hasCloudPending()).toBe(false);
  });

  it('conflicto: gana el cambio más reciente en ambos dispositivos', async () => {
    const c = await pc.data.createClient(pc.helpers.clientInput());
    await pc.client.cloudSignUp('taller@example.com', 'secreta123');
    await pc.sync.cloudSyncNow();
    await phone.client.cloudSignIn('taller@example.com', 'secreta123');
    await phone.sync.restoreFromCloud();

    await tick();
    await pc.data.updateClient(c.id, { notas: 'desde la PC' });
    await tick(10);
    await phone.data.updateClient(c.id, { notas: 'desde el celular' });
    // La PC sube primero; el celular (más reciente) después.
    await pc.sync.cloudSyncNow();
    await phone.sync.cloudSyncNow();
    await pc.sync.cloudSyncNow();
    expect((await pc.data.db.clients.get(c.id))?.notas).toBe('desde el celular');
    expect((await phone.data.db.clients.get(c.id))?.notas).toBe('desde el celular');
  });

  it('cambios de ajustes del negocio viajan y no generan auditoría en el receptor', async () => {
    await pc.client.cloudSignUp('taller@example.com', 'secreta123');
    await pc.data.updateSettings({ businessName: 'Taller Uno' });
    await pc.sync.cloudSyncNow();
    await phone.client.cloudSignIn('taller@example.com', 'secreta123');
    await phone.sync.restoreFromCloud();
    expect((await phone.data.readSettings()).businessName).toBe('Taller Uno');

    await tick();
    await phone.data.updateSettings({ businessPhone: '55 0000 1111', receiptFooter: 'Garantía 30 días' });
    await phone.sync.cloudSyncNow();
    const before = await pc.data.db.audit.count();
    const pulledAudits = (await auditIds(phone)).length;
    await pc.sync.cloudSyncNow();
    const s = await pc.data.readSettings();
    expect(s).toMatchObject({ businessName: 'Taller Uno', businessPhone: '55 0000 1111', receiptFooter: 'Garantía 30 días' });
    // Sólo llegó la auditoría hecha en el celular; aplicar no creó otra.
    expect(await pc.data.db.audit.count()).toBe(Math.max(before, pulledAudits));
    expect(await auditIds(pc)).toEqual(await auditIds(phone));
  });

  it('primera vez: los ajustes de fábrica de la nube no pisan los datos reales de la PC', async () => {
    // El celular crea la cuenta primero con todo por defecto (no sube ajustes).
    await phone.client.cloudSignUp('taller@example.com', 'secreta123');
    await phone.sync.cloudSyncNow();
    await pc.data.updateSettings({ businessName: 'Taller Real' });
    await pc.client.cloudSignIn('taller@example.com', 'secreta123');
    await pc.sync.cloudSyncNow();
    expect((await pc.data.readSettings()).businessName).toBe('Taller Real');
    await phone.sync.cloudSyncNow();
    expect((await phone.data.readSettings()).businessName).toBe('Taller Real');
  });

  it('numFotos remoto no pisa el conteo local de fotos', async () => {
    const c = await pc.data.createClient(pc.helpers.clientInput());
    await pc.client.cloudSignUp('taller@example.com', 'secreta123');
    await pc.sync.cloudSyncNow();
    await phone.client.cloudSignIn('taller@example.com', 'secreta123');
    await phone.sync.restoreFromCloud();

    // El celular tiene 2 fotos locales de ese cliente.
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    for (const id of ['f1', 'f2']) {
      await phone.data.db.photos.add({ id, clientId: c.id, kind: 'ingreso', blob, thumb: blob, width: 1, height: 1, caption: '', ts: Date.now(), deviceId: phone.deviceId });
    }
    await phone.data.db.clients.update(c.id, { numFotos: 2 });

    await tick();
    await pc.data.updateClient(c.id, { notas: 'cambio en la PC' });
    await pc.sync.cloudSyncNow();
    await phone.sync.cloudSyncNow();
    const local = await phone.data.db.clients.get(c.id);
    expect(local?.notas).toBe('cambio en la PC');
    expect(local?.numFotos).toBe(2);
  });

  it('las purgas definitivas se replican', async () => {
    const c = await pc.data.createClient(pc.helpers.clientInput());
    await pc.client.cloudSignUp('taller@example.com', 'secreta123');
    await pc.sync.cloudSyncNow();
    await phone.client.cloudSignIn('taller@example.com', 'secreta123');
    await phone.sync.restoreFromCloud();
    expect(await phone.data.db.clients.get(c.id)).toBeTruthy();

    await tick();
    await pc.data.deleteClient(c.id);
    await tick();
    await pc.data.purgeClient(c.id);
    await pc.sync.cloudSyncNow();
    await phone.sync.cloudSyncNow();
    expect(await phone.data.db.clients.get(c.id)).toBeUndefined();
  });

  it('cambiar de cuenta reinicia cursores y sube los datos locales a la cuenta nueva', async () => {
    await pc.data.createClient(pc.helpers.clientInput());
    await pc.client.cloudSignUp('uno@example.com', 'secreta123');
    await pc.sync.cloudSyncNow();
    const user1 = server.users.get('uno@example.com')!.id;
    expect(server.rowsOf(user1).length).toBeGreaterThan(0);
    const cursor1 = (await pc.data.db.meta.get(pc.engine.META.cursor))?.value as number;
    expect(cursor1).toBeGreaterThan(0);

    await pc.client.cloudSignOut();
    await pc.client.cloudSignUp('dos@example.com', 'secreta123');
    const spy = vi.spyOn(server, 'select');
    await pc.sync.cloudSyncNow();
    // La primera descarga de la cuenta nueva empieza desde 0.
    expect(spy.mock.calls[0][1]).toBe(0);
    const user2 = server.users.get('dos@example.com')!.id;
    expect(server.rowsOf(user2).filter((r) => r.tbl === 'clients')).toHaveLength(1);
    const account = (await pc.data.db.meta.get(pc.engine.META.account))?.value;
    expect(account).toBe(`${URL_OK}|${user2}`);
  });

  it('pagina el pull (más de 1000 filas) y sube en lotes de 500', async () => {
    const now = Date.now();
    const rows = Array.from({ length: 1234 }, (_, i) => ({
      id: `mov${i}`,
      itemId: 'x',
      type: 'ajuste' as const,
      cantidad: 1,
      stockAntes: 0,
      stockDespues: 1,
      costoUnitarioCents: 0,
      clienteId: null,
      gastoId: null,
      nota: '',
      ts: now - i,
      deviceId: pc.deviceId,
    }));
    await pc.data.db.movements.bulkAdd(rows);
    await pc.client.cloudSignUp('taller@example.com', 'secreta123');
    await pc.sync.cloudSyncNow();
    expect(server.pushCalls).toBe(3);
    await phone.client.cloudSignIn('taller@example.com', 'secreta123');
    await phone.sync.restoreFromCloud();
    expect(await phone.data.db.movements.count()).toBe(1234);
  });

  it('errores de red y de esquema llegan traducidos al estado', async () => {
    await pc.client.cloudSignUp('taller@example.com', 'secreta123');
    server.failNext = { message: 'Could not find the table public.reparo_rows', code: 'PGRST205', status: 404 };
    await expect(pc.sync.cloudSyncNow()).rejects.toMatchObject({ kind: 'schema' });
    server.failNext = { message: 'TypeError: Failed to fetch' };
    await expect(pc.sync.cloudSyncNow()).rejects.toMatchObject({ kind: 'network' });
    // Sin sesión no se intenta.
    await pc.client.cloudSignOut();
    await expect(pc.sync.cloudSyncNow()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('inicio de sesión con credenciales malas da un mensaje claro en español', async () => {
    await pc.client.cloudSignUp('taller@example.com', 'secreta123');
    await expect(phone.client.cloudSignIn('taller@example.com', 'otra-clave')).rejects.toThrow('Correo o contraseña incorrectos');
    await expect(phone.client.cloudSignUp('taller@example.com', 'secreta123')).rejects.toThrow('Ya existe una cuenta');
    await expect(phone.client.cloudSignUp('no-es-correo', 'secreta123')).rejects.toThrow('correo no es válido');
  });
});

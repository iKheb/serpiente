import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { createClient, updateClient } from '../clients';
import { createExpense } from '../expenses';
import { consumeInventory, createInventoryItem } from '../inventory';
import { addClientPhotos } from '../photos';
import { buildBackup, blobToDataURL, dataURLToBlob, exportBackup, exportCSV, importBackup, wipeAllData } from '../backup';
import { BackupError } from '../errors';
import { updateSettings } from '../settings';
import { clientInput, expenseInput, itemInput, resetDb } from './helpers';

beforeEach(resetDb);

async function readBlob(b: Blob): Promise<string> {
  return new TextDecoder().decode(new Uint8Array(await b.arrayBuffer()));
}

async function seedSmall() {
  const c = await createClient(clientInput({ desbloqueoTipo: 'pin', desbloqueoCodigo: '1234' }));
  const c2 = await createClient(clientInput({ nombre: 'Luis "Güero" Pérez', telefono: '55 0000 1111', notas: '=SUM(A1)' }));
  await createExpense(expenseInput({ clienteId: c.id }));
  const item = await createInventoryItem(itemInput({ stock: 4 }), { registrarGasto: true });
  await consumeInventory(item.id, { cantidad: 1, clienteId: c.id });
  await addClientPhotos(c.id, [new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/jpeg' })], { caption: 'Pantalla rota' });
  return { c, c2, item };
}

describe('respaldo', () => {
  it('data URL ida y vuelta', async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 254, 255, 128]);
    const url = await blobToDataURL(new Blob([bytes], { type: 'image/png' }));
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    const back = dataURLToBlob(url);
    expect(back.type).toBe('image/png');
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(bytes);
  });

  it('exporta, borra e importa (reemplazar) sin perder nada', async () => {
    const { c } = await seedSmall();
    const before = {
      clients: await db.clients.count(),
      expenses: await db.expenses.count(),
      inventory: await db.inventory.count(),
      movements: await db.movements.count(),
    };
    const blob = await exportBackup();
    const json = JSON.parse(await readBlob(blob));
    expect(json).toMatchObject({ app: 'reparo', schema: 1 });
    expect(json.tables.photos).toHaveLength(1);
    expect(json.tables.photos[0].blob.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect((await db.settings.get('settings'))?.lastBackupAt).not.toBeNull();
    expect((await db.audit.where('action').equals('exportar').count())).toBe(1);

    const auditBefore = await db.audit.count();
    await wipeAllData();
    expect(await db.clients.count()).toBe(0);
    expect(await db.photos.count()).toBe(0);
    expect((await db.meta.get('deviceId'))?.value).toBeTruthy();

    const result = await importBackup(blob, 'replace');
    expect(result).toEqual({ ...before, audit: auditBefore - 1 });
    const restored = await db.clients.get(c.id);
    expect(restored?.desbloqueoCodigo).toBe('1234');
    expect(restored?.folio).toBe(1);
    const photo = (await db.photos.toArray())[0];
    expect(photo.caption).toBe('Pantalla rota');
    expect(new Uint8Array(await photo.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 250]));
    expect((await db.meta.get('folioSeq'))?.value).toBe(2);
    const next = await createClient(clientInput({ nombre: 'Nuevo' }));
    expect(next.folio).toBe(3);
    expect((await db.audit.orderBy('ts').toArray()).some((a) => a.action === 'importar' && a.summary.startsWith('Importó un respaldo (reemplazar)'))).toBe(true);
  });

  it('combinar aplica "gana el más reciente" por updatedAt', async () => {
    const { c, c2 } = await seedSmall();
    const backup = await buildBackup();
    // Cambio local posterior al respaldo: debe conservarse.
    await updateClient(c.id, { telefono: '55 9999 0000' });
    // En el respaldo, c2 tiene una versión más nueva que la local.
    const remoteC2 = backup.tables.clients.find((x) => x.id === c2.id)!;
    remoteC2.nombre = 'Luis Pérez (actualizado)';
    remoteC2.updatedAt = Date.now() + 60_000;
    // Y un cliente que no existe localmente.
    backup.tables.clients.push({ ...remoteC2, id: 'remoto-1', folio: 99, nombre: 'Cliente remoto', updatedAt: 1 });
    const file = new Blob([JSON.stringify(backup)], { type: 'application/json' });

    const r = await importBackup(file, 'merge');
    expect(r.clients).toBe(2);
    expect((await db.clients.get(c.id))?.telefono).toBe('55 9999 0000');
    expect((await db.clients.get(c2.id))?.nombre).toBe('Luis Pérez (actualizado)');
    expect((await db.clients.get('remoto-1'))?.nombre).toBe('Cliente remoto');
    expect(r.movements).toBe(0);
    expect(await db.photos.count()).toBe(1);
    expect((await db.meta.get('folioSeq'))?.value).toBe(99);
  });

  it('rechaza archivos que no son respaldos', async () => {
    await expect(importBackup(new Blob(['hola']), 'merge')).rejects.toBeInstanceOf(BackupError);
    await expect(importBackup(new Blob([JSON.stringify({ app: 'otra', schema: 1, tables: {} })]), 'merge')).rejects.toThrow(
      'El archivo no es un respaldo válido de Reparo',
    );
    await expect(importBackup(new Blob([JSON.stringify({ app: 'reparo', schema: 99, tables: {} })]), 'merge')).rejects.toThrow(
      'versión más reciente',
    );
  });

  it('CSV con BOM, encabezados en español, dinero decimal y fechas legibles', async () => {
    await seedSmall();
    const csv = await readBlob(await exportCSV('clientes'));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe(
      'Folio,Fecha de recepción,Nombre,Teléfono,Correo,Marca,Modelo,IMEI / serie,Servicio,Falla,Estado,Total,Abonado,Saldo,Estado de pago,Método de pago,Fecha de entrega,Garantía (días),Fotos,Notas',
    );
    expect(csv).toContain('2026-11-07 14:32');
    expect(csv).toContain(',2800,1000,1800,Abono parcial,');
    expect(csv).toContain('"Luis ""Güero"" Pérez"');
    expect(csv).toContain(",'=SUM(A1)");
    expect(csv).not.toContain('1234,');
    const gastos = await readBlob(await exportCSV('gastos'));
    expect(gastos).toContain('Pantalla OLED iPhone 13,Pantallas,iParts Mayoreo,2,1450,2900');
    const movs = await readBlob(await exportCSV('movimientos'));
    expect(movs).toContain('Uso en reparación,-1,4,3');
    const act = await readBlob(await exportCSV('actividad'));
    expect(act.split('\r\n')[0]).toBe('﻿Fecha,Acción,Tipo,Registro,Resumen,Detalle');
  });

  it('wipeAllData conserva el tema y el deviceId', async () => {
    await seedSmall();
    await updateSettings({ theme: 'light', businessName: 'CelFix' });
    const device = (await db.meta.get('deviceId'))?.value;
    await wipeAllData();
    const s = await db.settings.get('settings');
    expect(s?.theme).toBe('light');
    expect(s?.businessName).toBe('Mi Servicio Técnico');
    expect((await db.meta.get('deviceId'))?.value).toBe(device);
    expect(await db.audit.count()).toBe(0);
  });
});

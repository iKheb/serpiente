import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { createClient } from '../clients';
import {
  adjustInventory,
  consumeInventory,
  createInventoryItem,
  markOrdered,
  registerWaste,
  restockInventory,
  setReorderFlag,
  updateInventoryItem,
} from '../inventory';
import { ValidationError } from '../errors';
import { runChecks } from '../notifications';
import { clientInput, itemInput, resetDb } from './helpers';

beforeEach(resetDb);

describe('inventario', () => {
  it('alta con gasto de la compra inicial', async () => {
    const item = await createInventoryItem(itemInput({ stock: 4 }), { registrarGasto: true, metodoPago: 'transferencia' });
    const expenses = await db.expenses.toArray();
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({
      concepto: 'Batería iPhone 13',
      categoria: 'baterias',
      inventarioId: item.id,
      clienteId: null,
      cantidad: 4,
      totalCents: 128_000,
      metodoPago: 'transferencia',
    });
    const mvs = await db.movements.toArray();
    expect(mvs).toHaveLength(1);
    expect(mvs[0]).toMatchObject({ type: 'entrada', cantidad: 4, stockAntes: 0, stockDespues: 4, gastoId: expenses[0].id });
    const audit = await db.audit.toArray();
    expect(audit.map((a) => a.entity).sort()).toEqual(['gasto', 'inventario']);
  });

  it('usar una pieza descuenta stock, liga al cliente y no crea gasto', async () => {
    const c = await createClient(clientInput());
    const item = await createInventoryItem(itemInput({ stock: 5 }));
    const mv = await consumeInventory(item.id, { cantidad: 1, clienteId: c.id });
    expect(mv).toMatchObject({ type: 'uso', cantidad: -1, stockAntes: 5, stockDespues: 4, clienteId: c.id, costoUnitarioCents: 32_000 });
    expect((await db.inventory.get(item.id))?.stock).toBe(4);
    expect(await db.expenses.count()).toBe(0);
    const a = (await db.audit.where('action').equals('movimiento').toArray())[0];
    expect(a).toMatchObject({ entity: 'inventario', entityId: item.id, summary: 'Usó 1 pieza en el servicio de Ana López' });
    expect(a.changes).toEqual([{ field: 'stock', label: 'Stock', from: 5, to: 4, fromText: '5', toText: '4' }]);
  });

  it('stock insuficiente lanza un error en español', async () => {
    const item = await createInventoryItem(itemInput({ stock: 2 }));
    await expect(consumeInventory(item.id, { cantidad: 3 })).rejects.toBeInstanceOf(ValidationError);
    await expect(consumeInventory(item.id, { cantidad: 3 })).rejects.toMatchObject({
      fields: { cantidad: 'Stock insuficiente: sólo quedan 2 unidades de Batería iPhone 13' },
    });
    await expect(consumeInventory(item.id, { cantidad: 0 })).rejects.toMatchObject({ fields: { cantidad: 'La cantidad debe ser al menos 1' } });
    expect((await db.inventory.get(item.id))?.stock).toBe(2);
    expect(await db.movements.count()).toBe(1);
  });

  it('reponer con gasto limpia el pedido y la marca de reorden', async () => {
    const item = await createInventoryItem(itemInput({ stock: 1 }));
    await markOrdered(item.id, true);
    await setReorderFlag(item.id, true);
    const { movement, expense } = await restockInventory(item.id, { cantidad: 5, costoUnitarioCents: 30_000, registrarGasto: true, proveedor: 'TecnoPartes Express' });
    expect(movement).toMatchObject({ type: 'entrada', cantidad: 5, stockAntes: 1, stockDespues: 6, gastoId: expense!.id });
    expect(expense).toMatchObject({ concepto: 'Batería iPhone 13', categoria: 'baterias', inventarioId: item.id, clienteId: null, totalCents: 150_000, proveedor: 'TecnoPartes Express' });
    const after = await db.inventory.get(item.id);
    expect(after).toMatchObject({ stock: 6, pedidoAt: null, marcadoReorden: false, costoUnitarioCents: 30_000 });
    const summaries = (await db.audit.where('entityId').equals(item.id).sortBy('ts')).map((a) => a.summary);
    expect(summaries).toEqual(['Agregó un artículo al inventario', 'Marcó como pedido al proveedor', 'Marcó para volver a pedir', 'Repuso 5 unidades']);

    const sinGasto = await restockInventory(item.id, { cantidad: 1, registrarGasto: false });
    expect(sinGasto.expense).toBeNull();
    expect(await db.expenses.count()).toBe(1);
  });

  it('ajuste, merma y edición del stock generan movimientos', async () => {
    const item = await createInventoryItem(itemInput({ stock: 3 }));
    const adj = await adjustInventory(item.id, { nuevoStock: 2, nota: 'Conteo físico' });
    expect(adj).toMatchObject({ type: 'ajuste', cantidad: -1, stockDespues: 2 });
    const waste = await registerWaste(item.id, { cantidad: 1, nota: 'Llegó defectuosa' });
    expect(waste).toMatchObject({ type: 'merma', cantidad: -1, stockDespues: 1 });
    await expect(registerWaste(item.id, { cantidad: 5 })).rejects.toBeInstanceOf(ValidationError);
    await updateInventoryItem(item.id, { stock: 10, ubicacion: 'Cajón B1' });
    const mvs = await db.movements.where('itemId').equals(item.id).sortBy('ts');
    expect(mvs.map((m) => m.type)).toEqual(['entrada', 'ajuste', 'merma', 'ajuste']);
    const summaries = (await db.audit.where('action').equals('movimiento').sortBy('ts')).map((a) => a.summary);
    expect(summaries).toEqual(['Ajustó el stock de 3 a 2', 'Registró 1 pieza como merma']);
  });

  it('al llegar al mínimo dispara la alerta de stock bajo (una sola vez por nivel)', async () => {
    const item = await createInventoryItem(itemInput({ stock: 3, stockMinimo: 2 }));
    await consumeInventory(item.id, { cantidad: 1 });
    await runChecks(Date.now(), ['stock']);
    const notifs = await db.notifications.toArray();
    expect(notifs).toHaveLength(1);
    expect(notifs[0]).toMatchObject({ kind: 'stock_bajo', title: 'Stock bajo: Batería iPhone 13', dedupeKey: `stock:${item.id}:2`, href: `#/inventario/${item.id}` });
    await consumeInventory(item.id, { cantidad: 2 });
    await runChecks(Date.now(), ['stock']);
    const titles = (await db.notifications.orderBy('ts').toArray()).map((n) => n.title);
    expect(titles).toContain('Se agotó: Batería iPhone 13');
    expect(titles).toHaveLength(2);
  });
});

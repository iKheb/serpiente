import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { createClient, updateClient } from '../clients';
import { createInventoryItem, restockInventory, consumeInventory } from '../inventory';
import { createExpense } from '../expenses';
import {
  clearNotifications,
  deleteNotification,
  markAllNotificationsRead,
  onNotificationCreated,
  runNotificationChecks,
} from '../notifications';
import { updateSettings } from '../settings';
import type { AppNotification } from '../types';
import { clientInput, expenseInput, itemInput, resetDb } from './helpers';

beforeEach(resetDb);

const DAY = 86_400_000;

describe('runNotificationChecks', () => {
  it('deduplica: la misma alerta no se repite aunque se borre', async () => {
    // Al crear un artículo agotado la regla de stock se evalúa de inmediato.
    await createInventoryItem(itemInput({ stock: 0, stockMinimo: 2 }));
    const stored = await db.notifications.toArray();
    expect(stored.map((n) => n.kind)).toEqual(['stock_bajo']);
    expect(await runNotificationChecks()).toEqual([]);
    await deleteNotification(stored[0].id);
    expect(await runNotificationChecks()).toEqual([]);
    await clearNotifications();
    expect(await runNotificationChecks()).toEqual([]);
  });

  it('vuelve a avisar si el problema se resolvió y reaparece', async () => {
    const item = await createInventoryItem(itemInput({ stock: 2, stockMinimo: 2 }));
    expect(await db.notifications.count()).toBe(1);
    await restockInventory(item.id, { cantidad: 5, registrarGasto: false });
    expect(await runNotificationChecks()).toEqual([]);
    const heard: AppNotification[] = [];
    const off = onNotificationCreated((n) => heard.push(n));
    await consumeInventory(item.id, { cantidad: 5 });
    off();
    expect(heard).toHaveLength(1);
    expect(heard[0].dedupeKey).toBe(`stock:${item.id}:2`);
    expect(await db.notifications.count()).toBe(2);
  });

  it('respeta los interruptores de ajustes', async () => {
    await updateSettings({ notifyLowStock: false });
    await createInventoryItem(itemInput({ stock: 0 }));
    expect(await runNotificationChecks()).toEqual([]);
    await updateSettings({ notifyLowStock: true, notificationsEnabled: false });
    expect(await runNotificationChecks()).toEqual([]);
    await updateSettings({ notificationsEnabled: true });
    expect(await runNotificationChecks()).toHaveLength(1);
  });

  it('equipo listo sin entregar y saldo pendiente', async () => {
    const now = Date.now();
    const listo = await createClient(clientInput({ nombre: 'Ana López', fecha: now - 6 * DAY }));
    await updateClient(listo.id, { estado: 'listo' });
    // El equipo lleva 5 días listo (simulado moviendo la fecha de la auditoría).
    await db.audit.where('entityId').equals(listo.id).modify((a) => {
      a.ts -= 5 * DAY;
    });
    const deudor = await createClient(clientInput({ nombre: 'Luis Pérez', modelo: 'Galaxy A15', marca: 'Samsung', fecha: now - DAY }));
    await updateClient(deudor.id, { estado: 'entregado', pagadoCents: 150_000 });

    const created = await runNotificationChecks(now);
    const listoN = created.find((n) => n.kind === 'listo_sin_entregar')!;
    expect(listoN.dedupeKey).toBe(`listo:${listo.id}`);
    expect(listoN.body).toBe('El iPhone 13 de Ana López está listo desde hace 5 días. Avísale que puede pasar por él.');
    expect(listoN.href).toBe(`#/clientes/${listo.id}`);
    const saldo = created.find((n) => n.kind === 'pago_pendiente')!;
    expect(saldo).toMatchObject({ title: 'Saldo pendiente de Luis Pérez', dedupeKey: `saldo:${deudor.id}`, body: 'Se entregó el Galaxy A15 con $1,300.00 por cobrar.' });
  });

  it('garantía por vencer, resumen diario, respaldo y meta', async () => {
    const now = new Date();
    now.setHours(21, 0, 0, 0);
    const ts = now.getTime();
    const c = await createClient(clientInput({ fecha: ts - 29 * DAY - HOUR(2) }));
    await updateClient(c.id, { estado: 'entregado', fechaEntrega: ts - 29 * DAY, pagadoCents: 280_000 });
    await createClient(clientInput({ nombre: 'Hoy', fecha: ts - HOUR(3), cobroCents: 500_000, pagadoCents: 500_000 }));
    await createExpense(expenseInput({ fecha: ts - HOUR(4), cantidad: 1, costoUnitarioCents: 100_000 }));
    await db.clients.toCollection().modify((x) => {
      x.createdAt -= 30 * DAY;
    });
    await updateSettings({ monthlyGoalCents: 100_000 });

    const created = await runNotificationChecks(ts);
    const kinds = created.map((n) => n.kind).sort();
    expect(kinds).toEqual(['garantia', 'meta', 'respaldo', 'resumen']);
    const resumen = created.find((n) => n.kind === 'resumen')!;
    expect(resumen.body).toBe('Cobraste $5,000.00, gastaste $1,000.00 y ganaste $4,000.00 con 1 servicio.');
    expect(resumen.href).toBe('#/reportes?periodo=week');
    expect(created.find((n) => n.kind === 'garantia')!.dedupeKey).toBe(`garantia:${c.id}`);
    expect(created.find((n) => n.kind === 'respaldo')!.href).toBe('#/ajustes');
    expect(await runNotificationChecks(ts)).toEqual([]);
  });

  it('agrupa muchas alertas del mismo tipo y avisa a los oyentes', async () => {
    // Simula datos que llegan de golpe (importación): cinco artículos agotados a la vez.
    for (let i = 0; i < 5; i++) await createInventoryItem(itemInput({ nombre: `Pieza ${i}`, stock: 5 }));
    await db.inventory.toCollection().modify({ stock: 0 });
    const heard: AppNotification[] = [];
    const off = onNotificationCreated((n) => heard.push(n));
    const created = await runNotificationChecks();
    off();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ title: '5 repuestos por pedir', href: '#/inventario?filtro=pedir' });
    expect(heard).toEqual(created);
    expect(await runNotificationChecks()).toEqual([]);
    await markAllNotificationsRead();
    expect((await db.notifications.toArray()).every((n) => n.readAt != null)).toBe(true);
  });
});

function HOUR(n: number) {
  return n * 3_600_000;
}

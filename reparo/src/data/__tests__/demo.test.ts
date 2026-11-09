import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db';
import { seedDemoData } from '../demo';
import { computeSummary } from '../reports';
import { getPeriod } from '../periods';
import { stockStatus } from '../derive';
import { runNotificationChecks } from '../notifications';
import { resetDb } from './helpers';

describe('seedDemoData', () => {
  let elapsed = 0;

  beforeAll(async () => {
    await resetDb();
    const t0 = performance.now();
    await seedDemoData();
    elapsed = performance.now() - t0;
  }, 30_000);

  it('carga ~90 días de servicios con folios consecutivos', async () => {
    const clients = await db.clients.toArray();
    expect(clients.length).toBeGreaterThan(300);
    expect(clients.length).toBeLessThan(800);
    const folios = clients.map((c) => c.folio).sort((a, b) => a - b);
    expect(folios[0]).toBe(1);
    expect(folios[folios.length - 1]).toBe(clients.length);
    expect(new Set(folios).size).toBe(clients.length);
    const seq = await db.meta.get('folioSeq');
    expect(seq?.value).toBe(clients.length);
    const oldest = Math.min(...clients.map((c) => c.fecha));
    expect(Date.now() - oldest).toBeLessThan(91 * 86_400_000);
    expect(clients.every((c) => c.numFotos === 0)).toBe(true);
    expect(clients.every((c) => c.pagadoCents >= 0 && c.pagadoCents <= c.cobroCents)).toBe(true);
  });

  it('incluye patrones, PIN y estados realistas', async () => {
    const clients = (await db.clients.toArray()).filter((c) => c.deletedAt == null);
    expect(clients.some((c) => c.desbloqueoTipo === 'patron' && c.desbloqueoPatron.length >= 4)).toBe(true);
    expect(clients.some((c) => c.desbloqueoTipo === 'pin' && /^\d{4,6}$/.test(c.desbloqueoCodigo))).toBe(true);
    const estados = new Set(clients.map((c) => c.estado));
    for (const e of ['entregado', 'listo', 'reparando', 'cancelado']) expect(estados.has(e as never)).toBe(true);
    const cancelados = clients.filter((c) => c.estado === 'cancelado').length / clients.length;
    expect(cancelados).toBeLessThan(0.06);
    expect(clients.filter((c) => c.estado === 'entregado').every((c) => c.fechaEntrega != null)).toBe(true);
  });

  it('deja una ganancia positiva y creíble en el mes actual', async () => {
    const month = getPeriod('month', Date.now(), 1);
    const s = computeSummary(month, await db.clients.toArray(), await db.expenses.toArray());
    expect(s.gananciaCents).toBeGreaterThan(0);
    if (s.cobradoCents > 0) {
      expect(s.margen!).toBeGreaterThan(0.1);
      expect(s.margen!).toBeLessThan(0.95);
    }
  });

  it('mantiene el inventario coherente con sus movimientos', async () => {
    const items = (await db.inventory.toArray()).filter((i) => i.deletedAt == null);
    expect(items.length).toBeGreaterThanOrEqual(26);
    const movements = await db.movements.toArray();
    for (const item of items) {
      const mvs = movements.filter((m) => m.itemId === item.id).sort((a, b) => a.ts - b.ts);
      let stock = 0;
      for (const m of mvs) {
        expect(m.stockAntes).toBe(stock);
        expect(m.stockDespues).toBe(stock + m.cantidad);
        expect(m.stockDespues).toBeGreaterThanOrEqual(0);
        stock = m.stockDespues;
      }
      expect(stock).toBe(item.stock);
    }
    const statuses = items.map(stockStatus);
    expect(statuses.filter((s) => s === 'pedido').length).toBe(2);
    expect(items.filter((i) => i.stock === 0).length).toBeGreaterThanOrEqual(2);
    expect(statuses.filter((s) => s === 'bajo').length).toBeGreaterThan(0);
    expect(movements.some((m) => m.type === 'uso' && m.clienteId)).toBe(true);
    const gastosInventario = (await db.expenses.toArray()).filter((e) => e.inventarioId);
    expect(gastosInventario.length).toBeGreaterThan(20);
  });

  it('tiene papelera, auditoría y notificaciones coherentes', async () => {
    const [clients, expenses, inventory] = await Promise.all([db.clients.toArray(), db.expenses.toArray(), db.inventory.toArray()]);
    const trash = [...clients, ...expenses, ...inventory].filter((r) => r.deletedAt != null);
    expect(trash.length).toBeGreaterThanOrEqual(3);
    expect(trash.length).toBeLessThanOrEqual(4);
    const audit = await db.audit.toArray();
    expect(audit.filter((a) => a.action === 'eliminar').length).toBe(trash.length);
    expect(audit.filter((a) => a.action === 'crear' && a.entity === 'cliente').length).toBe(clients.length);
    // El desbloqueo nunca aparece en claro en la auditoría.
    const pins = new Set(clients.map((c) => c.desbloqueoCodigo).filter(Boolean));
    for (const a of audit) {
      for (const ch of a.changes) {
        if (ch.field === 'desbloqueoCodigo') expect(pins.has(String(ch.toText))).toBe(false);
      }
      if (a.entity === 'cliente' && a.snapshot) {
        const snap = a.snapshot as { desbloqueoPatron?: number[]; desbloqueoCodigo?: string };
        expect(snap.desbloqueoPatron ?? []).toEqual([]);
        expect(pins.has(snap.desbloqueoCodigo ?? '')).toBe(false);
      }
    }
    const notifs = await db.notifications.toArray();
    expect(notifs.length).toBeGreaterThanOrEqual(4);
    expect(notifs.length).toBeLessThanOrEqual(6);
    expect(notifs.some((n) => n.readAt == null)).toBe(true);
    expect(notifs.some((n) => n.readAt != null)).toBe(true);
    // Tras cargar la demo, una revisión no genera una avalancha de alertas.
    const fresh = await runNotificationChecks();
    expect(fresh.length).toBeLessThanOrEqual(1);
  });

  it('es determinista y rápida', async () => {
    const first = (await db.clients.orderBy('fecha').toArray()).slice(0, 20).map((c) => [c.nombre, c.modelo, c.cobroCents]);
    await seedDemoData();
    const second = (await db.clients.orderBy('fecha').toArray()).slice(0, 20).map((c) => [c.nombre, c.modelo, c.cobroCents]);
    expect(second).toEqual(first);
    // En navegador real tarda bastante menos; fake-indexeddb es más lento.
    expect(elapsed).toBeLessThan(8000);
  }, 30_000);
});

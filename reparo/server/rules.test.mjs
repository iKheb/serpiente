// @vitest-environment node
// Pruebas de las reglas de notificación del servidor y del resumen diario.
import assert from 'node:assert/strict';
import { describe, it } from './lib/testkit.mjs';
import { SyncStore } from './lib/store.mjs';
import { dailySummaryPayload, eventsFromSync, formatFolio, localDayRange, scheduleDailySummary } from './lib/rules.mjs';

const item = (stock, extra = {}) => ({ id: 'i1', nombre: 'Pantalla OLED iPhone 12', stock, stockMinimo: 2, deletedAt: null, updatedAt: 1, deviceId: 'A', ...extra });
const cliente = (estado, extra = {}) => ({ id: 'c1', folio: 42, nombre: 'Ana López', marca: 'Apple', modelo: 'iPhone 13', servicio: 'Cambio de pantalla', estado, deletedAt: null, ...extra });

describe('reglas push tras sincronizar', () => {
  it('stock bajo sólo al CRUZAR el mínimo', () => {
    const [ev] = eventsFromSync([{ table: 'inventory', row: item(1), prev: item(3) }]);
    assert.equal(ev.payload.title, 'Stock bajo: Pantalla OLED iPhone 12 (quedan 1)');
    assert.equal(ev.payload.kind, 'stock_bajo');
    assert.equal(ev.payload.href, '#/inventario/i1');
    assert.equal(ev.payload.tag, 'stock-i1');
    assert.deepEqual(Object.keys(ev.payload).sort(), ['body', 'href', 'kind', 'tag', 'title']);
    // Ya estaba bajo → no se repite. Registro nuevo → no notifica. En papelera → no.
    assert.equal(eventsFromSync([{ table: 'inventory', row: item(0), prev: item(1) }]).length, 0);
    assert.equal(eventsFromSync([{ table: 'inventory', row: item(0), prev: null }]).length, 0);
    assert.equal(eventsFromSync([{ table: 'inventory', row: item(0, { deletedAt: 5 }), prev: item(5) }]).length, 0);
    // Justo en el mínimo cuenta como bajo.
    assert.equal(eventsFromSync([{ table: 'inventory', row: item(2), prev: item(3) }]).length, 1);
  });

  it('agrupa muchos artículos en una sola notificación', () => {
    const accepted = Array.from({ length: 6 }, (_, i) => ({ table: 'inventory', row: item(0, { id: `i${i}`, nombre: `Pieza ${i}` }), prev: item(9, { id: `i${i}` }) }));
    const evs = eventsFromSync(accepted);
    assert.equal(evs.length, 1);
    assert.equal(evs[0].payload.title, 'Stock bajo en 6 artículos');
    assert.equal(evs[0].payload.href, '#/inventario?filtro=pedir');
  });

  it('equipo listo para entregar cuando el estado pasa a "listo"', () => {
    const [ev] = eventsFromSync([{ table: 'clients', row: cliente('listo'), prev: cliente('reparando') }]);
    assert.equal(ev.payload.title, 'Equipo listo para entregar: Ana López · Apple iPhone 13');
    assert.equal(ev.payload.body, 'Folio #000042 · Cambio de pantalla');
    assert.equal(ev.payload.href, '#/clientes/c1');
    assert.equal(ev.urgency, 'high');
    assert.equal(eventsFromSync([{ table: 'clients', row: cliente('listo', { pagadoCents: 5 }), prev: cliente('listo') }]).length, 0);
    assert.equal(formatFolio(7), '#000007');
  });
});

describe('resumen diario', () => {
  it('formatea cobrado/gastado/ganancia con Intl en la moneda configurada', () => {
    const now = new Date(2026, 10, 8, 20, 0).getTime();
    const p = dailySummaryPayload({ cobradoCents: 125050, gastadoCents: 40000, gananciaCents: 85050, servicios: 3 }, { now, locale: 'es-MX', currency: 'MXN' });
    assert.equal(p.title, 'Resumen de hoy · 8 nov');
    assert.equal(p.body, 'Cobrado $1,250.50 · Gastado $400.00 · Ganancia $850.50 · 3 servicios');
    assert.equal(p.kind, 'resumen');
    const vacio = dailySummaryPayload({ cobradoCents: 0, gastadoCents: 0, gananciaCents: 0, servicios: 0 }, { now });
    assert.equal(vacio.body, 'Hoy no se registraron cobros ni gastos.');
  });

  it('se envía una sola vez al día a la hora indicada, con los datos sincronizados', async () => {
    const store = new SyncStore();
    const at = (h, m = 0) => new Date(2026, 10, 8, h, m).getTime();
    const { start } = localDayRange(at(12));
    store.sync({
      deviceId: 'A',
      cursor: 0,
      changes: {
        clients: [{ id: 'c1', updatedAt: 1, deviceId: 'A', fecha: start + 3600e3, pagadoCents: 30000, estado: 'entregado', deletedAt: null }],
        expenses: [{ id: 'e1', updatedAt: 1, deviceId: 'A', fecha: start + 7200e3, totalCents: 12000, deletedAt: null }],
      },
    });
    store.upsertSubscription({ endpoint: 'https://push.example.com/x', deviceId: 'B', p256dh: 'p', auth: 'a' });
    const sent = [];
    const push = { notify: async (payload, opts) => sent.push({ payload, opts }) };
    let now = at(19, 59);
    const stop = scheduleDailySummary({ store, push, hour: 20, locale: 'es-MX', currency: 'MXN', clock: () => now, intervalMs: 5 });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(sent.length, 0, 'antes de la hora no envía');
    now = at(20, 1);
    await new Promise((r) => setTimeout(r, 30));
    now = at(20, 30);
    await new Promise((r) => setTimeout(r, 30));
    stop();
    assert.equal(sent.length, 1, 'una sola vez por día');
    assert.equal(sent[0].payload.body, 'Cobrado $300.00 · Gastado $120.00 · Ganancia $180.00 · 1 servicio');
    assert.equal(sent[0].opts.urgency, 'low');
    store.close();
  });
});

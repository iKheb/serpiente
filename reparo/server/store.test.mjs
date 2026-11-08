// @vitest-environment node
// Pruebas del almacén de sincronización: fusión LWW, append-only, cursores y paginación.
import assert from 'node:assert/strict';
import { describe, it } from './lib/testkit.mjs';
import { SyncStore, SyncValidationError, lwwWins } from './lib/store.mjs';

const client = (id, updatedAt, deviceId, extra = {}) => ({
  id,
  folio: 1,
  nombre: `Cliente ${id}`,
  estado: 'recibido',
  cobroCents: 10000,
  pagadoCents: 0,
  fecha: updatedAt,
  createdAt: updatedAt,
  updatedAt,
  deletedAt: null,
  deviceId,
  rev: 1,
  ...extra,
});
const movement = (id, ts, deviceId = 'A') => ({ id, itemId: 'i1', type: 'uso', cantidad: -1, stockAntes: 2, stockDespues: 1, ts, deviceId });
const audit = (id, ts, extra = {}) => ({ id, ts, action: 'editar', entity: 'cliente', entityId: 'c1', title: 't', summary: 's', changes: [], snapshot: null, deviceId: 'A', ...extra });

describe('fusión LWW', () => {
  it('compara updatedAt, luego deviceId y luego rev', () => {
    assert.equal(lwwWins({ updatedAt: 2, deviceId: 'a' }, { updatedAt: 1, deviceId: 'z' }), true);
    assert.equal(lwwWins({ updatedAt: 1, deviceId: 'z' }, { updatedAt: 2, deviceId: 'a' }), false);
    assert.equal(lwwWins({ updatedAt: 5, deviceId: 'b' }, { updatedAt: 5, deviceId: 'a' }), true);
    assert.equal(lwwWins({ updatedAt: 5, deviceId: 'a' }, { updatedAt: 5, deviceId: 'b' }), false);
    assert.equal(lwwWins({ updatedAt: 5, deviceId: 'a', rev: 3 }, { updatedAt: 5, deviceId: 'a', rev: 2 }), true);
    assert.equal(lwwWins({ updatedAt: 5, deviceId: 'a', rev: 2 }, { updatedAt: 5, deviceId: 'a', rev: 2 }), false);
  });

  it('la versión más nueva gana, la vieja se ignora y el empate lo gana el deviceId mayor', () => {
    const s = new SyncStore();
    s.sync({ deviceId: 'A', cursor: 0, changes: { clients: [client('c1', 100, 'A', { nombre: 'v1' })] } });
    // Más vieja: no cambia nada.
    let r = s.sync({ deviceId: 'B', cursor: 0, changes: { clients: [client('c1', 50, 'B', { nombre: 'vieja' })] } });
    assert.equal(r.response.accepted, 0);
    assert.equal(r.response.unchanged, 1);
    assert.equal(s.getRow('clients', 'c1').nombre, 'v1');
    // Más nueva: gana.
    r = s.sync({ deviceId: 'B', cursor: 0, changes: { clients: [client('c1', 200, 'B', { nombre: 'v2' })] } });
    assert.equal(r.response.accepted, 1);
    assert.equal(s.getRow('clients', 'c1').nombre, 'v2');
    // Empate de updatedAt: gana el deviceId mayor ("C" > "B").
    s.sync({ deviceId: 'C', cursor: 0, changes: { clients: [client('c1', 200, 'C', { nombre: 'v3-C' })] } });
    assert.equal(s.getRow('clients', 'c1').nombre, 'v3-C');
    s.sync({ deviceId: 'A', cursor: 0, changes: { clients: [client('c1', 200, 'A', { nombre: 'v3-A' })] } });
    assert.equal(s.getRow('clients', 'c1').nombre, 'v3-C');
    // Reenvío idéntico: idempotente, no consume seq.
    const seq = s.maxSeq();
    r = s.sync({ deviceId: 'C', cursor: 0, changes: { clients: [client('c1', 200, 'C', { nombre: 'v3-C' })] } });
    assert.equal(r.response.accepted, 0);
    assert.equal(s.maxSeq(), seq);
    s.close();
  });

  it('devuelve la versión previa para que las reglas detecten transiciones', () => {
    const s = new SyncStore();
    s.sync({ deviceId: 'A', cursor: 0, changes: { clients: [client('c1', 1, 'A')] } });
    const { merge } = s.sync({ deviceId: 'A', cursor: 0, changes: { clients: [client('c1', 2, 'A', { estado: 'listo' })] } });
    assert.equal(merge.accepted[0].prev.estado, 'recibido');
    assert.equal(merge.accepted[0].row.estado, 'listo');
    s.close();
  });
});

describe('append-only (movements, audit)', () => {
  it('inserta por id y nunca sobrescribe', () => {
    const s = new SyncStore();
    s.sync({ deviceId: 'A', cursor: 0, changes: { movements: [movement('m1', 10)], audit: [audit('a1', 10)] } });
    const r = s.sync({
      deviceId: 'B',
      cursor: 0,
      changes: { movements: [{ ...movement('m1', 99), nota: 'cambiada' }, movement('m2', 5)], audit: [audit('a1', 99, { title: 'otro' })] },
    });
    assert.equal(r.response.accepted, 1);
    assert.equal(s.getRow('movements', 'm1').ts, 10);
    assert.equal(s.getRow('movements', 'm1').nota, undefined);
    assert.equal(s.getRow('audit', 'a1').title, 't');
    assert.deepEqual(s.counts(), { clients: 0, expenses: 0, inventory: 0, movements: 2, audit: 1 });
    s.close();
  });

  it('una purga en la auditoría borra la fila y deja lápida contra versiones viejas', () => {
    const s = new SyncStore();
    s.sync({ deviceId: 'A', cursor: 0, changes: { clients: [client('c9', 100, 'A')] } });
    s.sync({ deviceId: 'A', cursor: 0, changes: { audit: [audit('p1', 150, { action: 'purgar', entityId: 'c9' })] } });
    assert.equal(s.getRow('clients', 'c9'), null);
    // Otro dispositivo, sin enterarse, reenvía una versión anterior a la purga → no resucita.
    s.sync({ deviceId: 'B', cursor: 0, changes: { clients: [client('c9', 120, 'B')] } });
    assert.equal(s.getRow('clients', 'c9'), null);
    // Una edición posterior a la purga sí gana (LWW).
    s.sync({ deviceId: 'B', cursor: 0, changes: { clients: [client('c9', 200, 'B', { nombre: 'revivido' })] } });
    assert.equal(s.getRow('clients', 'c9').nombre, 'revivido');
    s.close();
  });
});

describe('cursores y paginación', () => {
  it('asigna seq global incremental y no devuelve al emisor lo que acaba de enviar', () => {
    const s = new SyncStore();
    const a = s.sync({ deviceId: 'A', cursor: 0, changes: { clients: [client('c1', 1, 'A'), client('c2', 2, 'A')], movements: [movement('m1', 3)] } });
    assert.equal(a.response.cursor, 3);
    assert.equal(a.response.changes.clients.length, 0);
    assert.deepEqual(a.merge.accepted.map((x) => x.seq), [1, 2, 3]);

    const b = s.sync({ deviceId: 'B', cursor: 0, changes: { expenses: [{ id: 'e1', updatedAt: 4, deviceId: 'B', totalCents: 500, fecha: 4 }] } });
    assert.equal(b.response.cursor, 4);
    assert.equal(b.response.changes.clients.length, 2);
    assert.equal(b.response.changes.movements.length, 1);
    assert.equal(b.response.changes.expenses.length, 0, 'no se le devuelve su propio gasto');

    const a2 = s.sync({ deviceId: 'A', cursor: a.response.cursor, changes: {} });
    assert.equal(a2.response.changes.expenses.length, 1);
    assert.equal(a2.response.changes.clients.length, 0);
    assert.equal(a2.response.cursor, 4);
    assert.equal(a2.response.more, false);
    s.close();
  });

  it('pagina con more:true cuando hay más filas que el tamaño de página', () => {
    const s = new SyncStore();
    const rows = Array.from({ length: 12 }, (_, i) => client(`c${String(i).padStart(2, '0')}`, i + 1, 'A'));
    s.sync({ deviceId: 'A', cursor: 0, changes: { clients: rows } });
    let cursor = 0;
    const seen = [];
    let pages = 0;
    for (;;) {
      const { response } = s.sync({ deviceId: 'B', cursor, changes: {} }, { pageSize: 5 });
      pages++;
      seen.push(...response.changes.clients.map((c) => c.id));
      cursor = response.cursor;
      if (!response.more) break;
    }
    assert.equal(pages, 3);
    assert.equal(cursor, 12);
    assert.deepEqual(seen, rows.map((r) => r.id));
    s.close();
  });

  it('el tamaño de página por defecto es 2000', () => {
    const s = new SyncStore();
    const rows = Array.from({ length: 2001 }, (_, i) => movement(`m${i}`, i));
    s.sync({ deviceId: 'A', cursor: 0, changes: { movements: rows } });
    const p1 = s.sync({ deviceId: 'B', cursor: 0, changes: {} }).response;
    assert.equal(p1.changes.movements.length, 2000);
    assert.equal(p1.more, true);
    assert.equal(p1.cursor, 2000);
    const p2 = s.sync({ deviceId: 'B', cursor: p1.cursor, changes: {} }).response;
    assert.equal(p2.changes.movements.length, 1);
    assert.equal(p2.more, false);
    s.close();
  });

  it('pide resincronizar si el cursor del cliente es mayor que el del servidor', () => {
    const s = new SyncStore();
    s.sync({ deviceId: 'A', cursor: 0, changes: { clients: [client('c1', 1, 'A')] } });
    const r = s.sync({ deviceId: 'B', cursor: 999, changes: {} }).response;
    assert.equal(r.resync, true);
    assert.equal(r.changes.clients.length, 1);
    assert.equal(r.cursor, 1);
    s.close();
  });
});

describe('validación', () => {
  it('ignora tablas que no se sincronizan y rechaza filas inválidas', () => {
    const s = new SyncStore();
    const r = s.sync({
      deviceId: 'A',
      cursor: 0,
      changes: {
        notifications: [{ id: 'n1' }],
        settings: [{ id: 'settings' }],
        photos: [{ id: 'p1' }],
        clients: [client('ok', 1, 'A'), { id: 'sin-fecha' }, 'basura', { updatedAt: 5 }],
        movements: [{ id: 'sin-ts' }],
      },
    }).response;
    assert.deepEqual(r.ignoredTables.sort(), ['notifications', 'photos', 'settings']);
    assert.equal(r.accepted, 1);
    assert.equal(r.rejected, 4);
    s.close();
  });

  it('lanza SyncValidationError con mensajes en español', () => {
    const s = new SyncStore();
    assert.throws(() => s.sync({ cursor: 0, changes: {} }), (e) => e instanceof SyncValidationError && /deviceId/.test(e.message));
    assert.throws(() => s.sync({ deviceId: 'A', cursor: -1 }), /cursor/);
    assert.throws(() => s.sync({ deviceId: 'A', cursor: 0, changes: { clients: {} } }), /lista/);
    s.close();
  });
});

describe('totales del día', () => {
  it('suma cobrado (sin cancelados ni papelera) y gastado del rango', () => {
    const s = new SyncStore();
    s.sync({
      deviceId: 'A',
      cursor: 0,
      changes: {
        clients: [
          client('c1', 10, 'A', { fecha: 1000, pagadoCents: 15000 }),
          client('c2', 10, 'A', { fecha: 1500, pagadoCents: 5000, estado: 'cancelado' }),
          client('c3', 10, 'A', { fecha: 1500, pagadoCents: 7000, deletedAt: 20 }),
          client('c4', 10, 'A', { fecha: 5000, pagadoCents: 9999 }),
        ],
        expenses: [
          { id: 'e1', updatedAt: 1, deviceId: 'A', fecha: 1200, totalCents: 4000, deletedAt: null },
          { id: 'e2', updatedAt: 1, deviceId: 'A', fecha: 9000, totalCents: 100, deletedAt: null },
        ],
      },
    });
    const t = s.totals(0, 2000);
    assert.equal(t.cobradoCents, 15000);
    assert.equal(t.gastadoCents, 4000);
    assert.equal(t.gananciaCents, 11000);
    assert.equal(t.servicios, 1);
    s.close();
  });
});

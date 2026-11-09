import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { createClient, deleteClient, purgeClient, restoreClient, updateClient } from '../clients';
import { ValidationError } from '../errors';
import { validateClientInput } from '../schemas';
import { createExpense, deleteExpense, restoreExpense, updateExpense } from '../expenses';
import { clientInput, expenseInput, resetDb } from './helpers';

beforeEach(resetDb);

describe('clientes', () => {
  it('crea con folio consecutivo y audita en la misma transacción', async () => {
    const a = await createClient(clientInput({ nombre: '  Ana   López ' }));
    const b = await createClient(clientInput({ nombre: 'Luis Pérez' }));
    expect(a.nombre).toBe('Ana López');
    expect(a.folio).toBe(1);
    expect(b.folio).toBe(2);
    expect(a.numFotos).toBe(0);
    expect(a.rev).toBe(1);
    expect((await db.meta.get('folioSeq'))?.value).toBe(2);
    const audit = await db.audit.where('entityId').equals(a.id).toArray();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'crear', entity: 'cliente', title: 'Ana López · iPhone 13', summary: 'Registró un nuevo cliente' });
    expect(audit[0].changes.find((c) => c.field === 'cobroCents')?.toText).toBe('$2,800.00');
  });

  it('el folio sigue siendo único aunque se creen clientes en paralelo', async () => {
    const created = await Promise.all(Array.from({ length: 8 }, (_, i) => createClient(clientInput({ nombre: `Cliente ${i}` }))));
    expect(new Set(created.map((c) => c.folio)).size).toBe(8);
    expect(Math.max(...created.map((c) => c.folio))).toBe(8);
  });

  it('valida en español y limita el abono al total', async () => {
    await expect(createClient(clientInput({ nombre: '   ' }))).rejects.toBeInstanceOf(ValidationError);
    try {
      await createClient(clientInput({ nombre: '', cobroCents: -5 }));
    } catch (e) {
      expect((e as ValidationError).fields).toMatchObject({ nombre: 'El nombre es obligatorio', cobroCents: 'El monto no puede ser negativo' });
    }
    expect(validateClientInput(clientInput({ pagadoCents: 999_999 }))).toEqual({ pagadoCents: 'El abono no puede ser mayor que el total' });
    const c = await createClient(clientInput({ pagadoCents: 999_999 }));
    expect(c.pagadoCents).toBe(c.cobroCents);
  });

  it('edita con diff, sin cambios no audita y marca la entrega', async () => {
    const c = await createClient(clientInput());
    const same = await updateClient(c.id, { nombre: 'Ana López ' });
    expect(same.rev).toBe(1);
    expect(await db.audit.count()).toBe(1);

    const u = await updateClient(c.id, { estado: 'entregado', pagadoCents: 280_000 });
    expect(u.rev).toBe(2);
    expect(u.fechaEntrega).not.toBeNull();
    const last = await db.audit.orderBy('ts').last();
    expect(last?.summary).toBe('Entregó el equipo y cobró $1,800.00');
    expect(last?.changes.map((x) => x.field).sort()).toEqual(['estado', 'fechaEntrega', 'pagadoCents']);

    const back = await updateClient(c.id, { estado: 'listo' });
    expect(back.fechaEntrega).toBeNull();
  });

  it('nunca guarda el desbloqueo en claro en la auditoría', async () => {
    const c = await createClient(clientInput({ marca: 'Samsung', modelo: 'Galaxy A15', desbloqueoTipo: 'patron', desbloqueoPatron: [0, 1, 2, 4, 6, 7, 8] }));
    expect(c.desbloqueoPatron).toEqual([0, 1, 2, 4, 6, 7, 8]);
    await updateClient(c.id, { desbloqueoTipo: 'pin', desbloqueoCodigo: '482913' });
    const entries = await db.audit.toArray();
    const json = JSON.stringify(entries);
    expect(json).not.toContain('482913');
    expect(json).not.toContain('[0,1,2,4,6,7,8]');
    const edit = entries.find((e) => e.action === 'editar')!;
    expect(edit.summary).toBe('Actualizó los datos de desbloqueo');
    expect(edit.changes).toHaveLength(3);
    expect(edit.changes.find((x) => x.field === 'desbloqueoCodigo')?.toText).toBe('PIN ••••');
    // El patrón anterior se descarta al cambiar de tipo.
    expect((await db.clients.get(c.id))?.desbloqueoPatron).toEqual([]);
  });

  it('valida el patrón y el PIN', () => {
    expect(validateClientInput(clientInput({ desbloqueoTipo: 'patron', desbloqueoPatron: [0, 1] })).desbloqueoPatron).toBe(
      'El patrón debe unir al menos 4 puntos',
    );
    expect(validateClientInput(clientInput({ desbloqueoTipo: 'pin', desbloqueoCodigo: '12a4' })).desbloqueoCodigo).toBe(
      'El PIN sólo puede tener números',
    );
  });

  it('papelera: eliminar, restaurar y purgar', async () => {
    const c = await createClient(clientInput());
    await deleteClient(c.id);
    expect((await db.clients.get(c.id))?.deletedAt).not.toBeNull();
    await restoreClient(c.id);
    expect((await db.clients.get(c.id))?.deletedAt).toBeNull();
    await purgeClient(c.id);
    expect(await db.clients.get(c.id)).toBeUndefined();
    const actions = (await db.audit.where('entityId').equals(c.id).sortBy('ts')).map((a) => [a.action, a.summary]);
    expect(actions).toEqual([
      ['crear', 'Registró un nuevo cliente'],
      ['eliminar', 'Envió a la papelera'],
      ['restaurar', 'Restauró desde la papelera'],
      ['purgar', 'Eliminó definitivamente'],
    ]);
  });
});

describe('gastos', () => {
  it('calcula el total y audita con el nombre del cliente', async () => {
    const c = await createClient(clientInput());
    const e = await createExpense(expenseInput({ clienteId: c.id, concepto: ' Pantalla OLED iPhone 13 ' }));
    expect(e.totalCents).toBe(290_000);
    expect(e.concepto).toBe('Pantalla OLED iPhone 13');
    const a = await db.audit.where('entityId').equals(e.id).first();
    expect(a?.title).toBe('Pantalla OLED iPhone 13');
    expect(a?.changes.find((x) => x.field === 'clienteId')?.toText).toBe('Ana López · iPhone 13');

    const u = await updateExpense(e.id, { cantidad: 3 });
    expect(u.totalCents).toBe(435_000);
    const edit = (await db.audit.where('entityId').equals(e.id).sortBy('ts')).pop();
    expect(edit?.summary).toBe('Editó 1 campo');
    expect(edit?.changes.find((x) => x.field === 'totalCents')).toMatchObject({ fromText: '$2,900.00', toText: '$4,350.00' });

    await deleteExpense(e.id);
    await restoreExpense(e.id);
    expect((await db.expenses.get(e.id))?.deletedAt).toBeNull();
  });

  it('rechaza montos negativos y cantidades inválidas', async () => {
    await expect(createExpense(expenseInput({ costoUnitarioCents: -1 }))).rejects.toMatchObject({
      fields: { costoUnitarioCents: 'El monto no puede ser negativo' },
    });
    await expect(createExpense(expenseInput({ cantidad: 0 }))).rejects.toMatchObject({
      fields: { cantidad: 'La cantidad debe ser al menos 1' },
    });
  });
});

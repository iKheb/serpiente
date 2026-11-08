/* Mutaciones de gastos. totalCents = cantidad × costoUnitarioCents (lo calcula esta capa). */
import type { Expense, ExpenseInput, ID } from './types';
import { db, dbReady, getDeviceId } from './db';
import { newId } from './ids';
import { NotFoundError } from './errors';
import { expenseInputSchema, normalizeExpenseInput, parseOrThrow, pickExpenseInput } from './schemas';
import { clientTitle } from './derive';
import { SUMMARY, diffFields, expenseTitle, summarizeGenericEdit, writeAudit, type NameLookup } from './audit';
import { stripUndefined } from './util';

/** Resuelve nombres de cliente / artículo para la auditoría (dentro de la transacción). */
export async function lookupNames(clientIds: (ID | null | undefined)[], itemIds: (ID | null | undefined)[]): Promise<NameLookup> {
  const clients = new Map<ID, string>();
  const items = new Map<ID, string>();
  const cIds = [...new Set(clientIds.filter((x): x is ID => !!x))];
  const iIds = [...new Set(itemIds.filter((x): x is ID => !!x))];
  if (cIds.length) {
    const rows = await db.clients.bulkGet(cIds);
    rows.forEach((c, idx) => {
      if (c) clients.set(cIds[idx], clientTitle(c));
    });
  }
  if (iIds.length) {
    const rows = await db.inventory.bulkGet(iIds);
    rows.forEach((it, idx) => {
      if (it) items.set(iIds[idx], it.nombre);
    });
  }
  return { clients, items };
}

export function computeTotal(cantidad: number, costoUnitarioCents: number): number {
  return Math.round(cantidad * costoUnitarioCents);
}

/** Construye un gasto completo a partir de una entrada ya normalizada y validada. */
export function buildExpense(data: ExpenseInput, now: number, id: ID = newId()): Expense {
  return {
    ...data,
    totalCents: computeTotal(data.cantidad, data.costoUnitarioCents),
    id,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: getDeviceId(),
    rev: 1,
  };
}

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  await dbReady();
  const data = parseOrThrow(expenseInputSchema, normalizeExpenseInput(pickExpenseInput(input))) as ExpenseInput;
  const now = Date.now();
  return db.transaction('rw', [db.expenses, db.clients, db.inventory, db.audit], async () => {
    const expense = buildExpense(data, now);
    await db.expenses.add(expense);
    const names = await lookupNames([expense.clienteId], [expense.inventarioId]);
    await writeAudit({
      action: 'crear',
      entity: 'gasto',
      entityId: expense.id,
      title: expenseTitle(expense),
      summary: SUMMARY.crearGasto,
      changes: diffFields('gasto', null, expense as unknown as Record<string, unknown>, names),
      snapshot: expense,
      ts: now,
    });
    return expense;
  });
}

export async function updateExpense(id: ID, patch: Partial<ExpenseInput>): Promise<Expense> {
  await dbReady();
  return db.transaction('rw', [db.expenses, db.clients, db.inventory, db.audit], async () => {
    const current = await db.expenses.get(id);
    if (!current) throw new NotFoundError('El gasto ya no existe');
    const merged = parseOrThrow(
      expenseInputSchema,
      normalizeExpenseInput({ ...pickExpenseInput(current), ...stripUndefined(patch) }),
    ) as ExpenseInput;
    const next: Expense = { ...current, ...merged, totalCents: computeTotal(merged.cantidad, merged.costoUnitarioCents) };
    const names = await lookupNames([current.clienteId, next.clienteId], [current.inventarioId, next.inventarioId]);
    const changes = diffFields(
      'gasto',
      current as unknown as Record<string, unknown>,
      next as unknown as Record<string, unknown>,
      names,
    );
    if (changes.length === 0) return current;
    const visible = changes.filter((c) => c.field !== 'totalCents');
    const now = Date.now();
    const updated: Expense = { ...next, updatedAt: now, rev: (current.rev || 0) + 1, deviceId: getDeviceId() };
    await db.expenses.put(updated);
    await writeAudit({
      action: 'editar',
      entity: 'gasto',
      entityId: id,
      title: expenseTitle(updated),
      summary: summarizeGenericEdit(visible.length ? visible : changes),
      changes,
      snapshot: updated,
      ts: now,
    });
    return updated;
  });
}

async function setExpenseDeleted(id: ID, deleted: boolean): Promise<void> {
  await dbReady();
  await db.transaction('rw', [db.expenses, db.audit], async () => {
    const current = await db.expenses.get(id);
    if (!current) throw new NotFoundError('El gasto ya no existe');
    if ((current.deletedAt != null) === deleted) return;
    const now = Date.now();
    const updated: Expense = {
      ...current,
      deletedAt: deleted ? now : null,
      updatedAt: now,
      rev: (current.rev || 0) + 1,
      deviceId: getDeviceId(),
    };
    await db.expenses.put(updated);
    await writeAudit({
      action: deleted ? 'eliminar' : 'restaurar',
      entity: 'gasto',
      entityId: id,
      title: expenseTitle(current),
      summary: deleted ? SUMMARY.eliminar : SUMMARY.restaurar,
      snapshot: deleted ? current : updated,
      ts: now,
    });
  });
}

export function deleteExpense(id: ID): Promise<void> {
  return setExpenseDeleted(id, true);
}

export function restoreExpense(id: ID): Promise<void> {
  return setExpenseDeleted(id, false);
}

export async function purgeExpense(id: ID): Promise<void> {
  await dbReady();
  await db.transaction('rw', [db.expenses, db.audit], async () => {
    const current = await db.expenses.get(id);
    if (!current) return;
    await db.expenses.delete(id);
    await writeAudit({
      action: 'purgar',
      entity: 'gasto',
      entityId: id,
      title: expenseTitle(current),
      summary: SUMMARY.purgar,
      snapshot: current,
    });
  });
}

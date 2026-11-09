/* Mutaciones de inventario y movimientos de stock.
   Reponer puede crear un gasto (vinculado con inventarioId); usar una pieza NO
   crea gasto, sólo descuenta stock (movimiento 'uso', opcionalmente ligado a un cliente). */
import type {
  Expense,
  FieldChange,
  ID,
  InventoryItem,
  InventoryItemInput,
  InventoryMovement,
  InventoryMovementType,
  PaymentMethod,
  Timestamp,
} from './types';
import { db, dbReady, getDeviceId } from './db';
import { newId } from './ids';
import { NotFoundError, ValidationError } from './errors';
import { inventoryItemInputSchema, normalizeInventoryInput, parseOrThrow, pickInventoryInput } from './schemas';
import {
  SUMMARY,
  diffFields,
  inventoryTitle,
  stockChange,
  summarizeAdjust,
  summarizeGenericEdit,
  summarizeRestock,
  summarizeUse,
  summarizeWaste,
  writeAudit,
} from './audit';
import { buildExpense } from './expenses';
import { runChecks } from './notifications';
import { stripUndefined, plural } from './util';

function bump(item: InventoryItem, patch: Partial<InventoryItem>, now: number): InventoryItem {
  return { ...item, ...patch, updatedAt: now, rev: (item.rev || 0) + 1, deviceId: getDeviceId() };
}

function buildMovement(
  item: InventoryItem,
  type: InventoryMovementType,
  cantidad: number,
  o: { clienteId?: ID | null; gastoId?: ID | null; nota?: string; ts?: Timestamp; costoUnitarioCents?: number },
): InventoryMovement {
  return {
    id: newId(),
    itemId: item.id,
    type,
    cantidad,
    stockAntes: item.stock,
    stockDespues: item.stock + cantidad,
    costoUnitarioCents: o.costoUnitarioCents ?? item.costoUnitarioCents,
    clienteId: o.clienteId ?? null,
    gastoId: o.gastoId ?? null,
    nota: (o.nota ?? '').trim(),
    ts: o.ts ?? Date.now(),
    deviceId: getDeviceId(),
  };
}

async function getActiveItem(itemId: ID): Promise<InventoryItem> {
  const item = await db.inventory.get(itemId);
  if (!item) throw new NotFoundError('El artículo ya no existe');
  if (item.deletedAt != null) throw new ValidationError({ item: 'El artículo está en la papelera; restáuralo primero' });
  return item;
}

function requirePositiveInt(n: number, field = 'cantidad'): number {
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new ValidationError({ [field]: 'La cantidad debe ser un número entero' });
  if (n < 1) throw new ValidationError({ [field]: 'La cantidad debe ser al menos 1' });
  if (n > 100_000) throw new ValidationError({ [field]: 'La cantidad es demasiado grande' });
  return n;
}

/**
 * Tras bajar el stock: evalúa la regla de stock bajo (respetando los ajustes).
 * Un fallo aquí nunca invalida la mutación, que ya se guardó.
 */
async function triggerLowStock(item: InventoryItem): Promise<void> {
  if (item.stock > item.stockMinimo) return;
  try {
    await runChecks(Date.now(), ['stock']);
  } catch (err) {
    console.error('[reparo] aviso de stock bajo falló', err);
  }
}

/* ---------------------------------- CRUD --------------------------------- */

export async function createInventoryItem(
  input: InventoryItemInput,
  opts: { registrarGasto?: boolean; metodoPago?: PaymentMethod } = {},
): Promise<InventoryItem> {
  await dbReady();
  const data = parseOrThrow(inventoryItemInputSchema, normalizeInventoryInput(pickInventoryInput(input))) as InventoryItemInput;
  const now = Date.now();
  const item: InventoryItem = {
    ...data,
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deviceId: getDeviceId(),
    rev: 1,
  };

  await db.transaction('rw', [db.inventory, db.expenses, db.movements, db.audit], async () => {
    await db.inventory.add(item);
    let expense: Expense | null = null;
    if (opts.registrarGasto && item.stock > 0) {
      expense = buildExpense(
        {
          concepto: item.nombre,
          categoria: item.categoria,
          proveedor: item.proveedor,
          cantidad: item.stock,
          costoUnitarioCents: item.costoUnitarioCents,
          clienteId: null,
          inventarioId: item.id,
          metodoPago: opts.metodoPago ?? 'efectivo',
          fecha: now,
          notas: 'Compra inicial de inventario',
        },
        now,
      );
      await db.expenses.add(expense);
    }
    if (item.stock > 0) {
      await db.movements.add({
        ...buildMovement({ ...item, stock: 0 }, 'entrada', item.stock, { gastoId: expense?.id ?? null, nota: 'Stock inicial', ts: now }),
      });
    }
    await writeAudit({
      action: 'crear',
      entity: 'inventario',
      entityId: item.id,
      title: inventoryTitle(item),
      summary: SUMMARY.crearInventario,
      changes: diffFields('inventario', null, item as unknown as Record<string, unknown>),
      snapshot: item,
      ts: now,
    });
    if (expense) {
      await writeAudit({
        action: 'crear',
        entity: 'gasto',
        entityId: expense.id,
        title: expense.concepto,
        summary: `Registró la compra de ${plural(expense.cantidad, 'unidad', 'unidades')}`,
        changes: diffFields('gasto', null, expense as unknown as Record<string, unknown>, {
          items: new Map([[item.id, item.nombre]]),
        }),
        snapshot: expense,
        ts: now,
      });
    }
  });
  await triggerLowStock(item);
  return item;
}

export async function updateInventoryItem(id: ID, patch: Partial<InventoryItemInput>): Promise<InventoryItem> {
  await dbReady();
  const result = await db.transaction('rw', [db.inventory, db.movements, db.audit], async () => {
    const current = await db.inventory.get(id);
    if (!current) throw new NotFoundError('El artículo ya no existe');
    const merged = parseOrThrow(
      inventoryItemInputSchema,
      normalizeInventoryInput({ ...pickInventoryInput(current), ...stripUndefined(patch) }),
    ) as InventoryItemInput;
    const next: InventoryItem = { ...current, ...merged };
    const changes = diffFields('inventario', current as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>);
    if (changes.length === 0) return current;
    const now = Date.now();
    const updated = bump(current, merged, now);
    await db.inventory.put(updated);
    if (updated.stock !== current.stock) {
      // Editar el stock desde el formulario equivale a un ajuste de conteo.
      await db.movements.add(
        buildMovement(current, 'ajuste', updated.stock - current.stock, { nota: 'Edición del artículo', ts: now }),
      );
    }
    await writeAudit({
      action: 'editar',
      entity: 'inventario',
      entityId: id,
      title: inventoryTitle(updated),
      summary: summarizeGenericEdit(changes),
      changes,
      snapshot: updated,
      ts: now,
    });
    return updated;
  });
  await triggerLowStock(result);
  return result;
}

async function setItemDeleted(id: ID, deleted: boolean): Promise<void> {
  await dbReady();
  await db.transaction('rw', [db.inventory, db.audit], async () => {
    const current = await db.inventory.get(id);
    if (!current) throw new NotFoundError('El artículo ya no existe');
    if ((current.deletedAt != null) === deleted) return;
    const now = Date.now();
    const updated = bump(current, { deletedAt: deleted ? now : null }, now);
    await db.inventory.put(updated);
    await writeAudit({
      action: deleted ? 'eliminar' : 'restaurar',
      entity: 'inventario',
      entityId: id,
      title: inventoryTitle(current),
      summary: deleted ? SUMMARY.eliminar : SUMMARY.restaurar,
      snapshot: deleted ? current : updated,
      ts: now,
    });
  });
}

export function deleteInventoryItem(id: ID): Promise<void> {
  return setItemDeleted(id, true);
}

export function restoreInventoryItem(id: ID): Promise<void> {
  return setItemDeleted(id, false);
}

/** Elimina definitivamente el artículo (sus movimientos se conservan como historial). */
export async function purgeInventoryItem(id: ID): Promise<void> {
  await dbReady();
  await db.transaction('rw', [db.inventory, db.audit], async () => {
    const current = await db.inventory.get(id);
    if (!current) return;
    await db.inventory.delete(id);
    await writeAudit({
      action: 'purgar',
      entity: 'inventario',
      entityId: id,
      title: inventoryTitle(current),
      summary: SUMMARY.purgar,
      snapshot: current,
    });
  });
}

/* ------------------------------ Movimientos ------------------------------ */

/** Usa piezas en una reparación (movimiento 'uso'). No crea gasto. */
export async function consumeInventory(
  itemId: ID,
  o: { cantidad: number; clienteId?: ID | null; nota?: string; ts?: Timestamp },
): Promise<InventoryMovement> {
  await dbReady();
  const cantidad = requirePositiveInt(o.cantidad);
  const { movement, item } = await db.transaction('rw', [db.inventory, db.movements, db.clients, db.audit], async () => {
    const current = await getActiveItem(itemId);
    if (current.stock < cantidad) {
      throw new ValidationError({
        cantidad:
          current.stock <= 0
            ? `No hay stock de ${current.nombre}`
            : `Stock insuficiente: sólo ${current.stock === 1 ? 'queda 1 unidad' : `quedan ${current.stock} unidades`} de ${current.nombre}`,
      });
    }
    let clientName: string | null = null;
    let clienteId: ID | null = o.clienteId ?? null;
    if (clienteId) {
      const client = await db.clients.get(clienteId);
      if (!client) throw new ValidationError({ clienteId: 'El cliente seleccionado ya no existe' });
      clientName = client.nombre;
    } else {
      clienteId = null;
    }
    const now = Date.now();
    const mv = buildMovement(current, 'uso', -cantidad, { clienteId, nota: o.nota, ts: o.ts ?? now });
    const updated = bump(current, { stock: mv.stockDespues }, now);
    await db.movements.add(mv);
    await db.inventory.put(updated);
    await writeAudit({
      action: 'movimiento',
      entity: 'inventario',
      entityId: itemId,
      title: inventoryTitle(updated),
      summary: summarizeUse(cantidad, clientName),
      changes: [stockChange(current.stock, updated.stock)],
      snapshot: updated,
      ts: now,
    });
    return { movement: mv, item: updated };
  });
  await triggerLowStock(item);
  return movement;
}

/** Repone stock (movimiento 'entrada'); con `registrarGasto` crea el gasto en la misma transacción. */
export async function restockInventory(
  itemId: ID,
  o: {
    cantidad: number;
    costoUnitarioCents?: number;
    registrarGasto: boolean;
    proveedor?: string;
    metodoPago?: PaymentMethod;
    nota?: string;
    ts?: Timestamp;
  },
): Promise<{ movement: InventoryMovement; expense: Expense | null }> {
  await dbReady();
  const cantidad = requirePositiveInt(o.cantidad);
  if (o.costoUnitarioCents != null && (!Number.isInteger(o.costoUnitarioCents) || o.costoUnitarioCents < 0)) {
    throw new ValidationError({ costoUnitarioCents: 'El costo no puede ser negativo' });
  }
  return db.transaction('rw', [db.inventory, db.movements, db.expenses, db.audit], async () => {
    const current = await getActiveItem(itemId);
    const now = Date.now();
    const ts = o.ts ?? now;
    const costo = o.costoUnitarioCents ?? current.costoUnitarioCents;
    const proveedor = (o.proveedor ?? '').trim() || current.proveedor;

    let expense: Expense | null = null;
    if (o.registrarGasto) {
      expense = buildExpense(
        {
          concepto: current.nombre,
          categoria: current.categoria,
          proveedor,
          cantidad,
          costoUnitarioCents: costo,
          clienteId: null,
          inventarioId: current.id,
          metodoPago: o.metodoPago ?? 'efectivo',
          fecha: ts,
          notas: (o.nota ?? '').trim(),
        },
        now,
      );
      await db.expenses.add(expense);
    }

    const mv = buildMovement(current, 'entrada', cantidad, {
      gastoId: expense?.id ?? null,
      nota: o.nota,
      ts,
      costoUnitarioCents: costo,
    });
    const updated = bump(
      current,
      { stock: mv.stockDespues, pedidoAt: null, marcadoReorden: false, costoUnitarioCents: costo, proveedor },
      now,
    );
    await db.movements.add(mv);
    await db.inventory.put(updated);

    const changes: FieldChange[] = [stockChange(current.stock, updated.stock)];
    changes.push(
      ...diffFields(
        'inventario',
        { costoUnitarioCents: current.costoUnitarioCents, proveedor: current.proveedor, pedidoAt: current.pedidoAt, marcadoReorden: current.marcadoReorden },
        { costoUnitarioCents: updated.costoUnitarioCents, proveedor: updated.proveedor, pedidoAt: updated.pedidoAt, marcadoReorden: updated.marcadoReorden },
      ),
    );
    await writeAudit({
      action: 'movimiento',
      entity: 'inventario',
      entityId: itemId,
      title: inventoryTitle(updated),
      summary: summarizeRestock(cantidad),
      changes,
      snapshot: updated,
      ts: now,
    });
    if (expense) {
      await writeAudit({
        action: 'crear',
        entity: 'gasto',
        entityId: expense.id,
        title: expense.concepto,
        summary: `Registró la compra de ${plural(cantidad, 'unidad', 'unidades')}`,
        changes: diffFields('gasto', null, expense as unknown as Record<string, unknown>, {
          items: new Map([[current.id, current.nombre]]),
        }),
        snapshot: expense,
        ts: now,
      });
    }
    return { movement: mv, expense };
  });
}

/** Corrige el conteo (movimiento 'ajuste'). Con el mismo valor, registra la confirmación del conteo. */
export async function adjustInventory(itemId: ID, o: { nuevoStock: number; nota?: string }): Promise<InventoryMovement> {
  await dbReady();
  const nuevo = o.nuevoStock;
  if (!Number.isFinite(nuevo) || !Number.isInteger(nuevo)) throw new ValidationError({ nuevoStock: 'El stock debe ser un número entero' });
  if (nuevo < 0) throw new ValidationError({ nuevoStock: 'El stock no puede ser negativo' });
  if (nuevo > 1_000_000) throw new ValidationError({ nuevoStock: 'La cantidad es demasiado grande' });
  const { movement, item } = await db.transaction('rw', [db.inventory, db.movements, db.audit], async () => {
    const current = await getActiveItem(itemId);
    const now = Date.now();
    const mv = buildMovement(current, 'ajuste', nuevo - current.stock, { nota: o.nota, ts: now });
    const updated = bump(current, { stock: nuevo }, now);
    await db.movements.add(mv);
    await db.inventory.put(updated);
    await writeAudit({
      action: 'movimiento',
      entity: 'inventario',
      entityId: itemId,
      title: inventoryTitle(updated),
      summary: summarizeAdjust(current.stock, nuevo),
      changes: [stockChange(current.stock, nuevo)],
      snapshot: updated,
      ts: now,
    });
    return { movement: mv, item: updated };
  });
  await triggerLowStock(item);
  return movement;
}

/** Registra piezas dañadas / defectuosas (movimiento 'merma'). */
export async function registerWaste(itemId: ID, o: { cantidad: number; nota?: string }): Promise<InventoryMovement> {
  await dbReady();
  const cantidad = requirePositiveInt(o.cantidad);
  const { movement, item } = await db.transaction('rw', [db.inventory, db.movements, db.audit], async () => {
    const current = await getActiveItem(itemId);
    if (current.stock < cantidad) {
      throw new ValidationError({
        cantidad: current.stock <= 0 ? `No hay stock de ${current.nombre}` : `Sólo hay ${plural(current.stock, 'unidad', 'unidades')} en stock`,
      });
    }
    const now = Date.now();
    const mv = buildMovement(current, 'merma', -cantidad, { nota: o.nota, ts: now });
    const updated = bump(current, { stock: mv.stockDespues }, now);
    await db.movements.add(mv);
    await db.inventory.put(updated);
    await writeAudit({
      action: 'movimiento',
      entity: 'inventario',
      entityId: itemId,
      title: inventoryTitle(updated),
      summary: summarizeWaste(cantidad),
      changes: [stockChange(current.stock, updated.stock)],
      snapshot: updated,
      ts: now,
    });
    return { movement: mv, item: updated };
  });
  await triggerLowStock(item);
  return movement;
}

/** Marca (o desmarca) el artículo como pedido al proveedor. */
export async function markOrdered(itemId: ID, ordered: boolean): Promise<void> {
  await dbReady();
  await db.transaction('rw', [db.inventory, db.audit], async () => {
    const current = await db.inventory.get(itemId);
    if (!current) throw new NotFoundError('El artículo ya no existe');
    if ((current.pedidoAt != null) === ordered) return;
    const now = Date.now();
    const updated = bump(current, { pedidoAt: ordered ? now : null }, now);
    await db.inventory.put(updated);
    await writeAudit({
      action: 'editar',
      entity: 'inventario',
      entityId: itemId,
      title: inventoryTitle(updated),
      summary: ordered ? SUMMARY.pedido : SUMMARY.quitarPedido,
      changes: diffFields('inventario', { pedidoAt: current.pedidoAt }, { pedidoAt: updated.pedidoAt }),
      snapshot: updated,
      ts: now,
    });
  });
}

/** Marca (o desmarca) el artículo para volver a pedir aunque tenga stock. */
export async function setReorderFlag(itemId: ID, flag: boolean): Promise<void> {
  await dbReady();
  await db.transaction('rw', [db.inventory, db.audit], async () => {
    const current = await db.inventory.get(itemId);
    if (!current) throw new NotFoundError('El artículo ya no existe');
    if (current.marcadoReorden === flag) return;
    const now = Date.now();
    const updated = bump(current, { marcadoReorden: flag }, now);
    await db.inventory.put(updated);
    await writeAudit({
      action: 'editar',
      entity: 'inventario',
      entityId: itemId,
      title: inventoryTitle(updated),
      summary: flag ? SUMMARY.reorden : SUMMARY.quitarReorden,
      changes: diffFields('inventario', { marcadoReorden: current.marcadoReorden }, { marcadoReorden: flag }),
      snapshot: updated,
      ts: now,
    });
  });
}

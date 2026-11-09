/* Acciones de inventario con feedback (toasts) y el store de diálogos de movimiento. */
import { useSyncExternalStore } from 'react';
import { navigate } from '@/app/router';
import { confirm, toast } from '@/ui';
import {
  consumeInventory,
  deleteInventoryItem,
  formatMoney,
  markOrdered,
  restockInventory,
  restoreInventoryItem,
  setReorderFlag,
  type ID,
  type InventoryItem,
  type PaymentMethod,
} from '@/data';
import { errorMessage, plural } from './lib';

/* ------------------------- Store de diálogos ---------------------------- */

export type ActionKind = 'usar' | 'reponer' | 'recibir' | 'ajustar' | 'merma';

export interface ActionState {
  kind: ActionKind;
  itemId: ID;
  /** Cantidad sugerida (p. ej. la de la lista de compras al recibir). */
  cantidad?: number;
  seq: number;
}

let state: ActionState | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openAction(kind: ActionKind, item: Pick<InventoryItem, 'id'>, extra: { cantidad?: number } = {}) {
  state = { kind, itemId: item.id, cantidad: extra.cantidad, seq: ++seq };
  emit();
}

export function closeAction() {
  state = null;
  emit();
}

export function useActionState(): ActionState | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

/* ------------------------------ Mutaciones ------------------------------ */

/** Usa piezas y avisa: "Usaste 1 · Pantalla iPhone 12 · Quedan 2" (+ aviso si llegó al mínimo). */
export async function consumeParts(
  item: InventoryItem,
  cantidad: number,
  o: { clienteId?: ID | null; clienteNombre?: string; backToClient?: boolean; nota?: string } = {},
): Promise<boolean> {
  try {
    const mv = await consumeInventory(item.id, { cantidad, clienteId: o.clienteId ?? null, nota: o.nota });
    const quedan = mv.stockDespues;
    const clienteId = o.clienteId;
    toast.success(`Usaste ${cantidad} · ${item.nombre} · ${quedan === 1 ? 'Queda 1' : `Quedan ${quedan}`}`, {
      description: o.clienteNombre ? `Vinculado a ${o.clienteNombre}` : undefined,
      action: clienteId
        ? { label: o.backToClient ? 'Volver al cliente' : 'Ver cliente', onClick: () => navigate(`#/clientes/${clienteId}`) }
        : undefined,
    });
    const crossed = quedan <= item.stockMinimo && item.pedidoAt == null;
    if (crossed) {
      toast.warning(quedan <= 0 ? 'Se agotó — agregado a Por pedir' : 'Llegó al mínimo — agregado a Por pedir', {
        description: `${item.nombre} · mínimo ${item.stockMinimo}`,
        action: { label: 'Ver lista', onClick: () => navigate('#/inventario?filtro=pedir') },
      });
    }
    return true;
  } catch (err) {
    toast.error('No se pudo usar la pieza', { description: errorMessage(err) });
    return false;
  }
}

export async function restockParts(
  item: InventoryItem,
  o: { cantidad: number; costoUnitarioCents: number; registrarGasto: boolean; metodoPago?: PaymentMethod; nota?: string; recibir?: boolean },
): Promise<boolean> {
  try {
    const { movement, expense } = await restockInventory(item.id, {
      cantidad: o.cantidad,
      costoUnitarioCents: o.costoUnitarioCents,
      registrarGasto: o.registrarGasto,
      metodoPago: o.metodoPago,
      nota: o.nota,
    });
    toast.success(`${o.recibir ? 'Recibiste' : 'Repusiste'} ${o.cantidad} · ${item.nombre} · Ahora hay ${movement.stockDespues}`, {
      description: expense ? `Gasto registrado por ${formatMoney(expense.totalCents)}` : 'Sin registrar gasto',
      action: expense ? { label: 'Ver gasto', onClick: () => navigate(`#/gastos/${expense.id}`) } : undefined,
    });
    return true;
  } catch (err) {
    toast.error('No se pudo reponer', { description: errorMessage(err) });
    return false;
  }
}

export async function toggleOrdered(item: InventoryItem, ordered = item.pedidoAt == null) {
  try {
    await markOrdered(item.id, ordered);
    toast({
      tone: ordered ? 'info' : 'neutral',
      title: ordered ? `Marcado como pedido · ${item.nombre}` : `Pedido quitado · ${item.nombre}`,
      description: ordered ? 'Lo verás en «Pedidos» hasta que lo recibas.' : undefined,
      action: { label: 'Deshacer', onClick: () => void markOrdered(item.id, !ordered) },
      duration: 6000,
    });
  } catch (err) {
    toast.error('No se pudo actualizar el pedido', { description: errorMessage(err) });
  }
}

export async function markManyOrdered(items: InventoryItem[]) {
  if (!items.length) return;
  try {
    for (const i of items) await markOrdered(i.id, true);
    toast({
      tone: 'info',
      title: `${plural(items.length, 'artículo marcado', 'artículos marcados')} como pedido`,
      description: 'Recíbelos desde «Pedidos» cuando lleguen.',
      action: {
        label: 'Deshacer',
        onClick: () => {
          void (async () => {
            for (const i of items) await markOrdered(i.id, false);
          })();
        },
      },
      duration: 7000,
    });
  } catch (err) {
    toast.error('No se pudieron marcar los pedidos', { description: errorMessage(err) });
  }
}

export async function toggleReorder(item: InventoryItem, flag = !item.marcadoReorden) {
  try {
    await setReorderFlag(item.id, flag);
    toast({
      tone: flag ? 'warning' : 'neutral',
      title: flag ? `Agregado a Por pedir · ${item.nombre}` : `Quitado de Por pedir · ${item.nombre}`,
      action: { label: 'Deshacer', onClick: () => void setReorderFlag(item.id, !flag) },
    });
  } catch (err) {
    toast.error('No se pudo actualizar', { description: errorMessage(err) });
  }
}

/** Confirma, envía a la papelera y ofrece "Deshacer". Devuelve true si se eliminó. */
export async function deleteItem(item: InventoryItem): Promise<boolean> {
  const ok = await confirm({
    title: `¿Eliminar «${item.nombre}»?`,
    description: 'Se enviará a la papelera junto con su ficha. Su historial de movimientos se conserva y puedes restaurarlo cuando quieras.',
    tone: 'danger',
    confirmLabel: 'Eliminar artículo',
  });
  if (!ok) return false;
  try {
    await deleteInventoryItem(item.id);
    toast.undo(`«${item.nombre}» enviado a la papelera`, () => {
      void restoreInventoryItem(item.id).then(
        () => toast.success('Artículo restaurado', { action: { label: 'Ver', onClick: () => navigate(`#/inventario/${item.id}`) } }),
        (err) => toast.error('No se pudo restaurar', { description: errorMessage(err) }),
      );
    });
    return true;
  } catch (err) {
    toast.error('No se pudo eliminar', { description: errorMessage(err) });
    return false;
  }
}

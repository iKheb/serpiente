import { db, dbReady, ensureSettings } from '../db';
import { defaultSettings } from '../defaults';
import { setCachedSettings } from '../settings-cache';
import { emptyClientInput, emptyExpenseInput, emptyInventoryInput } from '../schemas';
import type { ClientInput, ExpenseInput, InventoryItemInput } from '../types';

/** Deja la base vacía con ajustes por defecto (conserva el deviceId). */
export async function resetDb(): Promise<void> {
  await dbReady();
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      if (t.name === 'meta') await db.meta.where('key').notEqual('deviceId').delete();
      else await t.clear();
    }
  });
  await ensureSettings();
  setCachedSettings(defaultSettings());
}

export function clientInput(patch: Partial<ClientInput> = {}): ClientInput {
  return {
    ...emptyClientInput(),
    nombre: 'Ana López',
    telefono: '55 1234 5678',
    marca: 'Apple',
    modelo: 'iPhone 13',
    servicio: 'Cambio de pantalla',
    falla: 'Pantalla estrellada',
    cobroCents: 280_000,
    pagadoCents: 100_000,
    fecha: new Date(2026, 10, 7, 14, 32).getTime(),
    ...patch,
  };
}

export function expenseInput(patch: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    ...emptyExpenseInput(),
    concepto: 'Pantalla OLED iPhone 13',
    categoria: 'pantallas',
    proveedor: 'iParts Mayoreo',
    cantidad: 2,
    costoUnitarioCents: 145_000,
    fecha: new Date(2026, 10, 7, 10, 0).getTime(),
    ...patch,
  };
}

export function itemInput(patch: Partial<InventoryItemInput> = {}): InventoryItemInput {
  return {
    ...emptyInventoryInput(),
    nombre: 'Batería iPhone 13',
    categoria: 'baterias',
    marca: 'Apple',
    modelo: 'iPhone 13',
    proveedor: 'iParts Mayoreo',
    stock: 3,
    stockMinimo: 2,
    cantidadPedido: 6,
    costoUnitarioCents: 32_000,
    precioVentaCents: 100_000,
    ...patch,
  };
}

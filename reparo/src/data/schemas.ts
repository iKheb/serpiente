/* Esquemas zod, valores vacíos para formularios y normalización de entradas. */
import { z } from 'zod';
import type {
  ClientInput,
  ExpenseCategory,
  ExpenseInput,
  InventoryItemInput,
  PaymentMethod,
  RepairStatus,
  UnlockType,
} from './types';
import { ValidationError } from './errors';

const STATUS_VALUES = ['recibido', 'diagnostico', 'reparando', 'listo', 'entregado', 'cancelado'] as const satisfies readonly RepairStatus[];
const METHOD_VALUES = ['efectivo', 'transferencia', 'tarjeta', 'otro'] as const satisfies readonly PaymentMethod[];
const CATEGORY_VALUES = [
  'pantallas',
  'baterias',
  'puertos',
  'camaras',
  'placas',
  'carcasas',
  'herramientas',
  'accesorios',
  'otros',
] as const satisfies readonly ExpenseCategory[];
const UNLOCK_VALUES = ['ninguno', 'patron', 'pin', 'contrasena'] as const satisfies readonly UnlockType[];

const MAX_CENTS = 100_000_000_000; // mil millones de unidades monetarias
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const text = (max: number, tooLong: string) => z.string({ error: 'Texto no válido' }).trim().max(max, { error: tooLong });

const money = (negative = 'El monto no puede ser negativo') =>
  z
    .number({ error: 'Ingresa un monto válido' })
    .int({ error: 'Ingresa un monto válido' })
    .min(0, { error: negative })
    .max(MAX_CENTS, { error: 'El monto es demasiado grande' });

const timestamp = (msg: string) => z.number({ error: msg }).int({ error: msg }).min(0, { error: msg });

const phone = z
  .string({ error: 'Teléfono no válido' })
  .trim()
  .max(30, { error: 'El teléfono es demasiado largo' })
  .refine((v) => v === '' || /^[\d\s()+.\-/]+$/.test(v), { error: 'El teléfono sólo puede tener números' })
  .refine((v) => v === '' || v.replace(/\D/g, '').length >= 7, { error: 'El teléfono está incompleto' });

/* ------------------------------- Clientes -------------------------------- */

export const clientInputSchema = z
  .object({
    nombre: z
      .string({ error: 'El nombre es obligatorio' })
      .trim()
      .min(1, { error: 'El nombre es obligatorio' })
      .max(120, { error: 'El nombre es demasiado largo' }),
    telefono: phone,
    email: z
      .string({ error: 'Correo no válido' })
      .trim()
      .max(160, { error: 'El correo es demasiado largo' })
      .refine((v) => v === '' || EMAIL_RE.test(v), { error: 'El correo no es válido' }),
    marca: text(60, 'La marca es demasiado larga'),
    modelo: text(80, 'El modelo es demasiado largo'),
    imei: text(40, 'El IMEI es demasiado largo'),
    servicio: text(80, 'El servicio es demasiado largo'),
    falla: text(2000, 'La descripción es demasiado larga'),
    estado: z.enum(STATUS_VALUES, { error: 'Elige un estado' }),
    cobroCents: money(),
    pagadoCents: money('El abono no puede ser negativo'),
    metodoPago: z.enum(METHOD_VALUES, { error: 'Elige un método de pago' }),
    fecha: timestamp('La fecha no es válida'),
    fechaEntrega: timestamp('La fecha de entrega no es válida').nullable(),
    garantiaDias: z
      .number({ error: 'Ingresa los días de garantía' })
      .int({ error: 'La garantía debe ser en días completos' })
      .min(0, { error: 'La garantía no puede ser negativa' })
      .max(3650, { error: 'La garantía no puede pasar de 10 años' }),
    desbloqueoTipo: z.enum(UNLOCK_VALUES, { error: 'Elige el tipo de bloqueo' }),
    desbloqueoPatron: z
      .array(z.number().int().min(0).max(8), { error: 'El patrón no es válido' })
      .max(9, { error: 'El patrón no es válido' }),
    desbloqueoCodigo: z.string({ error: 'Código no válido' }).max(64, { error: 'El código es demasiado largo' }),
    notas: text(4000, 'Las notas son demasiado largas'),
  })
  .superRefine((v, ctx) => {
    if (v.pagadoCents > v.cobroCents) {
      ctx.addIssue({ code: 'custom', path: ['pagadoCents'], message: 'El abono no puede ser mayor que el total' });
    }
    if (v.fechaEntrega != null && v.fechaEntrega < v.fecha - 60_000) {
      ctx.addIssue({
        code: 'custom',
        path: ['fechaEntrega'],
        message: 'La entrega no puede ser anterior a la recepción',
      });
    }
    if (v.desbloqueoTipo === 'patron') {
      const p = v.desbloqueoPatron;
      if (p.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['desbloqueoPatron'], message: 'Dibuja el patrón de desbloqueo' });
      } else if (new Set(p).size !== p.length) {
        ctx.addIssue({ code: 'custom', path: ['desbloqueoPatron'], message: 'El patrón no puede repetir puntos' });
      } else if (p.length < 4) {
        ctx.addIssue({ code: 'custom', path: ['desbloqueoPatron'], message: 'El patrón debe unir al menos 4 puntos' });
      }
    }
    if (v.desbloqueoTipo === 'pin') {
      const pin = v.desbloqueoCodigo.trim();
      if (!pin) ctx.addIssue({ code: 'custom', path: ['desbloqueoCodigo'], message: 'Escribe el PIN del equipo' });
      else if (!/^\d+$/.test(pin))
        ctx.addIssue({ code: 'custom', path: ['desbloqueoCodigo'], message: 'El PIN sólo puede tener números' });
      else if (pin.length < 4 || pin.length > 16)
        ctx.addIssue({ code: 'custom', path: ['desbloqueoCodigo'], message: 'El PIN debe tener de 4 a 16 dígitos' });
    }
    if (v.desbloqueoTipo === 'contrasena' && !v.desbloqueoCodigo) {
      ctx.addIssue({ code: 'custom', path: ['desbloqueoCodigo'], message: 'Escribe la contraseña del equipo' });
    }
  });

/* -------------------------------- Gastos --------------------------------- */

export const expenseInputSchema = z.object({
  concepto: z
    .string({ error: 'El concepto es obligatorio' })
    .trim()
    .min(1, { error: 'El concepto es obligatorio' })
    .max(160, { error: 'El concepto es demasiado largo' }),
  categoria: z.enum(CATEGORY_VALUES, { error: 'Elige una categoría' }),
  proveedor: text(120, 'El proveedor es demasiado largo'),
  cantidad: z
    .number({ error: 'Ingresa la cantidad' })
    .int({ error: 'La cantidad debe ser un número entero' })
    .min(1, { error: 'La cantidad debe ser al menos 1' })
    .max(100_000, { error: 'La cantidad es demasiado grande' }),
  costoUnitarioCents: money(),
  clienteId: z.string().min(1).nullable(),
  inventarioId: z.string().min(1).nullable(),
  metodoPago: z.enum(METHOD_VALUES, { error: 'Elige un método de pago' }),
  fecha: timestamp('La fecha no es válida'),
  notas: text(4000, 'Las notas son demasiado largas'),
});

/* ------------------------------ Inventario ------------------------------- */

const units = (negative: string) =>
  z
    .number({ error: 'Ingresa un número' })
    .int({ error: 'Debe ser un número entero' })
    .min(0, { error: negative })
    .max(1_000_000, { error: 'La cantidad es demasiado grande' });

export const inventoryItemInputSchema = z.object({
  nombre: z
    .string({ error: 'El nombre es obligatorio' })
    .trim()
    .min(1, { error: 'El nombre es obligatorio' })
    .max(160, { error: 'El nombre es demasiado largo' }),
  categoria: z.enum(CATEGORY_VALUES, { error: 'Elige una categoría' }),
  marca: text(60, 'La marca es demasiado larga'),
  modelo: text(160, 'El modelo es demasiado largo'),
  sku: text(60, 'El SKU es demasiado largo'),
  proveedor: text(120, 'El proveedor es demasiado largo'),
  stock: units('El stock no puede ser negativo'),
  stockMinimo: units('El mínimo no puede ser negativo'),
  cantidadPedido: units('La cantidad a pedir no puede ser negativa'),
  costoUnitarioCents: money('El costo no puede ser negativo'),
  precioVentaCents: money('El precio no puede ser negativo'),
  ubicacion: text(80, 'La ubicación es demasiado larga'),
  marcadoReorden: z.boolean(),
  pedidoAt: timestamp('La fecha del pedido no es válida').nullable(),
  notas: text(4000, 'Las notas son demasiado largas'),
});

/* --------------------------- Valores vacíos ------------------------------ */

export function emptyClientInput(): ClientInput {
  return {
    nombre: '',
    telefono: '',
    email: '',
    marca: '',
    modelo: '',
    imei: '',
    servicio: '',
    falla: '',
    estado: 'recibido',
    cobroCents: 0,
    pagadoCents: 0,
    metodoPago: 'efectivo',
    fecha: Date.now(),
    fechaEntrega: null,
    garantiaDias: 30,
    desbloqueoTipo: 'ninguno',
    desbloqueoPatron: [],
    desbloqueoCodigo: '',
    notas: '',
  };
}

export function emptyExpenseInput(): ExpenseInput {
  return {
    concepto: '',
    categoria: 'otros',
    proveedor: '',
    cantidad: 1,
    costoUnitarioCents: 0,
    clienteId: null,
    inventarioId: null,
    metodoPago: 'efectivo',
    fecha: Date.now(),
    notas: '',
  };
}

export function emptyInventoryInput(): InventoryItemInput {
  return {
    nombre: '',
    categoria: 'pantallas',
    marca: '',
    modelo: '',
    sku: '',
    proveedor: '',
    stock: 0,
    stockMinimo: 1,
    cantidadPedido: 5,
    costoUnitarioCents: 0,
    precioVentaCents: 0,
    ubicacion: '',
    marcadoReorden: false,
    pedidoAt: null,
    notas: '',
  };
}

/* ------------------------------ Validación ------------------------------- */

function issuesToFields(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.length ? String(issue.path[0]) : '_';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

export function validateClientInput(i: ClientInput): Record<string, string> {
  const r = clientInputSchema.safeParse(i);
  return r.success ? {} : issuesToFields(r.error.issues);
}

export function validateExpenseInput(i: ExpenseInput): Record<string, string> {
  const r = expenseInputSchema.safeParse(i);
  return r.success ? {} : issuesToFields(r.error.issues);
}

export function validateInventoryInput(i: InventoryItemInput): Record<string, string> {
  const r = inventoryItemInputSchema.safeParse(i);
  return r.success ? {} : issuesToFields(r.error.issues);
}

/** Valida y devuelve los datos parseados o lanza ValidationError. */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new ValidationError(issuesToFields(r.error.issues));
  return r.data;
}

/* ---------------------------- Normalización ------------------------------ */

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const int = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n) : fallback;
};
const intOrNaN = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n) : NaN;
};
const tsOrNull = (v: unknown): number | null => (v == null || v === '' ? null : intOrNaN(v));
const idOrNull = (v: unknown): string | null => {
  const t = s(v);
  return t ? t : null;
};

/**
 * Limpia una entrada de cliente: recorta textos, redondea números, limita el
 * abono a [0, total] y descarta datos de desbloqueo que no correspondan al tipo.
 */
export function normalizeClientInput(i: ClientInput): ClientInput {
  const cobro = intOrNaN(i.cobroCents);
  let pagado = intOrNaN(i.pagadoCents);
  if (Number.isFinite(cobro) && Number.isFinite(pagado)) pagado = Math.min(Math.max(0, pagado), Math.max(0, cobro));
  const tipo = (i.desbloqueoTipo ?? 'ninguno') as UnlockType;
  const patron = tipo === 'patron' && Array.isArray(i.desbloqueoPatron) ? i.desbloqueoPatron.map((n) => int(n, -1)) : [];
  const codigo = tipo === 'pin' ? s(i.desbloqueoCodigo).replace(/\s+/g, '') : tipo === 'contrasena' ? String(i.desbloqueoCodigo ?? '') : '';
  return {
    nombre: s(i.nombre).replace(/\s+/g, ' '),
    telefono: s(i.telefono),
    email: s(i.email).toLowerCase(),
    marca: s(i.marca),
    modelo: s(i.modelo),
    imei: s(i.imei).replace(/\s+/g, ''),
    servicio: s(i.servicio),
    falla: s(i.falla),
    estado: i.estado,
    cobroCents: cobro,
    pagadoCents: pagado,
    metodoPago: i.metodoPago,
    fecha: intOrNaN(i.fecha),
    fechaEntrega: tsOrNull(i.fechaEntrega),
    garantiaDias: intOrNaN(i.garantiaDias),
    desbloqueoTipo: tipo,
    desbloqueoPatron: patron,
    desbloqueoCodigo: codigo,
    notas: s(i.notas),
  };
}

export function normalizeExpenseInput(i: ExpenseInput): ExpenseInput {
  return {
    concepto: s(i.concepto).replace(/\s+/g, ' '),
    categoria: i.categoria,
    proveedor: s(i.proveedor),
    cantidad: intOrNaN(i.cantidad),
    costoUnitarioCents: intOrNaN(i.costoUnitarioCents),
    clienteId: idOrNull(i.clienteId),
    inventarioId: idOrNull(i.inventarioId),
    metodoPago: i.metodoPago,
    fecha: intOrNaN(i.fecha),
    notas: s(i.notas),
  };
}

export function normalizeInventoryInput(i: InventoryItemInput): InventoryItemInput {
  return {
    nombre: s(i.nombre).replace(/\s+/g, ' '),
    categoria: i.categoria,
    marca: s(i.marca),
    modelo: s(i.modelo),
    sku: s(i.sku),
    proveedor: s(i.proveedor),
    stock: intOrNaN(i.stock),
    stockMinimo: intOrNaN(i.stockMinimo),
    cantidadPedido: intOrNaN(i.cantidadPedido),
    costoUnitarioCents: intOrNaN(i.costoUnitarioCents),
    precioVentaCents: intOrNaN(i.precioVentaCents),
    ubicacion: s(i.ubicacion),
    marcadoReorden: Boolean(i.marcadoReorden),
    pedidoAt: tsOrNull(i.pedidoAt),
    notas: s(i.notas),
  };
}

/** Extrae sólo los campos de captura de un registro completo. */
export function pickClientInput(c: ClientInput): ClientInput {
  const e = emptyClientInput();
  const out = {} as Record<string, unknown>;
  for (const k of Object.keys(e)) out[k] = (c as unknown as Record<string, unknown>)[k] ?? (e as unknown as Record<string, unknown>)[k];
  return out as unknown as ClientInput;
}

export function pickExpenseInput(x: ExpenseInput): ExpenseInput {
  const e = emptyExpenseInput();
  const out = {} as Record<string, unknown>;
  for (const k of Object.keys(e)) out[k] = (x as unknown as Record<string, unknown>)[k] ?? (e as unknown as Record<string, unknown>)[k];
  return out as unknown as ExpenseInput;
}

export function pickInventoryInput(x: InventoryItemInput): InventoryItemInput {
  const e = emptyInventoryInput();
  const out = {} as Record<string, unknown>;
  for (const k of Object.keys(e)) out[k] = (x as unknown as Record<string, unknown>)[k] ?? (e as unknown as Record<string, unknown>)[k];
  return out as unknown as InventoryItemInput;
}

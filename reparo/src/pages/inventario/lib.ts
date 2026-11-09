/* Utilidades puras de la página de Inventario. */
import {
  BatteryCharging,
  Camera,
  Cpu,
  Headphones,
  Package,
  Smartphone,
  TabletSmartphone,
  Usb,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { BadgeTone } from '@/ui';
import {
  EXPENSE_CATEGORY_LABEL,
  ValidationError,
  formatDateTime,
  formatFolio,
  formatMoney,
  matchesQuery,
  needsReorder,
  type Client,
  type ExpenseCategory,
  type InventoryItem,
  type StockStatus,
} from '@/data';

/* ------------------------------- Categorías ------------------------------ */

export const CATEGORY_ICON: Record<ExpenseCategory, LucideIcon> = {
  pantallas: Smartphone,
  baterias: BatteryCharging,
  puertos: Usb,
  camaras: Camera,
  placas: Cpu,
  carcasas: TabletSmartphone,
  herramientas: Wrench,
  accesorios: Headphones,
  otros: Package,
};

export const CATEGORY_COLOR: Record<ExpenseCategory, string> = {
  pantallas: 'var(--chart-1)',
  baterias: 'var(--chart-3)',
  puertos: 'var(--chart-2)',
  camaras: 'var(--chart-6)',
  placas: 'var(--chart-7)',
  carcasas: 'var(--chart-4)',
  herramientas: 'var(--chart-5)',
  accesorios: 'var(--chart-2)',
  otros: 'var(--chart-8)',
};

/** Etiqueta corta para chips y tarjetas. */
export const CATEGORY_SHORT: Record<ExpenseCategory, string> = {
  ...EXPENSE_CATEGORY_LABEL,
  puertos: 'Puertos',
  placas: 'Placas',
  carcasas: 'Carcasas',
};

/* --------------------------------- Estado -------------------------------- */

export const STATUS_TONE: Record<StockStatus, BadgeTone> = {
  ok: 'success',
  bajo: 'warning',
  agotado: 'danger',
  pedido: 'info',
};

export type Filtro = 'todos' | 'pedir' | 'pedidos' | 'agotados';

export function parseFiltro(v: string | null): Filtro {
  return v === 'pedir' || v === 'pedidos' || v === 'agotados' ? v : 'todos';
}

export function matchesFiltro(i: InventoryItem, f: Filtro): boolean {
  switch (f) {
    case 'pedir':
      return needsReorder(i);
    case 'pedidos':
      return i.pedidoAt != null;
    case 'agotados':
      return i.stock <= 0;
    default:
      return true;
  }
}

/** "Apple · iPhone 13" o "" si no hay compatibilidad. */
export function compatLabel(i: Pick<InventoryItem, 'marca' | 'modelo'>): string {
  return [i.marca.trim(), i.modelo.trim()].filter(Boolean).join(' · ');
}

export function matchesItem(i: InventoryItem, q: string): boolean {
  if (!q.trim()) return true;
  return matchesQuery(`${i.nombre} ${i.marca} ${i.modelo} ${i.sku} ${i.proveedor} ${i.ubicacion}`, q);
}

/** Cantidad sugerida a pedir: cantidadPedido o (mínimo × 2 − stock), al menos 1. */
export function suggestedQty(i: InventoryItem): number {
  if (i.cantidadPedido > 0) return i.cantidadPedido;
  return Math.max(1, i.stockMinimo * 2 - Math.max(0, i.stock));
}

/** Escala del medidor de stock (el máximo visible de la barra). */
export function meterScale(i: Pick<InventoryItem, 'stock' | 'stockMinimo' | 'cantidadPedido'>): number {
  const target = Math.max(i.stockMinimo + i.cantidadPedido, i.stockMinimo * 2, 1);
  return Math.max(i.stock, target);
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function clientOptionLabel(c: Pick<Client, 'folio' | 'nombre'>): string {
  return `${formatFolio(c.folio)} · ${c.nombre.trim() || 'Sin nombre'}`;
}

/** Mensaje legible de un error de mutación. */
export function errorMessage(err: unknown): string {
  if (err instanceof ValidationError) return Object.values(err.fields)[0] ?? err.message;
  if (err instanceof Error) return err.message;
  return 'Ocurrió un error inesperado';
}

/** Valores únicos, sin vacíos, ordenados alfabéticamente (sin distinguir acentos). */
export function uniqueSorted(values: Iterable<string>): string[] {
  const map = new Map<string, string>();
  for (const v of values) {
    const t = (v ?? '').trim();
    if (!t) continue;
    const k = t.toLocaleLowerCase('es');
    if (!map.has(k)) map.set(k, t);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

/* ---------------------------- Lista de compras --------------------------- */

export const NO_SUPPLIER = 'Sin proveedor';

export interface OrderLine {
  item: InventoryItem;
  qty: number;
}

export interface OrderGroup {
  proveedor: string;
  lines: OrderLine[];
  piezas: number;
  totalCents: number;
}

export function groupBySupplier(lines: OrderLine[]): OrderGroup[] {
  const map = new Map<string, OrderGroup>();
  for (const l of lines) {
    const key = l.item.proveedor.trim() || NO_SUPPLIER;
    let g = map.get(key);
    if (!g) {
      g = { proveedor: key, lines: [], piezas: 0, totalCents: 0 };
      map.set(key, g);
    }
    g.lines.push(l);
    g.piezas += l.qty;
    g.totalCents += l.qty * l.item.costoUnitarioCents;
  }
  return [...map.values()].sort((a, b) => {
    if (a.proveedor === NO_SUPPLIER) return 1;
    if (b.proveedor === NO_SUPPLIER) return -1;
    return a.proveedor.localeCompare(b.proveedor, 'es', { sensitivity: 'base' });
  });
}

/**
 * Texto de la lista de compras con formato de WhatsApp (*negritas*, _cursivas_).
 * Con `forSupplier` se redacta como mensaje al proveedor y sin costos.
 */
export function buildOrderText(groups: OrderGroup[], o: { businessName?: string; forSupplier?: boolean; now?: number } = {}): string {
  const now = o.now ?? Date.now();
  const active = groups.map((g) => ({ ...g, lines: g.lines.filter((l) => l.qty > 0) })).filter((g) => g.lines.length > 0);
  const lineText = (l: OrderLine, withCost: boolean) => {
    const compat = l.item.sku ? ` _(${l.item.sku})_` : '';
    const cost = withCost && l.item.costoUnitarioCents > 0 ? ` — ${formatMoney(l.qty * l.item.costoUnitarioCents)}` : '';
    return `• ${l.qty} × ${l.item.nombre}${compat}${cost}`;
  };
  if (o.forSupplier) {
    const g = active[0];
    if (!g) return '';
    const out = [
      `Hola${g.proveedor !== NO_SUPPLIER ? ` *${g.proveedor}*` : ''}, quisiera hacer un pedido${o.businessName ? ` para *${o.businessName}*` : ''}:`,
      '',
      ...g.lines.map((l) => lineText(l, false)),
      '',
      `*Total: ${plural(g.piezas, 'pieza', 'piezas')}*`,
      '',
      '¿Me confirmas disponibilidad y precio? ¡Gracias!',
    ];
    return out.join('\n');
  }
  const total = active.reduce((s, g) => s + g.totalCents, 0);
  const piezas = active.reduce((s, g) => s + g.piezas, 0);
  const out: string[] = [`*Lista de compras${o.businessName ? ` · ${o.businessName}` : ''}*`, `_${formatDateTime(now)}_`, ''];
  for (const g of active) {
    out.push(`*${g.proveedor}*`);
    for (const l of g.lines) out.push(lineText(l, true));
    if (g.totalCents > 0) out.push(`_Subtotal: ${formatMoney(g.totalCents)}_`);
    out.push('');
  }
  out.push(`*Total estimado: ${formatMoney(total)}* · ${plural(piezas, 'pieza', 'piezas')}`);
  return out.join('\n');
}

/** Copia texto al portapapeles (con alternativa para contextos sin Clipboard API). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

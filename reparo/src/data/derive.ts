/* Valores derivados y utilidades de búsqueda (funciones puras). */
import type { Client, InventoryItem, PaymentStatus, StockStatus, UnlockType } from './types';

/** Estado de pago derivado. Un servicio sin monto (cobro 0) no tiene nada pendiente → 'pagado'. */
export function paymentStatus(c: Pick<Client, 'cobroCents' | 'pagadoCents'>): PaymentStatus {
  const cobro = Math.max(0, c.cobroCents || 0);
  const pagado = Math.max(0, c.pagadoCents || 0);
  if (pagado >= cobro) return 'pagado';
  if (pagado > 0) return 'parcial';
  return 'pendiente';
}

/** Saldo por cobrar (≥ 0). */
export function saldoCents(c: Pick<Client, 'cobroCents' | 'pagadoCents'>): number {
  return Math.max(0, (c.cobroCents || 0) - (c.pagadoCents || 0));
}

/** 'pedido' tiene prioridad (ya se pidió al proveedor); luego agotado, bajo u ok. */
export function stockStatus(i: InventoryItem): StockStatus {
  if (i.pedidoAt != null) return 'pedido';
  if (i.stock <= 0) return 'agotado';
  if (i.stock <= i.stockMinimo) return 'bajo';
  return 'ok';
}

/**
 * "Por pedir": stock en o bajo el mínimo, o marcado manualmente, y que aún NO
 * se ha pedido al proveedor (los pedidos ya hechos están en "Pedido").
 */
export function needsReorder(i: InventoryItem): boolean {
  if (i.deletedAt != null) return false;
  if (i.pedidoAt != null) return false;
  return i.stock <= i.stockMinimo || i.marcadoReorden;
}

/** Minúsculas, sin acentos ni espacios extra (para búsquedas). */
export function normalizeText(s: string): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Búsqueda tolerante: todas las palabras de `q` deben aparecer en `text`
 * (sin acentos ni mayúsculas). Los términos numéricos también se comparan contra
 * los dígitos del texto, así "5512" encuentra "55 1234 5678"… o "551234".
 */
export function matchesQuery(text: string, q: string): boolean {
  const nq = normalizeText(q);
  if (!nq) return true;
  const nt = normalizeText(text);
  let digits: string | null = null;
  for (const token of nq.split(' ')) {
    if (nt.includes(token)) continue;
    const tokenDigits = token.replace(/\D/g, '');
    if (tokenDigits.length >= 3 && tokenDigits.length === token.replace(/[\s()+.-]/g, '').length) {
      digits ??= nt.replace(/\D/g, '');
      if (digits.includes(tokenDigits)) continue;
    }
    return false;
  }
  return true;
}

/** "iPhone 13" (o la marca si no hay modelo). */
export function deviceLabel(c: Pick<Client, 'marca' | 'modelo'>): string {
  const modelo = (c.modelo ?? '').trim();
  const marca = (c.marca ?? '').trim();
  return modelo || marca;
}

/** "Apple iPhone 13": marca + modelo sin repetir la marca. */
export function deviceFullName(c: Pick<Client, 'marca' | 'modelo'>): string {
  const modelo = (c.modelo ?? '').trim();
  const marca = (c.marca ?? '').trim();
  if (!modelo) return marca;
  if (!marca || marca === 'Otro' || normalizeText(modelo).startsWith(normalizeText(marca))) return modelo;
  return `${marca} ${modelo}`;
}

/** Título legible de un cliente: "Ana López · iPhone 13". */
export function clientTitle(c: Pick<Client, 'nombre' | 'marca' | 'modelo'>): string {
  const nombre = (c.nombre ?? '').trim() || 'Cliente sin nombre';
  const device = deviceLabel(c);
  return device ? `${nombre} · ${device}` : nombre;
}

/** Fecha en que vence la garantía (null si no aplica o aún no se entrega). */
export function warrantyExpiresAt(c: Pick<Client, 'garantiaDias' | 'fechaEntrega'>): number | null {
  if (!c.fechaEntrega || !c.garantiaDias || c.garantiaDias <= 0) return null;
  const d = new Date(c.fechaEntrega);
  d.setDate(d.getDate() + c.garantiaDias);
  return d.getTime();
}

/** Texto enmascarado del desbloqueo, para listas y auditoría ("PIN ••••"). Nunca revela el valor. */
export function maskedUnlock(c: Pick<Client, 'desbloqueoTipo' | 'desbloqueoPatron' | 'desbloqueoCodigo'>): string {
  const tipo: UnlockType = c.desbloqueoTipo ?? 'ninguno';
  if (tipo === 'patron') return c.desbloqueoPatron?.length ? 'Patrón guardado' : 'Patrón sin capturar';
  if (tipo === 'pin') return c.desbloqueoCodigo ? 'PIN ••••' : 'PIN sin capturar';
  if (tipo === 'contrasena') return c.desbloqueoCodigo ? 'Contraseña ••••••' : 'Contraseña sin capturar';
  return 'Sin bloqueo';
}

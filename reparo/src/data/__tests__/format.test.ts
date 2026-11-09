import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatDayHeading,
  formatFolio,
  formatMoney,
  formatRelative,
  formatTime,
  parseMoneyToCents,
  centsToInput,
  MINUS,
} from '../format';
import { matchesQuery, normalizeText, paymentStatus, stockStatus, needsReorder } from '../derive';
import type { InventoryItem } from '../types';

const MX = { currency: 'MXN', locale: 'es-MX' } as const;

describe('parseMoneyToCents', () => {
  it.each([
    ['1,250.50', 125050],
    ['1.250,50', 125050],
    ['1250', 125000],
    ['$ 1 250,5', 125050],
    ['$1,250', 125000],
    ['1.250', 125000],
    ['12.5', 1250],
    ['0,99', 99],
    ['1.250.000', 125000000],
    ['-300', -30000],
    ['', 0],
  ])('"%s" → %i', (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  it('acepta números y redondea sin errores de coma flotante', () => {
    expect(parseMoneyToCents(1250.5)).toBe(125050);
    expect(parseMoneyToCents(0.1 + 0.2)).toBe(30);
    expect(parseMoneyToCents(1.005)).toBe(101);
  });

  it('devuelve NaN con texto sin dígitos', () => {
    expect(parseMoneyToCents('abc')).toBeNaN();
  });

  it('centsToInput produce texto editable', () => {
    expect(centsToInput(125050, 'MXN')).toBe('1250.50');
    expect(centsToInput(1250000, 'CLP')).toBe('12500');
  });
});

describe('formatMoney', () => {
  it('formatea pesos mexicanos', () => {
    expect(formatMoney(125000, MX)).toBe('$1,250.00');
    expect(formatMoney(0, MX)).toBe('$0.00');
  });

  it('usa el signo menos tipográfico y el modo sign', () => {
    expect(formatMoney(-30000, MX)).toBe(`${MINUS}$300.00`);
    expect(formatMoney(120000, { ...MX, sign: true })).toBe('+$1,200.00');
    expect(formatMoney(-30000, { ...MX, sign: true })).toBe(`${MINUS}$300.00`);
    expect(formatMoney(0, { ...MX, sign: true })).toBe('$0.00');
  });

  it('notación compacta', () => {
    // Intl separa con espacio de no separación (no se parte en dos líneas).
    expect(formatMoney(1_250_000, { ...MX, compact: true }).replace(/\u00a0/g, ' ')).toBe('$12.5 k');
    expect(formatMoney(95_000, { ...MX, compact: true })).toBe('$950');
  });

  it('monedas sin decimales y opción decimals', () => {
    expect(formatMoney(1_250_000, { currency: 'CLP', locale: 'es-CL' })).toBe('$12.500');
    expect(formatMoney(125050, { ...MX, decimals: false })).toBe('$1,251');
  });

  it('no falla con monedas inválidas', () => {
    expect(formatMoney(1000, { currency: 'XXZ', locale: 'es-MX' })).toContain('10.00');
  });
});

describe('fechas', () => {
  const ts = new Date(2026, 10, 7, 14, 32).getTime();

  it('formato de fecha y hora', () => {
    expect(formatDate(ts)).toBe('7 nov 2026');
    expect(formatTime(ts)).toBe('14:32');
    expect(formatDateTime(ts)).toBe('7 nov 2026 · 14:32');
    expect(formatDateTime(new Date(2026, 0, 3, 9, 5))).toBe('3 ene 2026 · 09:05');
  });

  it('relativas', () => {
    const now = ts;
    expect(formatRelative(now - 20_000, now)).toBe('justo ahora');
    expect(formatRelative(now - 5 * 60_000, now)).toBe('hace 5 min');
    expect(formatRelative(now - 2 * 3_600_000, now)).toBe('hace 2 h');
    expect(formatRelative(new Date(2026, 10, 6, 14, 32).getTime(), now)).toBe('ayer · 14:32');
    expect(formatRelative(new Date(2026, 10, 2, 9, 0).getTime(), now)).toBe('2 nov 2026 · 09:00');
  });

  it('encabezados de día', () => {
    expect(formatDayHeading(ts, ts)).toBe('Hoy · sábado 7 de noviembre');
    expect(formatDayHeading(new Date(2026, 10, 6).getTime(), ts)).toBe('Ayer · viernes 6 de noviembre');
    expect(formatDayHeading(new Date(2026, 10, 4).getTime(), ts)).toBe('Miércoles 4 de noviembre');
    expect(formatDayHeading(new Date(2025, 11, 31).getTime(), ts)).toBe('Miércoles 31 de diciembre de 2025');
  });

  it('folio', () => {
    expect(formatFolio(123)).toBe('#000123');
    expect(formatFolio(1)).toBe('#000001');
  });
});

describe('derivados', () => {
  it('estado de pago', () => {
    expect(paymentStatus({ cobroCents: 1000, pagadoCents: 0 })).toBe('pendiente');
    expect(paymentStatus({ cobroCents: 1000, pagadoCents: 500 })).toBe('parcial');
    expect(paymentStatus({ cobroCents: 1000, pagadoCents: 1000 })).toBe('pagado');
  });

  it('estado de stock y por pedir', () => {
    const base = { stock: 5, stockMinimo: 2, pedidoAt: null, marcadoReorden: false, deletedAt: null } as InventoryItem;
    expect(stockStatus(base)).toBe('ok');
    expect(stockStatus({ ...base, stock: 2 })).toBe('bajo');
    expect(stockStatus({ ...base, stock: 0 })).toBe('agotado');
    expect(stockStatus({ ...base, stock: 0, pedidoAt: 1 })).toBe('pedido');
    expect(needsReorder({ ...base, stock: 2 })).toBe(true);
    expect(needsReorder({ ...base, marcadoReorden: true })).toBe(true);
    expect(needsReorder({ ...base, stock: 0, pedidoAt: 1 })).toBe(false);
  });

  it('búsqueda sin acentos y por dígitos', () => {
    expect(normalizeText('  Óscar  Peña ')).toBe('oscar pena');
    expect(matchesQuery('María López · iPhone 13', 'maria iphone')).toBe(true);
    expect(matchesQuery('María López', 'lopez juan')).toBe(false);
    expect(matchesQuery('Tel. 55 1234 5678', '5512345')).toBe(true);
    expect(matchesQuery('Cualquier cosa', '')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  computeCategoryBreakdown,
  computeClientFinancials,
  computeCustomerDirectory,
  computeInventoryStats,
  computeSeries,
  computeServiceBreakdown,
  computeStatusCounts,
  computeSummary,
} from '../reports';
import { getPeriod } from '../periods';
import type { Client, Expense, InventoryItem, InventoryMovement } from '../types';

const d = (day: number, h = 12) => new Date(2026, 10, day, h).getTime();

let n = 0;
function client(p: Partial<Client>): Client {
  n++;
  return {
    id: `c${n}`, folio: n, nombre: `Cliente ${n}`, telefono: '', email: '', marca: 'Apple', modelo: 'iPhone 13', imei: '',
    servicio: 'Cambio de pantalla', falla: '', estado: 'entregado', cobroCents: 100_000, pagadoCents: 100_000, metodoPago: 'efectivo',
    fecha: d(3), fechaEntrega: null, garantiaDias: 30, desbloqueoTipo: 'ninguno', desbloqueoPatron: [], desbloqueoCodigo: '',
    numFotos: 0, notas: '', createdAt: d(3), updatedAt: d(3), deletedAt: null, deviceId: 'x', rev: 1, ...p,
  };
}
function expense(p: Partial<Expense>): Expense {
  n++;
  return {
    id: `e${n}`, concepto: 'Pantalla', categoria: 'pantallas', proveedor: '', cantidad: 1, costoUnitarioCents: 30_000, totalCents: 30_000,
    clienteId: null, inventarioId: null, metodoPago: 'efectivo', fecha: d(3), notas: '', createdAt: d(3), updatedAt: d(3), deletedAt: null,
    deviceId: 'x', rev: 1, ...p,
  };
}

const week = getPeriod('week', d(7), 1); // 2–8 nov

describe('computeSummary', () => {
  const clients = [
    client({ fecha: d(3), cobroCents: 200_000, pagadoCents: 200_000, fechaEntrega: d(4) }),
    client({ fecha: d(5), cobroCents: 100_000, pagadoCents: 40_000, estado: 'listo' }),
    client({ fecha: d(6), cobroCents: 50_000, pagadoCents: 50_000, estado: 'cancelado' }),
    client({ fecha: d(6), cobroCents: 70_000, pagadoCents: 70_000, deletedAt: d(6) }),
    client({ fecha: d(10), cobroCents: 90_000, pagadoCents: 90_000 }),
    client({ fecha: d(1), cobroCents: 60_000, pagadoCents: 60_000, fechaEntrega: d(2, 18) }),
  ];
  const expenses = [
    expense({ fecha: d(3), totalCents: 80_000, categoria: 'pantallas' }),
    expense({ fecha: d(4), totalCents: 20_000, categoria: 'baterias' }),
    expense({ fecha: d(4), totalCents: 99_000, deletedAt: d(4) }),
    expense({ fecha: d(9), totalCents: 50_000 }),
  ];

  it('aplica las reglas de negocio', () => {
    const s = computeSummary(week, clients, expenses);
    expect(s.cobradoCents).toBe(240_000);
    expect(s.facturadoCents).toBe(300_000);
    expect(s.porCobrarCents).toBe(60_000);
    expect(s.gastadoCents).toBe(100_000);
    expect(s.gananciaCents).toBe(140_000);
    expect(s.margen).toBeCloseTo(140_000 / 240_000);
    expect(s.servicios).toBe(2);
    expect(s.entregados).toBe(2);
    expect(s.ticketPromedioCents).toBe(150_000);
    expect(s.numGastos).toBe(2);
  });

  it('margen nulo sin cobros', () => {
    expect(computeSummary(week, [], []).margen).toBeNull();
  });

  it('series por día suman lo mismo que el resumen', () => {
    const series = computeSeries(week, 'day', clients, expenses, 1);
    expect(series).toHaveLength(7);
    expect(series.reduce((a, p) => a + p.cobradoCents, 0)).toBe(240_000);
    expect(series.reduce((a, p) => a + p.gastadoCents, 0)).toBe(100_000);
    const martes = series[1];
    expect(martes.label).toBe('mar 3');
    expect(martes.cobradoCents).toBe(200_000);
    expect(martes.gananciaCents).toBe(120_000);
    expect(martes.servicios).toBe(1);
  });

  it('desgloses', () => {
    const cats = computeCategoryBreakdown(week, expenses);
    expect(cats.map((c) => [c.categoria, c.totalCents])).toEqual([
      ['pantallas', 80_000],
      ['baterias', 20_000],
    ]);
    expect(cats[0].label).toBe('Pantallas');
    const servs = computeServiceBreakdown(week, clients);
    expect(servs).toEqual([{ servicio: 'Cambio de pantalla', cobradoCents: 240_000, count: 2 }]);
    const counts = computeStatusCounts(clients);
    expect(counts.entregado).toBe(3);
    expect(counts.listo).toBe(1);
    expect(counts.cancelado).toBe(1);
  });
});

describe('finanzas, directorio e inventario', () => {
  it('ganancia del servicio = pagado − gastos − piezas', () => {
    const c = client({ id: 'cx', cobroCents: 300_000, pagadoCents: 250_000 });
    const exps = [expense({ clienteId: 'cx', totalCents: 90_000 }), expense({ clienteId: 'cx', totalCents: 10_000, deletedAt: 1 })];
    const mvs = [
      { type: 'uso', cantidad: -2, costoUnitarioCents: 15_000, clienteId: 'cx' },
      { type: 'entrada', cantidad: 5, costoUnitarioCents: 15_000, clienteId: null },
    ] as InventoryMovement[];
    expect(computeClientFinancials(c, exps, mvs, 'cx')).toEqual({
      cobroCents: 300_000,
      pagadoCents: 250_000,
      saldoCents: 50_000,
      gastosCents: 90_000,
      piezasCents: 30_000,
      gananciaCents: 130_000,
    });
  });

  it('directorio agrupa por teléfono', () => {
    const dir = computeCustomerDirectory([
      client({ nombre: 'Ana López', telefono: '55 1234 5678', fecha: d(1) }),
      client({ nombre: 'Ana López Ruiz', telefono: '+52 55 1234 5678', fecha: d(5) }),
      client({ nombre: 'Luis Pérez', telefono: '', fecha: d(3) }),
    ]);
    expect(dir).toHaveLength(2);
    expect(dir[0]).toMatchObject({ nombre: 'Ana López Ruiz', visitas: 2, ultimaVisita: d(5) });
  });

  it('estadísticas de inventario', () => {
    const base = { deletedAt: null, pedidoAt: null, marcadoReorden: false, costoUnitarioCents: 10_000, stockMinimo: 2 };
    const s = computeInventoryStats([
      { ...base, stock: 5 },
      { ...base, stock: 1 },
      { ...base, stock: 0, pedidoAt: 1 },
      { ...base, stock: 9, deletedAt: 1 },
    ] as InventoryItem[]);
    expect(s).toEqual({ articulos: 3, unidades: 6, valorCents: 60_000, porPedir: 1, agotados: 1, pedidos: 1 });
  });
});

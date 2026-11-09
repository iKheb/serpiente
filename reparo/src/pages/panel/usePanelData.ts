/* Datos derivados del panel: periodos, resúmenes "a la fecha" y listas cortas. */
import { useMemo } from 'react';
import {
  calendarDayDiff,
  getPeriod,
  needsReorder,
  saldoCents,
  shiftPeriod,
  useClients,
  useExpenses,
  useInventory,
  useInventoryStats,
  useSeries,

  useStatusCounts,
  useSummary,
  type Client,
  type DateRange,
  type Period,
  type PeriodKind,
  type SeriesPoint,
  type Summary,
} from '@/data';

export interface PeriodData {
  period: Period;
  previous: Period;
  /** Mismo tramo transcurrido del periodo anterior (comparación justa). */
  previousToDate: DateRange;
  summary: Summary | undefined;
  previousSummary: Summary | undefined;
  series: SeriesPoint[] | undefined;
  /** Índice del día de hoy dentro de la serie (−1 si no aplica). */
  todayIndex: number;
  /** Periodo anterior completo (cómo cerró): referencia cuando el actual aún no tiene movimientos. */
  previousFullSummary: Summary | undefined;
  previousSeries: SeriesPoint[] | undefined;
  /** El periodo en curso todavía no registra cobros, gastos ni servicios. */
  quiet: boolean;
}

const MINUTE = 60_000;

/** Resumen del periodo actual + mismo corte del periodo anterior + serie diaria. */
export function usePeriodData(kind: PeriodKind, now: number, weekStartsOn: 0 | 1): PeriodData {
  const minute = Math.floor(now / MINUTE) * MINUTE;
  const { period, previous, previousToDate } = useMemo(() => {
    const p = getPeriod(kind, minute, weekStartsOn);
    const prev = shiftPeriod(p, -1, weekStartsOn);
    const elapsed = Math.max(MINUTE, minute + MINUTE - p.start);
    return { period: p, previous: prev, previousToDate: { start: prev.start, end: Math.min(prev.end, prev.start + elapsed) } };
  }, [kind, minute, weekStartsOn]);

  const summary = useSummary(period);
  const previousSummary = useSummary(previousToDate);
  const series = useSeries(period, 'day');
  const todayIndex = series ? series.findIndex((p) => now >= p.start && now < p.end) : -1;
  const previousFullSummary = useSummary(previous);
  const previousSeries = useSeries(previous, 'day');
  const quiet = !!summary && isQuiet(summary);
  return { period, previous, previousToDate, summary, previousSummary, series, todayIndex, previousFullSummary, previousSeries, quiet };
}

/** Sin servicios nuevos, cobros ni gastos (una entrega de un servicio anterior no cuenta: su cobro pertenece a la fecha del servicio). */
export function isQuiet(x: Summary): boolean {
  return x.cobradoCents === 0 && x.gastadoCents === 0 && x.servicios === 0 && x.numGastos === 0 && x.facturadoCents === 0;
}

export interface WorkshopData {
  clients: Client[] | undefined;
  ready: Client[];
  receivable: Client[];
  receivableTotal: number;
  statusCounts: ReturnType<typeof useStatusCounts>;
  inventoryStats: ReturnType<typeof useInventoryStats>;
  reorderItems: NonNullable<ReturnType<typeof useInventory>>;
  isLoading: boolean;
  isEmpty: boolean;
  hasInventory: boolean;
}

export function useWorkshopData(now: number): WorkshopData {
  const clients = useClients();
  const expenses = useExpenses();
  const inventory = useInventory();
  const statusCounts = useStatusCounts();
  const inventoryStats = useInventoryStats();
  const day = Math.floor(now / 3_600_000);

  return useMemo(() => {
    const list = clients ?? [];
    const ready = list
      .filter((c) => c.estado === 'listo')
      .sort((a, b) => a.updatedAt - b.updatedAt);
    const receivable = list
      .filter((c) => c.estado !== 'cancelado' && saldoCents(c) > 0)
      .sort((a, b) => saldoCents(b) - saldoCents(a));
    const receivableTotal = receivable.reduce((acc, c) => acc + saldoCents(c), 0);
    const reorderItems = (inventory ?? []).filter(needsReorder).sort((a, b) => a.stock - b.stock);
    const isLoading = clients === undefined || expenses === undefined || inventory === undefined;
    return {
      clients,
      ready,
      receivable,
      receivableTotal,
      statusCounts,
      inventoryStats,
      reorderItems,
      isLoading,
      isEmpty: !isLoading && list.length === 0 && (expenses ?? []).length === 0,
      hasInventory: (inventory ?? []).length > 0,
    };
    // `day` fuerza el recálculo de "días esperando" con el paso del tiempo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, expenses, inventory, statusCounts, inventoryStats, day]);
}

/** Días que lleva un equipo listo (desde su última actualización). */
export function daysWaiting(c: Client, now: number): number {
  return Math.max(0, calendarDayDiff(now, c.updatedAt));
}

/** Variación como razón; null si no hay base para comparar. */
export function ratio(current: number, previous: number | undefined): number | null | undefined {
  if (previous === undefined) return undefined;
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / Math.abs(previous);
}

/** Serie acumulada (para la pantalla del teléfono 3D). */
export function cumulative(values: readonly number[]): number[] {
  let acc = 0;
  return values.map((v) => (acc += v));
}


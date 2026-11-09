import { useMemo } from 'react';
import { CalendarDays, CalendarRange, Gauge, ShoppingCart, Store, PieChart } from 'lucide-react';
import { DonutChart, HBarList, Sparkline } from '@/charts';
import { formatMoney, getPeriod, shiftPeriod, startOfDay, useCategoryBreakdown, type DateRange, type Expense } from '@/data';
import { Card, KpiCard, Skeleton, useMediaQuery } from '@/ui';
import { CATEGORY_COLOR, CategoryIcon } from './categories';
import styles from './gastos.module.css';

const DAY = 86_400_000;

function sumRange(list: readonly Expense[], start: number, end: number) {
  let total = 0;
  let count = 0;
  for (const e of list) {
    if (e.fecha >= start && e.fecha < end) {
      total += e.totalCents;
      count++;
    }
  }
  return { total, count };
}

function dailySeries(list: readonly Expense[], start: number, days: number): number[] {
  const out = new Array(days).fill(0);
  for (const e of list) {
    const i = Math.floor((startOfDay(e.fecha) - start) / DAY + 0.01);
    if (i >= 0 && i < days) out[i] += e.totalCents;
  }
  return out;
}

const money = (n: number) => formatMoney(n);
const moneyCompact = (n: number) => formatMoney(n, { compact: true });

export interface ExpenseSummaryProps {
  expenses: readonly Expense[] | undefined;
  now: number;
  weekStartsOn: 0 | 1;
  /** Rango del filtro de período (para desglose y proveedores). */
  range: DateRange;
  rangeLabel: string;
  onCategoryClick?: (categoria: string) => void;
  onProviderClick?: (proveedor: string) => void;
}

export function ExpenseSummary({ expenses, now, weekStartsOn, range, rangeLabel, onCategoryClick, onProviderClick }: ExpenseSummaryProps) {
  const loading = !expenses;
  const narrow = useMediaQuery('(max-width: 599px)');
  const breakdown = useCategoryBreakdown(range);

  const k = useMemo(() => {
    const list = expenses ?? [];
    const week = getPeriod('week', now, weekStartsOn);
    const prevWeek = shiftPeriod(week, -1, weekStartsOn);
    const month = getPeriod('month', now);
    const prevMonth = shiftPeriod(month, -1);
    const weekElapsed = now - week.start;
    const monthElapsed = now - month.start;
    const w = sumRange(list, week.start, now + 1);
    const pw = sumRange(list, prevWeek.start, Math.min(prevWeek.end, prevWeek.start + weekElapsed + 1));
    const m = sumRange(list, month.start, now + 1);
    const pm = sumRange(list, prevMonth.start, Math.min(prevMonth.end, prevMonth.start + monthElapsed + 1));
    const daysElapsed = Math.max(1, Math.round((startOfDay(now) - month.start) / DAY) + 1);
    const daysInMonth = Math.round((month.end - month.start) / DAY);
    const avg = Math.round(m.total / daysElapsed);
    const prevMonthName = prevMonth.label.split(' ')[0].toLowerCase();
    return {
      week: w,
      prevWeek: pw,
      month: m,
      prevMonth: pm,
      avg,
      projection: avg * daysInMonth,
      daysElapsed,
      prevMonthName,
      weekSpark: dailySeries(list, week.start, 7),
      monthSpark: dailySeries(list, month.start, daysElapsed),
    };
  }, [expenses, now, weekStartsOn]);

  const providers = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const e of expenses ?? []) {
      if (e.fecha < range.start || e.fecha >= range.end) continue;
      const key = e.proveedor.trim() || 'Sin proveedor';
      const cur = map.get(key) ?? { total: 0, count: 0 };
      cur.total += e.totalCents;
      cur.count++;
      map.set(key, cur);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([label, v]) => ({ key: label, label, value: v.total, sublabel: `${v.count} ${v.count === 1 ? 'compra' : 'compras'}` }));
  }, [expenses, range.start, range.end]);

  const donutData = useMemo(
    () =>
      (breakdown ?? [])
        .filter((r) => r.totalCents > 0)
        .map((r) => ({ key: r.categoria, label: r.label, value: r.totalCents, color: CATEGORY_COLOR[r.categoria] })),
    [breakdown],
  );
  const topCats = useMemo(() => [...(breakdown ?? [])].filter((r) => r.totalCents > 0).sort((a, b) => b.totalCents - a.totalCents), [breakdown]);

  return (
    <div className={styles.summary}>
      <div className={styles.kpis}>
        <KpiCard
          label={narrow ? 'Semana' : 'Gastado esta semana'}
          tone="expense"
          icon={<CalendarDays />}
          value={k.week.total}
          previous={k.prevWeek.total}
          invertDelta
          format={money}
          deltaLabel="vs. semana pasada a la fecha"
          loading={loading}
          sparkline={<Sparkline data={k.weekSpark} tone="expense" height={36} ariaLabel="Gasto diario de la semana" />}
        />
        <KpiCard
          label={narrow ? 'Mes' : 'Gastado este mes'}
          tone="expense"
          icon={<CalendarRange />}
          value={k.month.total}
          previous={k.prevMonth.total}
          invertDelta
          format={money}
          deltaLabel={`vs. ${k.prevMonthName} a la fecha`}
          loading={loading}
          sparkline={k.monthSpark.length > 1 ? <Sparkline data={k.monthSpark} tone="expense" height={36} ariaLabel="Gasto diario del mes" /> : undefined}
        />
        <KpiCard
          label={narrow ? 'Por día' : 'Promedio diario del mes'}
          tone="pending"
          icon={<Gauge />}
          value={k.avg}
          format={money}
          loading={loading}
          footer={
            <span className={styles.kpiFoot}>
              Proyección al cierre <strong>{moneyCompact(k.projection)}</strong>
            </span>
          }
        />
        <KpiCard
          label={narrow ? 'Compras' : 'Compras este mes'}
          tone="brand"
          icon={<ShoppingCart />}
          value={k.month.count}
          previous={k.prevMonth.count}
          invertDelta
          format={(n) => String(Math.round(n))}
          loading={loading}
          footer={
            <span className={styles.kpiFoot}>
              Promedio por compra <strong>{money(k.month.count ? Math.round(k.month.total / k.month.count) : 0)}</strong>
            </span>
          }
        />
      </div>

      <div className={styles.analytics}>
        <Card title="Por categoría" icon={<PieChart />} description={rangeLabel} className={styles.chartCard}>
          {!breakdown ? (
            <div className={styles.chartSkeleton}>
              <Skeleton circle height={160} />
              <Skeleton lines={4} height={10} />
            </div>
          ) : (
            <div className={styles.catLayout}>
              <DonutChart data={donutData} size={168} formatValue={money} centerLabel="Gastado" legend="none" maxSegments={9} ariaLabel="Gasto por categoría" emptyMessage="Sin gastos en este período" />
              {topCats.length > 0 && (
                <ul className={styles.catLegend}>
                  {topCats.slice(0, 6).map((r) => (
                    <li key={r.categoria}>
                      <button type="button" className={styles.catLegendRow} onClick={() => onCategoryClick?.(r.categoria)} title={`Filtrar por ${r.label}`}>
                        <CategoryIcon categoria={r.categoria} size="sm" />
                        <span className={styles.catLegendLabel}>{r.label}</span>
                        <span className={styles.catLegendCount}>{r.count}</span>
                        <span className={styles.catLegendValue}>{money(r.totalCents)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
        <Card title="Principales proveedores" icon={<Store />} description={rangeLabel} className={styles.chartCard}>
          {loading ? (
            <Skeleton lines={5} height={22} />
          ) : (
            <HBarList
              items={providers}
              max={5}
              formatValue={money}
              color="var(--expense)"
              variant="stacked"
              otherLabel="Otros proveedores"
              emptyMessage="Sin compras en este período"
              ariaLabel="Gasto por proveedor"
              onItemClick={(it) => it.key !== 'Sin proveedor' && onProviderClick?.(it.label)}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

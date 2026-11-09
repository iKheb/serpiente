/* Galería de gráficos (#/ui-charts): todos los componentes con datos realistas
   de un taller, dentro de tarjetas que imitan el panel real. */
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Moon, Shuffle, Sun } from 'lucide-react';
import { AreaChart, BarChart, DonutChart, HBarList, ProgressRing, Sparkline, type ChartSeries } from './index';
import {
  count,
  daily30,
  gastoPorCategoria,
  gastoPorProveedor,
  longDay,
  longMonth,
  money,
  moneyCompact,
  monthly12,
  serviciosTop,
  weekRange,
  weekly12,
  type DemoPoint,
} from './galleryData';
import g from './ChartsGallery.module.css';

type Range = '30d' | '12w' | '12m';

const FLOW: ChartSeries[] = [
  { key: 'cobradoCents', label: 'Cobrado', color: 'var(--income)' },
  { key: 'gastadoCents', label: 'Gastado', color: 'var(--expense)' },
  { key: 'gananciaCents', label: 'Ganancia', color: 'var(--profit)', area: false },
];

const BARS: ChartSeries[] = [
  { key: 'cobradoCents', label: 'Cobrado', color: 'var(--income)' },
  { key: 'gastadoCents', label: 'Gastado', color: 'var(--expense)' },
];
const PROFIT_LINE: ChartSeries[] = [{ key: 'gananciaCents', label: 'Ganancia', color: 'var(--profit)' }];

const METHODS: ChartSeries[] = [
  { key: 'efectivoCents', label: 'Efectivo', color: 'var(--chart-1)' },
  { key: 'transferenciaCents', label: 'Transferencia', color: 'var(--chart-2)' },
  { key: 'tarjetaCents', label: 'Tarjeta', color: 'var(--chart-4)' },
];

const PROFIT: ChartSeries[] = [
  { key: 'gananciaCents', label: 'Ganancia', color: 'var(--profit)', negativeColor: 'var(--expense)' },
];
const PROFIT_VS: ChartSeries[] = [
  { key: 'gananciaCents', label: 'Este mes', color: 'var(--profit)' },
  { key: 'anteriorCents', label: 'Mes anterior', color: 'var(--text-3)', area: false, dashed: true },
];

const RANGE_LABEL: Record<Range, string> = { '30d': '30 días', '12w': '12 semanas', '12m': '12 meses' };
const GOAL: Record<Range, number> = { '30d': 450_000, '12w': 2_400_000, '12m': 9_000_000 };

function tooltipTitle(range: Range) {
  return (_l: string, d: DemoPoint) => (range === '30d' ? longDay(d.start) : range === '12w' ? weekRange(d.start, d.end) : longMonth(d.start));
}

const sum = (rows: readonly DemoPoint[], k: keyof DemoPoint) => rows.reduce((a, r) => a + (r[k] as number), 0);

export default function ChartsGallery() {
  const [seed, setSeed] = useState(0);
  const [range, setRange] = useState<Range>('30d');
  const [active, setActive] = useState<number | null>(null);
  const [theme, setTheme] = useState(() => (typeof document !== 'undefined' ? document.documentElement.dataset.theme ?? 'dark' : 'dark'));

  const d30 = useMemo(() => daily30(7 + seed), [seed]);
  const w12 = useMemo(() => weekly12(11 + seed), [seed]);
  const m12 = useMemo(() => monthly12(23 + seed), [seed]);
  const flow = range === '30d' ? d30 : range === '12w' ? w12 : m12;

  const totals = {
    cobrado: sum(flow, 'cobradoCents'),
    gastado: sum(flow, 'gastadoCents'),
    ganancia: sum(flow, 'gananciaCents'),
  };
  const point = active != null ? flow[active] : null;

  const donut = useMemo(
    () => gastoPorCategoria.map((c, i) => ({ ...c, value: Math.round(c.value * (seed ? 0.7 + ((seed * 37 + i * 13) % 60) / 100 : 1)) })),
    [seed],
  );

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    setTheme(next);
  };

  const monthGoal = 5_000_000;
  const monthProfit = 3_846_000 + seed * 210_000;

  return (
    <div className={g.page}>
      <div className={g.inner}>
        <header className={g.header}>
          <div>
            <p className={g.eyebrow}>Sistema de diseño · Gráficos</p>
            <h1 className={g.title}>Galería de gráficos</h1>
            <p className={g.lead}>
              Componentes SVG propios para el panel y los reportes de Reparo: responsivos, accesibles con teclado y lector de pantalla, y
              animados con respeto a “reducir movimiento”.
            </p>
          </div>
          <div className={g.actions}>
            <button type="button" className={g.btn} onClick={() => setSeed((x) => x + 1)}>
              <Shuffle size={15} /> Simular datos
            </button>
            <button type="button" className={g.btn} onClick={toggleTheme} aria-label="Cambiar tema">
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
              {theme === 'light' ? 'Oscuro' : 'Claro'}
            </button>
          </div>
        </header>

        <div className={g.grid}>
          {/* ---------------------------- KPIs ---------------------------- */}
          <Kpi
            label="Cobrado"
            value={money(sum(d30, 'cobradoCents'))}
            delta={0.124}
            data={d30.map((d) => d.cobradoCents)}
            tone="income"
          />
          <Kpi label="Gastado" value={money(sum(d30, 'gastadoCents'))} delta={0.061} upIsGood={false} data={d30.map((d) => d.gastadoCents)} tone="expense" />
          <Kpi label="Ganancia" value={money(sum(d30, 'gananciaCents'))} delta={0.168} data={d30.map((d) => d.gananciaCents)} tone="profit" />
          <Kpi label="Por cobrar" value={money(1_284_000)} delta={-0.082} upIsGood={false} data={d30.map((d) => Math.round(d.cobradoCents * 0.18))} tone="pending" variant="line" />

          {/* ---------------------------- Héroe ---------------------------- */}
          <section className={`${g.card} ${g.span12}`}>
            <div className={g.cardHead}>
              <div>
                <h2 className={g.cardTitle}>Flujo de caja</h2>
                <p className={g.cardSub}>Cobrado, gastado y ganancia · {RANGE_LABEL[range]}</p>
              </div>
              <div className={g.segmented} role="group" aria-label="Periodo">
                {(['30d', '12w', '12m'] as Range[]).map((r) => (
                  <button key={r} type="button" className={g.segBtn} aria-pressed={range === r} onClick={() => setRange(r)}>
                    {RANGE_LABEL[r]}
                  </button>
                ))}
              </div>
            </div>
            <div className={g.heroStats}>
              <Stat label="Cobrado" color="var(--income)" value={money(point ? point.cobradoCents : totals.cobrado)} context={point ? tooltipTitle(range)('', point) : `Total · ${RANGE_LABEL[range]}`} />
              <Stat label="Gastado" color="var(--expense)" value={money(point ? point.gastadoCents : totals.gastado)} />
              <Stat label="Ganancia" color="var(--profit)" value={money(point ? point.gananciaCents : totals.ganancia)} />
            </div>
            <AreaChart
              data={flow}
              series={FLOW}
              height={300}
              formatValue={money}
              formatAxisValue={moneyCompact}
              formatTooltipLabel={tooltipTitle(range)}
              referenceLines={[{ value: GOAL[range], label: 'Meta', color: 'var(--pending)' }]}
              tooltipFooter={(d) => (
                <div className={g.footRow}>
                  <span>Margen</span>
                  <span className={g.footValue}>{d.cobradoCents ? `${Math.round((d.gananciaCents / d.cobradoCents) * 100)}%` : '—'}</span>
                </div>
              )}
              onActiveChange={setActive}
              ariaLabel={`Flujo de caja de los últimos ${RANGE_LABEL[range]}`}
              legend="none"
            />
          </section>

          {/* ------------------------- Barras + dona ------------------------- */}
          <Card className={g.span7} title="Ingresos vs gastos por semana" subtitle="Últimas 12 semanas · ganancia superpuesta">
            <BarChart
              data={w12}
              series={BARS}
              lineSeries={PROFIT_LINE}
              height={280}
              formatValue={money}
              formatAxisValue={moneyCompact}
              formatTooltipLabel={(_l, d) => weekRange(d.start, d.end)}
              ariaLabel="Ingresos y gastos por semana"
            />
          </Card>
          <Card className={g.span5} title="Gasto por categoría" subtitle="Repuestos y herramientas · noviembre">
            <DonutChart data={donut} formatValue={money} ariaLabel="Gasto por categoría de repuesto" />
          </Card>

          {/* ------------------------- Meta + rankings ------------------------- */}
          <Card className={g.span4} title="Meta mensual" subtitle="Ganancia de noviembre">
            <div className={g.goal}>
              <ProgressRing value={monthProfit} goal={monthGoal} size={152} caption={`de ${moneyCompact(monthGoal)}`} ariaLabel="Progreso de la meta mensual de ganancia" />
              <div className={g.goalFacts}>
                <div className={g.fact}>
                  <span className={g.factLabel}>Llevas</span>
                  <span className={g.factValue}>{money(monthProfit)}</span>
                </div>
                <div className={g.fact}>
                  <span className={g.factLabel}>Te faltan</span>
                  <span className={g.factValue}>{money(Math.max(0, monthGoal - monthProfit))}</span>
                </div>
                <div className={g.fact}>
                  <span className={g.factLabel}>Ritmo necesario</span>
                  <span className={g.factValue}>{money(Math.max(0, monthGoal - monthProfit) / 23)}/día</span>
                </div>
              </div>
            </div>
          </Card>
          <Card className={g.span4} title="Servicios más vendidos" subtitle="Por ingresos · últimos 30 días">
            <HBarList
              items={serviciosTop.map((x) => ({ ...x, sublabel: `${x.sublabel} serv.` }))}
              formatValue={moneyCompact}
              header={['Servicio', 'Ingresos']}
              ariaLabel="Servicios más vendidos por ingresos"
            />
          </Card>
          <Card className={g.span4} title="Gasto por proveedor" subtitle="Últimos 30 días">
            <HBarList items={gastoPorProveedor} formatValue={money} variant="stacked" color="var(--expense)" ariaLabel="Gasto por proveedor" />
          </Card>

          {/* ------------------------- Apiladas + negativos ------------------------- */}
          <Card className={g.span6} title="Cobrado por método de pago" subtitle="Últimos 12 meses">
            <BarChart
              data={m12}
              series={METHODS}
              mode="stacked"
              height={260}
              formatValue={money}
              formatAxisValue={moneyCompact}
              formatTooltipLabel={(_l, d) => longMonth(d.start)}
              ariaLabel="Cobrado por método de pago, por mes"
            />
          </Card>
          <Card className={g.span6} title="Ganancia diaria" subtitle="Días con más compra de repuestos que cobro quedan en negativo">
            <BarChart
              data={d30}
              series={PROFIT}
              height={260}
              formatValue={money}
              formatAxisValue={moneyCompact}
              formatTooltipLabel={(_l, d) => longDay(d.start)}
              ariaLabel="Ganancia diaria de los últimos 30 días"
            />
          </Card>

          <Card className={g.span8} title="Ganancia neta vs mes anterior" subtitle="Valores negativos bajo la línea base">
            <AreaChart
              data={d30}
              series={PROFIT_VS}
              height={240}
              formatValue={money}
              formatAxisValue={moneyCompact}
              formatTooltipLabel={(_l, d) => longDay(d.start)}
              ariaLabel="Ganancia neta diaria comparada con el mes anterior"
            />
          </Card>
          <Card className={g.span4} title="Tendencias" subtitle="Sparklines por tono">
            <div className={g.sparkGrid}>
              {(
                [
                  ['Servicios', 'brand', d30.map((d) => d.servicios)],
                  ['Ticket promedio', 'info', d30.map((d) => (d.servicios ? d.cobradoCents / d.servicios : 0))],
                  ['Cobrado', 'income', d30.map((d) => d.cobradoCents)],
                  ['Gastado', 'expense', d30.map((d) => d.gastadoCents)],
                ] as const
              ).map(([label, tone, data]) => (
                <div key={label} className={g.sparkItem}>
                  <span>{label}</span>
                  <Sparkline data={data} tone={tone} height={44} interactive labels={d30.map((d) => d.label)} formatValue={label === 'Servicios' ? count : money} />
                </div>
              ))}
            </div>
          </Card>

          {/* ------------------------- Estados vacíos ------------------------- */}
          <h2 className={g.section}>Estados vacíos</h2>
          <Card className={g.span6} title="Flujo de caja" subtitle="Semana sin movimientos">
            <AreaChart data={EMPTY_WEEK} series={FLOW} height={200} formatValue={money} formatAxisValue={moneyCompact} emptyMessage="Aún no hay cobros ni gastos esta semana" />
          </Card>
          <Card className={g.span3} title="Gasto por categoría">
            <DonutChart data={[]} size={168} formatValue={money} emptyMessage="Sin gastos registrados" />
          </Card>
          <Card className={g.span3} title="Metas">
            <div className={g.rings}>
              <ProgressRing value={0} goal={monthGoal} size={110} thickness={10} caption="Sin avance" />
              <ProgressRing value={5_600_000} goal={monthGoal} size={110} thickness={10} tone="income" caption="¡Superada!" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

const EMPTY_WEEK = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((label) => ({ label, cobradoCents: 0, gastadoCents: 0, gananciaCents: 0 }));

/* ------------------------------ Piezas locales ------------------------------ */

function Card({ title, subtitle, className, children }: { title: string; subtitle?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`${g.card} ${className ?? ''}`}>
      <div className={g.cardHead}>
        <div>
          <h2 className={g.cardTitle}>{title}</h2>
          {subtitle && <p className={g.cardSub}>{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, color, value, context }: { label: string; color: string; value: string; context?: string }) {
  return (
    <div className={g.stat}>
      <span className={g.statLabel}>
        <i className={g.statDot} style={{ background: color }} />
        {label}
      </span>
      <span className={g.statValue}>{value}</span>
      {context !== undefined && <span className={g.statContext}>{context}</span>}
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
  data,
  tone,
  upIsGood = true,
  variant = 'area',
}: {
  label: string;
  value: string;
  delta: number;
  data: number[];
  tone: 'income' | 'expense' | 'profit' | 'pending';
  upIsGood?: boolean;
  variant?: 'area' | 'line';
}) {
  const good = delta >= 0 === upIsGood;
  return (
    <section className={`${g.kpi} ${g.span3}`}>
      <span className={g.kpiLabel}>{label}</span>
      <div className={g.kpiRow}>
        <span className={g.kpiValue}>{value}</span>
        <span className={`${g.delta} ${good ? g.up : g.down}`}>
          {delta >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {Math.abs(delta * 100).toFixed(1)}%
        </span>
      </div>
      <span className={g.kpiHint}>vs. 30 días anteriores</span>
      <div className={g.kpiSpark}>
        <Sparkline data={data} tone={tone} height={48} variant={variant} ariaLabel={`Tendencia de ${label.toLowerCase()} en 30 días`} />
      </div>
    </section>
  );
}

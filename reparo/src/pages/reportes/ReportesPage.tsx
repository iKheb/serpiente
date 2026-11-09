import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Crown,
  Download,
  Equal,
  Minus,
  PieChart,
  Plus,
  Printer,
  Receipt,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { navigate, setQuery, useRoute } from '@/app/router';
import {
  downloadBlob,
  formatDateTime,
  formatNumber,
  formatPercent,
  getPeriod,
  percentChange,
  shiftPeriod,
  useCategoryBreakdown,
  useFormatters,
  usePeriodHistory,
  useSeries,
  useServiceBreakdown,
  useSettings,
  useSummary,
  type Period,
  type PeriodKind,
  type SeriesPoint,
  type Summary,
  formatDayMonth,
} from '@/data';
import {
  AnimatedNumber,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  IconButton,
  PageHeader,
  SegmentedControl,
  Skeleton,
  cx,
  formatDelta,
  toast,
  useIsMobile,
  usePrefersReducedMotion,
  type Column,
} from '@/ui';
import { AreaChart, BarChart, DonutChart, HBarList, type ChartSeries, type DonutDatum } from '@/charts';
import { buildPeriodCsv, csvFilename, enterPrintMode, longDayLabel, rangeLabel, trendLabel } from './reportUtils';
import styles from './Reportes.module.css';

const HISTORY = 12;
const TABLE_ROWS: Record<PeriodKind, number> = { week: 8, month: 12 };
const KIND_OPTIONS = [
  { value: 'week', label: 'Semanal' },
  { value: 'month', label: 'Mensual' },
] as const;

const BAR_SERIES: ChartSeries[] = [
  { key: 'cobradoCents', label: 'Cobrado', color: 'var(--income)' },
  { key: 'gastadoCents', label: 'Gastado', color: 'var(--expense)' },
];
const LINE_SERIES: ChartSeries[] = [{ key: 'gananciaCents', label: 'Ganancia', color: 'var(--profit)', negativeColor: 'var(--expense)' }];
const TREND_SERIES: ChartSeries[] = [
  { key: 'cobradoCents', label: 'Cobrado', color: 'var(--income)' },
  { key: 'gastadoCents', label: 'Gastado', color: 'var(--expense)' },
  { key: 'gananciaCents', label: 'Ganancia', color: 'var(--profit)', area: false },
];

interface HistoryRow {
  id: string;
  period: Period;
  summary: Summary;
}

interface TrendPoint {
  label: string;
  period: Period;
  cobradoCents: number;
  gastadoCents: number;
  gananciaCents: number;
  margen: number | null;
}

const isEmptySummary = (s: Summary) => s.servicios === 0 && s.numGastos === 0 && s.cobradoCents === 0 && s.gastadoCents === 0;

export default function ReportesPage() {
  const route = useRoute();
  const settings = useSettings();
  const fmt = useFormatters();
  const mobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  const now = useMinuteNow();
  const ws = settings?.weekStartsOn ?? 1;

  /* ------------------------------ Período ------------------------------ */
  const kind: PeriodKind = route.query.get('periodo') === 'month' ? 'month' : 'week';
  const fechaRaw = Number(route.query.get('fecha'));
  const current = useMemo(() => getPeriod(kind, now, ws), [kind, now, ws]);
  const period = useMemo(() => {
    if (!Number.isFinite(fechaRaw) || fechaRaw <= 0) return current;
    const p = getPeriod(kind, fechaRaw, ws);
    return p.start > current.start ? current : p;
  }, [kind, fechaRaw, ws, current]);
  const prev = useMemo(() => shiftPeriod(period, -1, ws), [period, ws]);
  const isCurrent = period.start === current.start;

  const goTo = useCallback(
    (p: Period) => {
      const target = p.start >= current.start ? null : String(p.start);
      setQuery({ periodo: p.kind, fecha: target });
    },
    [current.start],
  );
  const setKind = (k: PeriodKind) => {
    // Conserva el contexto: el nuevo período contiene el inicio del actual.
    const p = getPeriod(k, isCurrent ? now : period.start, ws);
    goTo(p);
  };

  // Normaliza la query: `periodo` siempre explícito y `fecha` sólo si no es el actual.
  useEffect(() => {
    const q = route.query;
    const want = isCurrent ? null : String(period.start);
    if (q.get('periodo') !== kind || (q.get('fecha') ?? null) !== want) setQuery({ periodo: kind, fecha: want });
  }, [route.query, kind, isCurrent, period.start]);

  /* ------------------------------- Datos ------------------------------- */
  const summary = useSummary(period);
  // En el período en curso se compara contra el mismo tramo del anterior (1–9 oct vs. 1–9 nov),
  // no contra el período anterior completo: así la variación no castiga el mes a medio camino.
  const prevCut = useMemo(() => {
    if (!isCurrent) return prev;
    const elapsed = Math.max(60_000, Math.floor(now / 60_000) * 60_000 + 60_000 - period.start);
    return { start: prev.start, end: Math.min(prev.end, prev.start + elapsed) };
  }, [isCurrent, prev, period.start, now]);
  const prevCutSummary = useSummary(prevCut);
  const prevSummary = useSummary(prev);
  const prevLabel = !isCurrent
    ? prev.shortLabel
    : kind === 'month'
      ? `1–${formatDayMonth(prevCut.end - 1)}`
      : `${prev.shortLabel} al mismo corte`;
  const seriesAll = useSeries(period, 'day');
  // En el período en curso sólo se muestran los días transcurridos (sin días futuros en cero).
  const series = useMemo(() => (seriesAll && isCurrent ? seriesAll.filter((p) => p.start <= now) : seriesAll), [seriesAll, isCurrent, now]);
  const historyAnchor = current.start - period.start > 0 && period.start < shiftPeriod(current, -(HISTORY - 1), ws).start ? period.start : now;
  const history = usePeriodHistory(kind, HISTORY, historyAnchor);
  const categories = useCategoryBreakdown(period);
  const services = useServiceBreakdown(period);

  const money = useCallback((c: number) => fmt.money(c), [fmt]);
  const moneyCompact = useCallback((c: number) => fmt.money(c, { compact: true, decimals: false }), [fmt]);

  // Se omiten los períodos anteriores al primer movimiento (antes de usar la app):
  // sólo aplastaban la curva y llenaban la tabla de $0.00.
  const activeHistory = useMemo(() => {
    if (!history) return undefined;
    let last = -1;
    history.forEach((h, i) => {
      if (!isEmptySummary(h.summary)) last = i;
    });
    return history.slice(0, Math.max(last + 1, Math.min(history.length, 3)));
  }, [history]);

  const trend = useMemo<TrendPoint[] | undefined>(
    () =>
      activeHistory
        ?.slice()
        .reverse()
        .map(({ period: p, summary: s }) => ({
          label: trendLabel(p),
          period: p,
          cobradoCents: s.cobradoCents,
          gastadoCents: s.gastadoCents,
          gananciaCents: s.gananciaCents,
          margen: s.margen,
        })),
    [activeHistory],
  );

  const tableRows = useMemo<HistoryRow[] | undefined>(
    () => activeHistory?.slice(0, TABLE_ROWS[kind]).map((h) => ({ id: String(h.period.start), period: h.period, summary: h.summary })),
    [activeHistory, kind],
  );
  const bestId = useMemo(() => {
    if (!tableRows?.length) return null;
    let best: HistoryRow | null = null;
    for (const r of tableRows) if (!isEmptySummary(r.summary) && (!best || r.summary.gananciaCents > best.summary.gananciaCents)) best = r;
    return best && best.summary.gananciaCents > 0 ? best.id : null;
  }, [tableRows]);

  const loading = !summary || !prevSummary || !prevCutSummary || !series;
  const empty = !!summary && isEmptySummary(summary);

  /* ------------------------------ Acciones ----------------------------- */
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [generatedAt, setGeneratedAt] = useState(() => Date.now());

  useEffect(() => {
    let undo: (() => void) | null = null;
    const before = () => {
      setGeneratedAt(Date.now());
      undo = enterPrintMode(pageRef.current);
    };
    const after = () => {
      undo?.();
      undo = null;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      after();
    };
  }, []);

  const exportCsv = () => {
    if (!series) return;
    downloadBlob(buildPeriodCsv(period, series), csvFilename(period));
    toast({ title: 'CSV exportado', description: `${period.label} · ${series.length} días`, tone: 'success' });
  };
  const print = () => {
    setGeneratedAt(Date.now());
    window.print();
  };

  /* ------------------------------ Render ------------------------------- */
  return (
    <div ref={pageRef} className={styles.page}>
      <div className={styles.printHeader} aria-hidden>
        <div>
          <p className={styles.printBrand}>{settings?.businessName || 'Mi servicio técnico'}</p>
          <p className={styles.printTitle}>
            Reporte {kind === 'week' ? 'semanal' : 'mensual'} · {period.label}
          </p>
          <p className={styles.printMeta}>{rangeLabel(period)}</p>
        </div>
        <p className={styles.printMeta}>Generado el {formatDateTime(generatedAt)}</p>
      </div>

      <PageHeader
        className={styles.header}
        title="Reportes"
        subtitle="Cuánto cobraste, cuánto gastaste y qué ganancia te queda."
        actions={
          <>
            <Button variant="secondary" iconLeft={<Download />} onClick={exportCsv} disabled={!series}>
              Exportar CSV
            </Button>
            <Button variant="secondary" iconLeft={<Printer />} onClick={print}>
              Imprimir
            </Button>
          </>
        }
      />

      {/* Barra de control */}
      <div className={styles.controls} role="toolbar" aria-label="Período del reporte">
        <SegmentedControl<PeriodKind> value={kind} onChange={setKind} options={KIND_OPTIONS} aria-label="Agrupar por" className={styles.kind} />
        <div className={styles.navigator}>
          <IconButton icon={<ChevronLeft />} label={kind === 'week' ? 'Semana anterior' : 'Mes anterior'} variant="ghost" onClick={() => goTo(prev)} />
          <motion.div
            key={period.start + kind}
            className={styles.periodLabel}
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            aria-live="polite"
          >
            <span className={styles.periodTitle}>{period.label}</span>
            <span className={styles.periodRange}>
              {rangeLabel(period)}
              {isCurrent && <Badge tone="brand" size="sm" dot pulse>En curso</Badge>}
            </span>
          </motion.div>
          <IconButton
            icon={<ChevronRight />}
            label={kind === 'week' ? 'Semana siguiente' : 'Mes siguiente'}
            variant="ghost"
            onClick={() => goTo(shiftPeriod(period, 1, ws))}
            disabled={isCurrent}
          />
        </div>
        <Button variant="ghost" size="sm" iconLeft={<CalendarDays />} onClick={() => goTo(current)} disabled={isCurrent} className={styles.today}>
          Hoy
        </Button>
      </div>

      {/* Ecuación héroe */}
      <Hero
        summary={summary}
        prev={prevCutSummary}
        prevLabel={prevLabel}
        closed={empty && isCurrent ? prevSummary : undefined}
        closedLabel={kind === 'week' ? 'La semana pasada' : 'El mes pasado'}
        money={money}
      />

      {empty && !loading ? (
        <Card className={styles.emptyCard}>
          <EmptyState
            icon={<Receipt />}
            accent={<Plus />}
            title={
              isCurrent
                ? `${kind === 'week' ? 'La semana' : 'El mes'} apenas empieza`
                : `Sin movimientos en ${kind === 'week' ? 'esa semana' : 'ese mes'}`
            }
            description={
              isCurrent
                ? `Todavía no hay servicios ni gastos registrados ${kind === 'week' ? 'esta semana' : 'este mes'}. En cuanto registres uno, aquí verás el día a día; mientras tanto, revisa cómo cerró ${kind === 'week' ? 'la semana anterior' : 'el mes anterior'}.`
                : `No hay servicios ni gastos registrados en ${kind === 'week' ? 'la ' + period.label.toLowerCase() : period.label.toLowerCase()}.`
            }
            action={
              <Button variant="primary" iconLeft={<Plus />} onClick={() => navigate('#/clientes?nuevo=1')}>
                Registrar servicio
              </Button>
            }
            secondaryAction={
              <Button variant="secondary" onClick={() => goTo(prev)}>
                Ver {kind === 'week' ? 'semana' : 'mes'} anterior
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Card
            className={styles.chartCard}
            title="Día a día"
            icon={<BarChart3 />}
            description="Lo que cobraste y gastaste cada día, con la ganancia resultante."
          >
            <div data-print-fit className={styles.chartBox}>
              {series ? (
                <BarChart<SeriesPoint>
                  data={series}
                  series={BAR_SERIES}
                  lineSeries={LINE_SERIES}
                  height={mobile ? 220 : 280}
                  formatValue={money}
                  formatAxisValue={moneyCompact}
                  formatTooltipLabel={(_, d) => capitalize(longDayLabel(d.start))}
                  tooltipFooter={(d) => (
                    <span className={styles.tipFoot}>
                      {d.servicios} {d.servicios === 1 ? 'servicio' : 'servicios'}
                    </span>
                  )}
                  maxBarWidth={series.length <= 8 ? 28 : series.length <= 16 ? 18 : 12}
                  barGap={series.length <= 16 ? 3 : 1}
                  ariaLabel={`Cobrado, gastado y ganancia por día, ${period.label}`}
                />
              ) : (
                <ChartSkeleton height={mobile ? 220 : 280} />
              )}
            </div>
          </Card>

          <div className={styles.breakdowns}>
            <Card title="Gastos por categoría" icon={<PieChart />} description="En qué se fue el dinero del período." className={styles.breakCard}>
              <div data-print-fit>
                {categories ? (
                  <DonutChart
                    data={categoryDonut(categories)}
                    formatValue={money}
                    formatPercent={(r) => formatPercent(r)}
                    centerLabel="Gastado"
                    maxSegments={9}
                    size={mobile ? 168 : 188}
                    emptyMessage="Sin gastos en este período"
                    ariaLabel={`Gastos por categoría, ${period.label}`}
                  />
                ) : (
                  <div className={styles.donutSkeleton}>
                    <Skeleton circle height={168} />
                    <Skeleton lines={4} height={10} />
                  </div>
                )}
              </div>
            </Card>
            <Card title="Ingresos por servicio" icon={<Wrench />} description="Qué tipo de trabajo te dejó más dinero." className={styles.breakCard}>
              {services ? (
                <HBarList
                  items={services.map((s) => ({
                    key: s.servicio,
                    label: s.servicio,
                    value: s.cobradoCents,
                    sublabel: `${s.count} ${s.count === 1 ? 'servicio' : 'servicios'}`,
                  }))}
                  color="var(--income)"
                  formatValue={money}
                  formatPercent={(r) => formatPercent(r)}
                  header={['Servicio', 'Cobrado']}
                  max={7}
                  emptyMessage="Sin cobros en este período"
                  ariaLabel={`Ingresos por tipo de servicio, ${period.label}`}
                />
              ) : (
                <Skeleton lines={6} height={28} radius={8} />
              )}
            </Card>
          </div>
        </>
      )}

      <TrendCard kind={kind} trend={trend} money={money} moneyCompact={moneyCompact} selectedStart={period.start} onSelect={goTo} mobile={mobile} />

      <section className={styles.tableSection} aria-labelledby="rep-compare">
        <div className={styles.sectionHead}>
          <h2 id="rep-compare" className={styles.sectionTitle}>
            Comparativa de {periodsLabel(kind, tableRows?.length ?? TABLE_ROWS[kind])}
          </h2>
          <p className={styles.sectionDesc}>Toca una fila para ver ese período en detalle.</p>
        </div>
        <CompareTable rows={tableRows} selectedId={String(period.start)} currentId={String(current.start)} bestId={bestId} onOpen={goTo} money={money} />
      </section>
    </div>
  );
}

/* ================================ Héroe ================================= */

function Hero({
  summary,
  prev,
  prevLabel,
  closed,
  closedLabel,
  money,
}: {
  summary?: Summary;
  prev?: Summary;
  prevLabel: string;
  /** Período en curso aún sin movimientos: cómo cerró el anterior, en lugar de un "0 %" vacío. */
  closed?: Summary;
  closedLabel: string;
  money: (c: number) => string;
}) {
  if (!summary || !prev) {
    return (
      <Card padding="none" className={styles.hero} aria-busy="true">
        <div className={styles.equation}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={styles.term}>
              <Skeleton width={90} height={12} />
              <Skeleton width="72%" height={38} radius={10} />
              <Skeleton width={120} height={12} />
            </div>
          ))}
        </div>
        <div className={styles.stats}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={styles.stat}>
              <Skeleton width={70} height={10} />
              <Skeleton width={90} height={18} />
            </div>
          ))}
        </div>
      </Card>
    );
  }
  const negative = summary.gananciaCents < 0;
  return (
    <Card padding="none" className={styles.hero}>
      <div className={styles.equation}>
        <Term tone="income" label="Cobrado" hint="Dinero que entró" value={summary.cobradoCents} prev={prev.cobradoCents} prevLabel={prevLabel} closed={closed && `${closedLabel} cerró en ${money(closed.cobradoCents)}`} money={money} />
        <Operator icon={<Minus />} label="menos" />
        <Term tone="expense" label="Gastado" hint="Repuestos y otros gastos" value={summary.gastadoCents} prev={prev.gastadoCents} prevLabel={prevLabel} closed={closed && `${closedLabel} cerró en ${money(closed.gastadoCents)}`} money={money} invert />
        <Operator icon={<Equal />} label="igual a" />
        <Term
          tone={negative ? 'loss' : 'profit'}
          label={negative ? 'Pérdida' : 'Ganancia'}
          hint={negative ? 'Gastaste más de lo que cobraste' : 'Lo que te queda'}
          value={summary.gananciaCents}
          prev={prev.gananciaCents}
          prevLabel={prevLabel}
          closed={closed && `${closedLabel} cerró en ${money(closed.gananciaCents)}`}
          money={money}
          emphasis
        />
      </div>
      <dl className={styles.stats}>
        <Stat label="Margen" value={formatPercent(summary.margen)} hint="de lo cobrado es ganancia">
          <span className={styles.marginTrack} aria-hidden>
            <motion.span
              className={cx(styles.marginFill, negative && styles.marginNeg)}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.abs(summary.margen ?? 0) * 100)}%` }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            />
          </span>
        </Stat>
        <Stat label="Facturado" value={money(summary.facturadoCents)} hint="valor total de los servicios" />
        <Stat label="Por cobrar" value={money(summary.porCobrarCents)} hint="saldo pendiente de clientes" tone={summary.porCobrarCents > 0 ? 'pending' : undefined} />
        <Stat label="Servicios" value={formatNumber(summary.servicios)} hint={`${formatNumber(summary.entregados)} entregados`} />
        <Stat label="Ticket promedio" value={money(summary.ticketPromedioCents)} hint="por servicio" />
      </dl>
    </Card>
  );
}

function Term({
  tone,
  label,
  hint,
  value,
  prev,
  prevLabel,
  money,
  invert,
  emphasis,
  closed,
}: {
  tone: 'income' | 'expense' | 'profit' | 'loss';
  label: string;
  hint: string;
  value: number;
  prev: number;
  prevLabel: string;
  money: (c: number) => string;
  invert?: boolean;
  emphasis?: boolean;
  closed?: string;
}) {
  const delta = value === 0 && prev === 0 ? 0 : percentChange(value, prev);
  const dir = delta == null ? 1 : delta > 0.0005 ? 1 : delta < -0.0005 ? -1 : 0;
  const good = invert ? dir < 0 : dir > 0;
  const deltaTone = dir === 0 ? styles.flat : good ? styles.good : styles.bad;
  const Icon = dir > 0 ? ArrowUpRight : dir < 0 ? ArrowDownRight : Minus;
  return (
    <div className={cx(styles.term, styles[tone], emphasis && styles.emphasis)}>
      <div className={styles.termHead}>
        <span className={styles.termDot} aria-hidden />
        <span className={styles.termLabel}>{label}</span>
      </div>
      <div className={styles.termValue}>
        <AnimatedNumber value={value} format={money} />
      </div>
      <div className={styles.termFoot}>
        {closed ? (
          <span className={styles.termPrev}>{closed}</span>
        ) : (
          <>
            <span className={cx(styles.delta, deltaTone)} title={`Antes: ${money(prev)}`}>
              <Icon aria-hidden />
              {delta == null ? 'Nuevo' : formatDelta(delta)}
            </span>
            <span className={styles.termPrev}>
              vs. {prevLabel} · {money(prev)}
            </span>
          </>
        )}
      </div>
      <p className={styles.termHint}>{hint}</p>
    </div>
  );
}

function Operator({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className={styles.operator} role="presentation">
      <span className={styles.opIcon} aria-label={label}>
        {icon}
      </span>
    </div>
  );
}

function Stat({ label, value, hint, tone, children }: { label: string; value: string; hint: string; tone?: 'pending'; children?: ReactNode }) {
  return (
    <div className={styles.stat}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={cx(styles.statValue, tone && styles[tone])}>{value}</dd>
      {children}
      <dd className={styles.statHint}>{hint}</dd>
    </div>
  );
}

/* ============================== Tendencia =============================== */

function TrendCard({
  kind,
  trend,
  money,
  moneyCompact,
  selectedStart,
  onSelect,
  mobile,
}: {
  kind: PeriodKind;
  trend?: TrendPoint[];
  money: (c: number) => string;
  moneyCompact: (c: number) => string;
  selectedStart: number;
  onSelect: (p: Period) => void;
  mobile: boolean;
}) {
  const active = useRef<number | null>(null);
  const beforeDown = useRef<number | null>(null);
  const pointerType = useRef<string>('mouse');

  const totals = useMemo(() => {
    if (!trend) return null;
    const c = trend.reduce((a, t) => a + t.cobradoCents, 0);
    const g = trend.reduce((a, t) => a + t.gastadoCents, 0);
    return { c, g, n: c - g, avg: Math.round((c - g) / Math.max(1, trend.length)) };
  }, [trend]);

  const open = () => {
    const i = active.current;
    if (i == null || !trend?.[i]) return;
    onSelect(trend[i].period);
  };

  const selIndex = trend?.findIndex((t) => t.period.start === selectedStart) ?? -1;

  return (
    <Card
      className={styles.chartCard}
      title={`Tendencia de ${periodsLabel(kind, trend?.length ?? HISTORY)}`}
      icon={<TrendingUp />}
      description={mobile ? 'Toca dos veces un punto para abrir ese período.' : 'Haz clic en un punto para abrir ese período.'}
      actions={
        totals ? (
          <div className={styles.trendTotals}>
            <span>Ganancia acumulada</span>
            <strong className={totals.n < 0 ? styles.negText : styles.profitText}>{money(totals.n)}</strong>
          </div>
        ) : null
      }
    >
      <div
        data-print-fit
        className={cx(styles.chartBox, styles.clickable)}
        onPointerDownCapture={(e: RPointerEvent) => {
          pointerType.current = e.pointerType;
          beforeDown.current = active.current;
        }}
        onClick={() => {
          if (pointerType.current === 'touch' && beforeDown.current !== active.current) return;
          open();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            open();
          }
        }}
      >
        {trend ? (
          <AreaChart<TrendPoint>
            data={trend}
            series={TREND_SERIES}
            height={mobile ? 220 : 260}
            formatValue={money}
            formatAxisValue={moneyCompact}
            formatTooltipLabel={(_, d) => d.period.label}
            tooltipFooter={(d, i) => (
              <span className={styles.tipFoot}>
                Margen {formatPercent(d.margen)}
                {i === selIndex ? ' · En pantalla' : mobile ? ' · Toca de nuevo para abrir' : ' · Clic para abrir'}
              </span>
            )}
            showDots
            onActiveChange={(i) => {
              active.current = i;
            }}
            ariaLabel={`Tendencia de cobrado, gastado y ganancia por ${kind === 'week' ? 'semana' : 'mes'}. Pulsa Enter para abrir el período activo`}
          />
        ) : (
          <ChartSkeleton height={mobile ? 220 : 260} />
        )}
      </div>
    </Card>
  );
}

/* ============================ Comparativa =============================== */

function CompareTable({
  rows,
  selectedId,
  currentId,
  bestId,
  onOpen,
  money,
}: {
  rows?: HistoryRow[];
  selectedId: string;
  currentId: string;
  bestId: string | null;
  onOpen: (p: Period) => void;
  money: (c: number) => string;
}) {
  const tags = (r: HistoryRow) => (
    <>
      {r.id === currentId && (
        <Badge tone="brand" size="sm">
          Actual
        </Badge>
      )}
      {r.id === bestId && (
        <Badge tone="income" size="sm" icon={<Crown />}>
          Mejor
        </Badge>
      )}
    </>
  );
  const columns: Column<HistoryRow>[] = [
    {
      key: 'periodo',
      header: 'Período',
      cell: (r) => (
        <span className={styles.periodCell}>
          <span className={styles.periodName}>{r.period.kind === 'week' ? r.period.shortLabel : capitalize(r.period.label)}</span>
          {tags(r)}
        </span>
      ),
      sortValue: (r) => r.period.start,
      defaultDir: 'desc',
      width: '30%',
    },
    { key: 'cobrado', header: 'Cobrado', align: 'right', cell: (r) => <span className={styles.numIncome}>{money(r.summary.cobradoCents)}</span>, sortValue: (r) => r.summary.cobradoCents, defaultDir: 'desc' },
    { key: 'gastado', header: 'Gastado', align: 'right', cell: (r) => <span className={styles.numExpense}>{money(r.summary.gastadoCents)}</span>, sortValue: (r) => r.summary.gastadoCents, defaultDir: 'desc' },
    {
      key: 'ganancia',
      header: 'Ganancia',
      align: 'right',
      cell: (r) => <span className={r.summary.gananciaCents < 0 ? styles.numLoss : styles.numProfit}>{money(r.summary.gananciaCents)}</span>,
      sortValue: (r) => r.summary.gananciaCents,
      defaultDir: 'desc',
    },
    { key: 'margen', header: 'Margen', align: 'right', cell: (r) => <span className={styles.num}>{formatPercent(r.summary.margen)}</span>, sortValue: (r) => r.summary.margen ?? -Infinity, defaultDir: 'desc', hideBelow: 'lg' },
    { key: 'servicios', header: 'Servicios', align: 'right', cell: (r) => <span className={styles.num}>{formatNumber(r.summary.servicios)}</span>, sortValue: (r) => r.summary.servicios, defaultDir: 'desc' },
  ];
  return (
    <DataTable<HistoryRow>
      columns={columns}
      rows={rows}
      getRowId={(r) => r.id}
      onRowClick={(r) => onOpen(r.period)}
      selectedId={selectedId}
      rowAccent={(r) => (r.id === bestId ? 'var(--income)' : undefined)}
      stickyHeader={false}
      caption="Comparativa de períodos"
      skeletonRows={8}
      renderMobileRow={(r) => (
        <div className={styles.mRow}>
          <div className={styles.mTop}>
            <span className={styles.periodCell}>
              <span className={styles.periodName}>{r.period.kind === 'week' ? r.period.shortLabel : capitalize(r.period.label)}</span>
              {tags(r)}
            </span>
            <span className={r.summary.gananciaCents < 0 ? styles.numLoss : styles.numProfit}>{money(r.summary.gananciaCents)}</span>
          </div>
          <div className={styles.mBottom}>
            <span>
              <i className={styles.dotIncome} aria-hidden />
              {money(r.summary.cobradoCents)}
            </span>
            <span>
              <i className={styles.dotExpense} aria-hidden />
              {money(r.summary.gastadoCents)}
            </span>
            <span>
              {formatPercent(r.summary.margen)} · {r.summary.servicios} serv.
            </span>
          </div>
        </div>
      )}
    />
  );
}

/* ============================== Auxiliares ============================== */

/** Hora actual refrescada cada minuto (para detectar el cambio de semana/mes). */
function useMinuteNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function ChartSkeleton({ height }: { height: number }) {
  return (
    <div className={styles.chartSkeleton} style={{ height }} aria-hidden>
      {Array.from({ length: 12 }, (_, i) => (
        <Skeleton key={i} width="100%" height={`${30 + ((i * 37) % 60)}%`} radius={6} />
      ))}
    </div>
  );
}

/**
 * Colores del donut: distintos por posición (sin choques como "Pantallas" y "Otros"
 * en el mismo violeta) y "Otros" siempre en gris neutro.
 */
function categoryDonut(rows: { categoria: string; label: string; totalCents: number }[]): DonutDatum[] {
  let rank = 0;
  return rows.map((c) => ({
    key: c.categoria,
    label: c.label,
    value: c.totalCents,
    color: c.categoria === 'otros' ? 'var(--chart-8)' : `var(--chart-${(rank++ % 7) + 1})`,
  }));
}

/** "las últimas 8 semanas" / "los últimos 4 meses". */
function periodsLabel(kind: PeriodKind, n: number): string {
  return kind === 'week' ? `las últimas ${n} semanas` : `los últimos ${n} meses`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

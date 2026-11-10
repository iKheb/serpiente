/* Bloques del panel: KPIs del periodo, gráfico, taller, listas, inventario y actividad. */
import { useMemo } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Download,
  Info,
  PackageCheck,
  PackageX,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Settings2,
  Ticket,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  Wallet,
  Wrench,
  Percent,
  HandCoins,
  PiggyBank,
  Clock3,
  Sunrise,
} from 'lucide-react';
import { BarChart, Sparkline, useMeasure, type ChartSeries } from '@/charts';
import {
  deviceLabel,
  formatDayHeading,
  formatFolio,
  formatNumber,
  formatPercent,
  saldoCents,
  useAudit,
  useFormatters,
  REPAIR_STATUS_LABEL,
  type AuditAction,
  type AuditEntry,
  type Client,
  type InventoryItem,
  type PeriodKind,
  type RepairStatus,
  type SeriesPoint,
} from '@/data';
import { Badge, Button, Card, DateTimeText, EmptyState, KpiCard, Skeleton, StatusBadge, cx, useMediaQuery } from '@/ui';
import { navigate } from '@/app/router';
import { DeltaPill, compareLabel } from './Hero';
import { daysWaiting, ratio, type PeriodData, type WorkshopData } from './usePanelData';
import s from './Panel.module.css';

/* --------------------------------- KPIs ---------------------------------- */

export function PeriodKpis({ data, kind }: { data: PeriodData; kind: PeriodKind }) {
  const fmt = useFormatters();
  const { summary: cur, previousSummary: prev, previousFullSummary: closed, series, todayIndex, previousToDate, quiet } = data;
  const loading = !cur || !prev;
  const label = compareLabel(kind, previousToDate);
  const upto = useMemo(() => (series ? (todayIndex >= 0 ? series.slice(0, todayIndex + 1) : series) : []), [series, todayIndex]);
  const labels = upto.map((p) => p.label);
  const money = (n: number) => fmt.money(n);
  const spark = (key: keyof SeriesPoint, tone: 'income' | 'expense' | 'profit') =>
    upto.length >= 2 && !quiet ? (
      <Sparkline data={upto.map((p) => p[key] as number)} tone={tone} height={44} interactive labels={labels} formatValue={money} ariaLabel={`Tendencia diaria`} />
    ) : undefined;
  // Periodo recién iniciado: sin un "−0 %" vacío; se muestra cómo cerró el anterior como referencia.
  const prevName = kind === 'week' ? 'Semana pasada' : 'Mes pasado';
  const ref = (v: number | undefined, suffix = '') =>
    quiet ? (
      <span className={s.kpiRef}>
        {prevName} cerró en <strong className="tabular-nums">{v === undefined ? '…' : fmt.money(v)}</strong>
        {suffix}
      </span>
    ) : undefined;
  // Con menos de 3 días transcurridos la comparación (mismo tramo del periodo anterior) es muy volátil:
  // se muestra en tono neutro para no alarmar con un "−75 %" el lunes por la mañana.
  const early = todayIndex >= 0 && todayIndex < 2;
  const delta = (a: number | undefined, b: number | undefined) => (quiet ? undefined : a !== undefined && b !== undefined && cur && prev ? ratio(a, b) : undefined);

  return (
    <div className={cx(s.kpiGrid, quiet && s.kpiQuiet)}>
      <KpiCard
        label="Cobrado"
        tone="income"
        icon={<TrendingUp />}
        value={cur?.cobradoCents ?? 0}
        format={money}
        delta={delta(cur?.cobradoCents, prev?.cobradoCents)}
        deltaLabel={label}
        deltaNeutral={early}
        sparkline={spark('cobradoCents', 'income')}
        footer={ref(closed?.cobradoCents)}
        loading={loading}
        href="#/clientes"
      />
      <KpiCard
        label="Gastado"
        tone="expense"
        icon={<TrendingDown />}
        value={cur?.gastadoCents ?? 0}
        format={money}
        invertDelta
        delta={delta(cur?.gastadoCents, prev?.gastadoCents)}
        deltaLabel={label}
        deltaNeutral={early}
        sparkline={spark('gastadoCents', 'expense')}
        footer={ref(closed?.gastadoCents)}
        loading={loading}
        href="#/gastos"
      />
      <KpiCard
        label="Ganancia"
        tone="profit"
        icon={<PiggyBank />}
        value={cur?.gananciaCents ?? 0}
        format={money}
        delta={delta(cur?.gananciaCents, prev?.gananciaCents)}
        deltaLabel={label}
        deltaNeutral={early}
        sparkline={spark('gananciaCents', 'profit')}
        footer={ref(closed?.gananciaCents)}
        loading={loading}
        href={`#/reportes?periodo=${kind}`}
      />
      <KpiCard
        label="Por cobrar"
        tone="pending"
        icon={<Wallet />}
        value={cur?.porCobrarCents ?? 0}
        format={money}
        invertDelta
        delta={delta(cur?.porCobrarCents, prev?.porCobrarCents)}
        deltaLabel={label}
        deltaNeutral={early}
        footer={
          quiet ? (
            <span className={s.kpiRef}>
              Nada facturado aún {kind === 'week' ? 'esta semana' : 'este mes'}
            </span>
          ) : cur ? (
            <span>De {fmt.money(cur.facturadoCents)} facturado en el periodo</span>
          ) : undefined
        }
        loading={loading}
        href="#/clientes"
      />
    </div>
  );
}

/** Aviso del periodo recién iniciado: explica los ceros y ofrece el anterior como referencia. */
export function FreshPeriodNote({ data, kind }: { data: PeriodData; kind: PeriodKind }) {
  const { todayIndex, previous } = data;
  if (!data.quiet) return null;
  const day = todayIndex >= 0 ? todayIndex + 1 : 1;
  const noun = kind === 'week' ? 'semana' : 'mes';
  const title =
    day === 1
      ? kind === 'week'
        ? 'La semana empezó hoy'
        : 'El mes empezó hoy'
      : `Van ${day} días ${kind === 'week' ? 'de esta semana' : 'de este mes'} sin movimientos`;
  return (
    <div className={s.freshNote} role="status">
      <span className={s.freshIcon} aria-hidden>
        <Sunrise />
      </span>
      <div className={s.freshText}>
        <strong>{title}</strong>
        <span>
          Todavía no hay servicios nuevos ni gastos {kind === 'week' ? 'esta semana' : 'este mes'}. Mientras tanto, abajo ves cómo cerró {kind === 'week' ? 'la semana pasada' : 'el mes pasado'} ({previous.shortLabel}) como referencia.
        </span>
      </div>
      <div className={s.freshActions}>
        <Button variant="secondary" size="sm" iconLeft={<Plus />} onClick={() => navigate('#/clientes?nuevo=1')}>
          Registrar servicio
        </Button>
        <Button variant="ghost" size="sm" iconRight={<ArrowRight />} onClick={() => navigate(`#/reportes?periodo=${kind}&fecha=${previous.start}`)}>
          Ver {noun} anterior
        </Button>
      </div>
    </div>
  );
}

export function SecondaryMetrics({ data }: { data: PeriodData }) {
  const fmt = useFormatters();
  const { summary: cur, previousSummary: base, quiet, todayIndex } = data;
  const early = todayIndex >= 0 && todayIndex < 2;
  // Sin movimientos aún: no se muestran variaciones contra un corte vacío.
  const prev = quiet ? undefined : base;
  const items = [
    { icon: <Wrench />, label: 'Servicios', value: cur ? formatNumber(cur.servicios) : null, delta: cur && prev ? ratio(cur.servicios, prev.servicios) : undefined },
    {
      icon: <Ticket />,
      label: 'Ticket promedio',
      value: cur ? fmt.money(cur.ticketPromedioCents) : null,
      delta: cur && prev ? ratio(cur.ticketPromedioCents, prev.ticketPromedioCents) : undefined,
    },
    {
      icon: <Percent />,
      label: 'Margen',
      value: cur ? formatPercent(cur.margen) : null,
      delta: cur && prev && cur.margen != null && prev.margen != null ? cur.margen - prev.margen : undefined,
      points: true,
    },
    { icon: <PackageCheck />, label: 'Entregados', value: cur ? formatNumber(cur.entregados) : null, delta: cur && prev ? ratio(cur.entregados, prev.entregados) : undefined },
  ];
  return (
    <dl className={s.metrics}>
      {items.map((it) => (
        <div key={it.label} className={s.metric}>
          <dt>
            <span className={s.metricIcon} aria-hidden>
              {it.icon}
            </span>
            {it.label}
          </dt>
          <dd>
            {it.value == null ? <Skeleton width={70} height={18} /> : <span className={cx(s.metricValue, 'tabular-nums')}>{it.value}</span>}
            {it.points && typeof it.delta === 'number' ? (
              <span className={cx(s.deltaPill, early ? s.flat : it.delta > 0.0005 ? s.good : it.delta < -0.0005 ? s.bad : s.flat)}>
                {it.delta > 0 ? '+' : it.delta < 0 ? '−' : ''}
                {formatNumber(Math.abs(it.delta * 100), 1)} pts
              </span>
            ) : (
              !it.points && <DeltaPill value={it.delta} neutral={early} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* -------------------------------- Gráfico -------------------------------- */

const BARS: ChartSeries[] = [
  { key: 'cobradoCents', label: 'Cobrado', color: 'var(--income)' },
  { key: 'gastadoCents', label: 'Gastado', color: 'var(--expense)' },
];
const PROFIT_LINE: ChartSeries[] = [{ key: 'gananciaCents', label: 'Ganancia', color: 'var(--profit)' }];

export function FlowChart({ data, kind }: { data: PeriodData; kind: PeriodKind }) {
  const fmt = useFormatters();
  const { period, previous, quiet } = data;
  // Periodo recién iniciado y vacío: se muestra el anterior completo, rotulado como referencia.
  // También en sus dos primeros días: un día con datos y el resto en cero dibujaría una caída a $0 que no ocurrió.
  const early = data.todayIndex >= 0 && data.todayIndex < 2;
  const showPrev = (quiet || early) && !!data.previousFullSummary && (data.previousFullSummary.cobradoCents !== 0 || data.previousFullSummary.gastadoCents !== 0);
  const series = showPrev ? data.previousSeries : data.series;
  const summary = showPrev ? data.previousFullSummary : data.summary;
  const shown = showPrev ? previous : period;
  const prevNoun = kind === 'week' ? 'la semana pasada' : 'el mes pasado';
  // El gráfico ocupa todo el alto que deja la columna derecha (sin hueco al pie de la tarjeta).
  const [fillRef, fillSize] = useMeasure<HTMLDivElement>();
  const phone = useMediaQuery('(max-width: 599px)');
  const chartH = phone ? 220 : Math.max(260, Math.min(460, fillSize.height || 300));
  return (
    <Card
      className={s.chartCard}
      title={showPrev ? `Así cerró ${prevNoun}` : 'Cobrado vs. gastado por día'}
      description={showPrev ? `${shown.shortLabel ?? shown.label} · referencia mientras ${kind === 'week' ? 'esta semana' : 'este mes'} toma forma` : `${period.label} · la línea muestra la ganancia diaria`}
      actions={
        <Button variant="ghost" size="sm" iconRight={<ArrowRight />} onClick={() => navigate(`#/reportes?periodo=${kind}${showPrev ? `&fecha=${previous.start}` : ''}`)}>
          Reportes
        </Button>
      }
    >
      {series ? (
        <div className={s.chartBody}>
          {summary && (
            <div className={s.chartTotals}>
              {showPrev && (
                <Badge tone="neutral" size="sm" className={s.refBadge}>
                  {kind === 'week' ? 'Semana pasada' : 'Mes pasado'}
                </Badge>
              )}
              <ChartTotal color="var(--income)" label="Cobrado" value={fmt.money(summary.cobradoCents)} />
              <ChartTotal color="var(--expense)" label="Gastado" value={fmt.money(summary.gastadoCents)} />
              <ChartTotal color="var(--profit)" label="Ganancia" value={fmt.money(summary.gananciaCents)} line />
            </div>
          )}
          <div ref={fillRef} className={cx(s.chartFill, showPrev && s.chartRef)}>
            <BarChart
              data={series}
              series={BARS}
              lineSeries={PROFIT_LINE}
              height={chartH}
              maxBarWidth={kind === 'week' ? 28 : 12}
              formatValue={(n) => fmt.money(n)}
              formatAxisValue={(n) => fmt.money(n, { compact: true })}
              formatTooltipLabel={(_l, d) => formatDayHeading(d.start)}
              tooltipFooter={(d) => (
                <div className={s.tipFoot}>
                  <span>Margen</span>
                  <span className="tabular-nums">{d.cobradoCents ? formatPercent(d.gananciaCents / d.cobradoCents) : '—'}</span>
                </div>
              )}
              legend="none"
              curve="linear"
              emptyMessage={kind === 'week' ? 'Aún no hay cobros ni gastos esta semana' : 'Aún no hay cobros ni gastos este mes'}
              ariaLabel={`Cobrado, gastado y ganancia por día · ${shown.label}`}
            />
          </div>
          {summary && series.length > 0 && <FlowFacts series={series} todayIndex={showPrev ? -1 : data.todayIndex} />}
        </div>
      ) : (
        <Skeleton height={300} radius={10} />
      )}
    </Card>
  );
}

/** Pie del gráfico: mejor día y días con movimiento (llena el alto de la tarjeta con algo útil). */
function FlowFacts({ series, todayIndex }: { series: SeriesPoint[]; todayIndex: number }) {
  const fmt = useFormatters();
  const upto = todayIndex >= 0 ? series.slice(0, todayIndex + 1) : series;
  const active = upto.filter((p) => p.cobradoCents !== 0 || p.gastadoCents !== 0);
  if (active.length === 0) return null;
  const best = active.reduce((a, p) => (p.gananciaCents > a.gananciaCents ? p : a), active[0]);
  const avg = Math.round(active.reduce((a, p) => a + p.gananciaCents, 0) / active.length);
  return (
    <dl className={s.flowFacts}>
      <div>
        <dt>Mejor día</dt>
        <dd>
          <span className="tabular-nums">{fmt.money(best.gananciaCents)}</span>
          <span className={s.flowFactSub}>{formatDayHeading(best.start)}</span>
        </dd>
      </div>
      <div>
        <dt>Ganancia promedio por día</dt>
        <dd>
          <span className="tabular-nums">{fmt.money(avg)}</span>
          <span className={s.flowFactSub}>en días con movimiento</span>
        </dd>
      </div>
      <div>
        <dt>Días con movimiento</dt>
        <dd>
          <span className="tabular-nums">
            {active.length} de {upto.length}
          </span>
          <span className={s.flowFactSub}>{upto.length === series.length ? 'del periodo' : 'transcurridos'}</span>
        </dd>
      </div>
    </dl>
  );
}

function ChartTotal({ color, label, value, line }: { color: string; label: string; value: string; line?: boolean }) {
  return (
    <div className={s.chartTotal}>
      <span className={s.chartTotalLabel}>
        <span className={cx(s.swatch, line && s.swatchLine)} style={{ background: color }} aria-hidden />
        {label}
      </span>
      <span className={cx(s.chartTotalValue, 'tabular-nums')}>{value}</span>
    </div>
  );
}

/* ------------------------------ En el taller ----------------------------- */

const PIPELINE: RepairStatus[] = ['recibido', 'diagnostico', 'reparando', 'listo'];

export function Pipeline({ counts }: { counts: WorkshopData['statusCounts'] }) {
  const total = counts ? PIPELINE.reduce((a, k) => a + counts[k], 0) : 0;
  return (
    <Card
      className={s.pipelineCard}
      title="En el taller"
      description={counts ? `${formatNumber(total)} ${total === 1 ? 'equipo' : 'equipos'} en proceso` : 'Cargando…'}
      icon={<Wrench />}
      actions={
        <Button variant="ghost" size="sm" iconRight={<ArrowRight />} onClick={() => navigate('#/clientes')}>
          Ver todos
        </Button>
      }
    >
      <div className={s.pipeBar} role="img" aria-label={counts ? PIPELINE.map((k) => `${REPAIR_STATUS_LABEL[k]}: ${counts[k]}`).join(', ') : 'Cargando'}>
        {counts && total > 0 ? (
          PIPELINE.filter((k) => counts[k] > 0).map((k) => (
            <span key={k} className={s.pipeSeg} style={{ flexGrow: counts[k], background: `var(--status-${k})` }} />
          ))
        ) : (
          <span className={s.pipeSeg} style={{ flexGrow: 1, background: 'var(--surface-active)' }} />
        )}
      </div>
      <ol className={s.pipeSteps}>
        {PIPELINE.map((k, i) => (
          <li key={k}>
            <a href={`#/clientes?estado=${k}`} className={s.pipeStep} style={{ ['--tone' as string]: `var(--status-${k})` }}>
              <span className={s.pipeStepTop}>
                <span className={s.pipeDot} aria-hidden />
                <span className={s.pipeIdx} aria-hidden>
                  {i + 1}
                </span>
              </span>
              <span className={cx(s.pipeCount, 'tabular-nums')}>{counts ? counts[k] : <Skeleton width={28} height={26} />}</span>
              <span className={s.pipeLabel}>
                {k === 'listo' ? (
                  <>
                    <span className={s.labelLong}>{REPAIR_STATUS_LABEL[k]}</span>
                    <span className={s.labelShort}>Listos</span>
                  </>
                ) : (
                  REPAIR_STATUS_LABEL[k]
                )}
              </span>
              <ArrowRight className={s.pipeArrow} aria-hidden />
            </a>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ----------------------------- Listas cortas ----------------------------- */

export function ReadyList({ ready, now }: { ready: Client[]; now: number }) {
  const fmt = useFormatters();
  return (
    <Card
      className={s.listCard}
      padding="none"
      title="Listos para entregar"
      icon={<PackageCheck />}
      description={ready.length ? `${ready.length} ${ready.length === 1 ? 'equipo espera' : 'equipos esperan'} a su dueño` : 'Nada pendiente de entrega'}
      actions={
        ready.length > 0 ? (
          <Button variant="ghost" size="sm" iconRight={<ArrowRight />} onClick={() => navigate('#/clientes?estado=listo')}>
            Ver todos
          </Button>
        ) : undefined
      }
    >
      {ready.length === 0 ? (
        <EmptyState size="sm" tone="success" icon={<CheckCircle2 />} title="Todo entregado" description="Cuando un equipo quede listo aparecerá aquí." />
      ) : (
        <ul className={s.rows}>
          {ready.slice(0, 5).map((c) => {
            const days = daysWaiting(c, now);
            const saldo = saldoCents(c);
            return (
              <li key={c.id}>
                <a href={`#/clientes/${c.id}`} className={s.row}>
                  <span className={s.folio}>{formatFolio(c.folio)}</span>
                  <span className={s.rowMain}>
                    <span className={s.rowTitle}>{c.nombre || 'Sin nombre'}</span>
                    <span className={s.rowSub}>
                      {deviceLabel(c)} · {c.servicio || 'Servicio'}
                    </span>
                  </span>
                  <span className={s.rowEnd}>
                    {saldo > 0 ? <span className={cx(s.rowMoney, s.pendingText)}>{fmt.money(saldo)}</span> : <span className={s.paid}>Pagado</span>}
                    <Badge size="sm" tone={days >= 7 ? 'danger' : days >= 3 ? 'warning' : 'neutral'} icon={<Clock3 />}>
                      {days === 0 ? 'Hoy' : `${days} ${days === 1 ? 'día' : 'días'}`}
                    </Badge>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function ReceivableList({ receivable, total }: { receivable: Client[]; total: number }) {
  const fmt = useFormatters();
  return (
    <Card
      className={s.listCard}
      padding="none"
      title="Por cobrar"
      icon={<HandCoins />}
      description={receivable.length ? `${fmt.money(total)} en ${receivable.length} ${receivable.length === 1 ? 'servicio' : 'servicios'}` : 'Sin saldos pendientes'}
      actions={
        receivable.length > 0 ? (
          <Button variant="ghost" size="sm" iconRight={<ArrowRight />} onClick={() => navigate('#/clientes')}>
            Ver todos
          </Button>
        ) : undefined
      }
    >
      {receivable.length === 0 ? (
        <EmptyState size="sm" tone="income" icon={<Wallet />} title="Todo cobrado" description="Los servicios con saldo pendiente aparecerán aquí." />
      ) : (
        <ul className={s.rows}>
          {receivable.slice(0, 5).map((c) => {
            const saldo = saldoCents(c);
            const pct = c.cobroCents > 0 ? c.pagadoCents / c.cobroCents : 0;
            return (
              <li key={c.id}>
                <a href={`#/clientes/${c.id}`} className={s.row}>
                  <span className={s.folio}>{formatFolio(c.folio)}</span>
                  <span className={s.rowMain}>
                    <span className={s.rowTitle}>{c.nombre || 'Sin nombre'}</span>
                    <span className={s.rowSub}>
                      {deviceLabel(c)} · <DateTimeText value={c.fecha} />
                    </span>
                  </span>
                  <span className={s.rowEnd}>
                    <span className={cx(s.rowMoney, s.pendingText)}>{fmt.money(saldo)}</span>
                    <span className={s.rowMeta}>
                      <StatusBadge status={c.estado} size="sm" short />
                      <span className={s.paidPct}>{pct > 0 ? `abonó ${formatPercent(pct)}` : 'sin abono'}</span>
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------- Inventario ------------------------------ */

export function InventoryAlert({ items, stats }: { items: InventoryItem[]; stats: WorkshopData['inventoryStats'] }) {
  if (!stats) return <Skeleton height={168} radius={14} />;
  if (items.length === 0) {
    return (
      <Card className={s.invOk} title="Inventario en orden" icon={<PackageCheck />} description={`${formatNumber(stats.articulos)} artículos · ${formatNumber(stats.unidades)} unidades`}>
        <p className={s.muted}>Ningún repuesto está por debajo de su mínimo{stats.pedidos ? ` · ${stats.pedidos} pedido(s) en camino` : ''}.</p>
      </Card>
    );
  }
  return (
    <Card
      className={s.invAlert}
      title="Repuestos por pedir"
      icon={<PackageX />}
      description={`${stats.porPedir} por pedir${stats.agotados ? ` · ${stats.agotados} agotado${stats.agotados === 1 ? '' : 's'}` : ''}${stats.pedidos ? ` · ${stats.pedidos} en camino` : ''}`}
      footer={
        <Button variant="secondary" size="sm" fullWidth iconRight={<ArrowRight />} onClick={() => navigate('#/inventario?filtro=pedir')}>
          Ver lista por pedir
        </Button>
      }
    >
      <ul className={s.invList}>
        {items.slice(0, 4).map((it) => (
          <li key={it.id}>
            <a href={`#/inventario/${it.id}`} className={s.invItem}>
              <span className={s.invName}>{it.nombre}</span>
              <Badge size="sm" tone={it.stock <= 0 ? 'danger' : 'warning'}>
                {it.stock <= 0 ? 'Agotado' : `${it.stock} / mín ${it.stockMinimo}`}
              </Badge>
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------- Actividad ------------------------------- */

const ACTION_ICON: Record<AuditAction, React.ReactNode> = {
  crear: <Plus />,
  editar: <Pencil />,
  eliminar: <Trash2 />,
  restaurar: <RotateCcw />,
  purgar: <Trash2 />,
  movimiento: <ArrowLeftRight />,
  importar: <Upload />,
  exportar: <Download />,
  ajustes: <Settings2 />,
  sistema: <Info />,
};

const ACTION_TONE: Partial<Record<AuditAction, string>> = {
  crear: 'income',
  editar: 'info',
  eliminar: 'expense',
  purgar: 'expense',
  restaurar: 'profit',
  movimiento: 'pending',
};

const ENTITY_ICON: Record<AuditEntry['entity'], React.ReactNode> = {
  cliente: <ClipboardList />,
  gasto: <Receipt />,
  inventario: <PackageCheck />,
  ajustes: <Settings2 />,
  sistema: <Info />,
};

export function RecentActivity() {
  const audit = useAudit({ limit: 6 });
  return (
    <Card
      className={s.listCard}
      padding="none"
      title="Actividad reciente"
      icon={<Clock3 />}
      actions={
        <Button variant="ghost" size="sm" iconRight={<ArrowRight />} onClick={() => navigate('#/actividad')}>
          Ver registro
        </Button>
      }
    >
      {!audit ? (
        <div className={s.rowsSkeleton}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={40} radius={8} />
          ))}
        </div>
      ) : audit.length === 0 ? (
        <EmptyState size="sm" tone="neutral" icon={<Clock3 />} title="Sin actividad todavía" description="Cada alta, edición o movimiento quedará registrado con fecha y hora." />
      ) : (
        <ul className={s.timeline}>
          {audit.map((e) => (
            <li key={e.id}>
              <a href={e.entityId && e.entity !== 'ajustes' && e.entity !== 'sistema' ? `#/actividad?entidad=${e.entity}&id=${e.entityId}` : '#/actividad'} className={s.event}>
                <span className={cx(s.eventIcon, ACTION_TONE[e.action] && s[`t-${ACTION_TONE[e.action]}`])} aria-hidden>
                  {ACTION_ICON[e.action]}
                </span>
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>{e.title}</span>
                  <span className={s.rowSub}>
                    <span className={s.eventEntity} aria-hidden>
                      {ENTITY_ICON[e.entity]}
                    </span>
                    {e.summary}
                  </span>
                </span>
                <span className={s.eventTime}>
                  <DateTimeText value={e.ts} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

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
} from 'lucide-react';
import { BarChart, Sparkline, type ChartSeries } from '@/charts';
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
import { Badge, Button, Card, DateTimeText, EmptyState, KpiCard, Skeleton, StatusBadge, cx } from '@/ui';
import { navigate } from '@/app/router';
import { DeltaPill, compareLabel } from './Hero';
import { daysWaiting, ratio, type PeriodData, type WorkshopData } from './usePanelData';
import s from './Panel.module.css';

/* --------------------------------- KPIs ---------------------------------- */

export function PeriodKpis({ data, kind }: { data: PeriodData; kind: PeriodKind }) {
  const fmt = useFormatters();
  const { summary: cur, previousSummary: prev, series, todayIndex, previousToDate } = data;
  const loading = !cur || !prev;
  const label = compareLabel(kind, previousToDate);
  const upto = useMemo(() => (series ? (todayIndex >= 0 ? series.slice(0, todayIndex + 1) : series) : []), [series, todayIndex]);
  const labels = upto.map((p) => p.label);
  const money = (n: number) => fmt.money(n);
  const spark = (key: keyof SeriesPoint, tone: 'income' | 'expense' | 'profit') =>
    upto.length >= 2 ? (
      <Sparkline data={upto.map((p) => p[key] as number)} tone={tone} height={44} interactive labels={labels} formatValue={money} ariaLabel={`Tendencia diaria`} />
    ) : undefined;

  return (
    <div className={s.kpiGrid}>
      <KpiCard
        label="Cobrado"
        tone="income"
        icon={<TrendingUp />}
        value={cur?.cobradoCents ?? 0}
        format={money}
        delta={cur && prev ? ratio(cur.cobradoCents, prev.cobradoCents) : undefined}
        deltaLabel={label}
        sparkline={spark('cobradoCents', 'income')}
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
        delta={cur && prev ? ratio(cur.gastadoCents, prev.gastadoCents) : undefined}
        deltaLabel={label}
        sparkline={spark('gastadoCents', 'expense')}
        loading={loading}
        href="#/gastos"
      />
      <KpiCard
        label="Ganancia"
        tone="profit"
        icon={<PiggyBank />}
        value={cur?.gananciaCents ?? 0}
        format={money}
        delta={cur && prev ? ratio(cur.gananciaCents, prev.gananciaCents) : undefined}
        deltaLabel={label}
        sparkline={spark('gananciaCents', 'profit')}
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
        delta={cur && prev ? ratio(cur.porCobrarCents, prev.porCobrarCents) : undefined}
        deltaLabel={label}
        footer={cur ? <span>De {fmt.money(cur.facturadoCents)} facturado en el periodo</span> : undefined}
        loading={loading}
        href="#/clientes"
      />
    </div>
  );
}

export function SecondaryMetrics({ data }: { data: PeriodData }) {
  const fmt = useFormatters();
  const { summary: cur, previousSummary: prev } = data;
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
              <span className={cx(s.deltaPill, it.delta > 0.0005 ? s.good : it.delta < -0.0005 ? s.bad : s.flat)}>
                {it.delta > 0 ? '+' : it.delta < 0 ? '−' : ''}
                {formatNumber(Math.abs(it.delta * 100), 1)} pts
              </span>
            ) : (
              !it.points && <DeltaPill value={it.delta} />
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
  const { series, period, summary } = data;
  return (
    <Card
      className={s.chartCard}
      title="Cobrado vs. gastado por día"
      description={`${period.label} · la línea muestra la ganancia diaria`}
      actions={
        <Button variant="ghost" size="sm" iconRight={<ArrowRight />} onClick={() => navigate(`#/reportes?periodo=${kind}`)}>
          Reportes
        </Button>
      }
    >
      {series ? (
        <>
          {summary && (
            <div className={s.chartTotals}>
              <ChartTotal color="var(--income)" label="Cobrado" value={fmt.money(summary.cobradoCents)} />
              <ChartTotal color="var(--expense)" label="Gastado" value={fmt.money(summary.gastadoCents)} />
              <ChartTotal color="var(--profit)" label="Ganancia" value={fmt.money(summary.gananciaCents)} line />
            </div>
          )}
          <BarChart
            data={series}
            series={BARS}
            lineSeries={PROFIT_LINE}
            height={268}
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
            emptyMessage={kind === 'week' ? 'Aún no hay cobros ni gastos esta semana' : 'Aún no hay cobros ni gastos este mes'}
            ariaLabel={`Cobrado, gastado y ganancia por día · ${period.label}`}
          />
        </>
      ) : (
        <Skeleton height={300} radius={10} />
      )}
    </Card>
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
              <span className={s.pipeLabel}>{REPAIR_STATUS_LABEL[k]}</span>
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

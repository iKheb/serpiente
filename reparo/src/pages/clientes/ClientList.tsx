import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowDownUp, Check, SlidersHorizontal, Camera, CircleDollarSign, Download, Grid3x3, KeyRound, PackageCheck, Plus, TriangleAlert, Search, Smartphone, UserPlus, Users, Wrench } from 'lucide-react';
import { navigate, setQuery, useRoute } from '@/app/router';
import {
  REPAIR_STATUS_LABEL,
  deviceFullName,
  downloadBlob,
  exportCSV,
  formatFolio,
  formatMoney,
  paymentStatus,
  saldoCents,
  useClients,
  type Client,
} from '@/data';
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  DateTimeText,
  EmptyState,
  FilterChips,
  Highlight,
  IconButton,
  KpiCard,
  MoneyText,
  PageHeader,
  SearchField,
  SegmentedControl,
  Select,
  Sheet,
  StatusBadge,
  Toolbar,
  cx,
  toast,
  useMediaQuery,
  usePrefersReducedMotion,
  type Column,
  type FilterChipOption,
} from '@/ui';
import { deliveredDebtCents, SORTERS, SORT_OPTIONS, TALLER, matchesPay, matchesSearch, matchesStatus, parseStatusFilter, type PayFilter, type SortKey, type StatusFilter } from './lib';
import styles from './ClientesPage.module.css';

const PAGE = 40;

const PAY_OPTIONS: { value: PayFilter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'pagados', label: 'Pagados' },
  { value: 'saldo', label: 'Con saldo' },
];

function UnlockIcon({ c }: { c: Client }) {
  if (c.desbloqueoTipo === 'patron' && c.desbloqueoPatron.length)
    return (
      <span className={styles.devIcon} title="Tiene patrón de desbloqueo">
        <Grid3x3 aria-hidden />
        <span className="sr-only">Con patrón</span>
      </span>
    );
  if ((c.desbloqueoTipo === 'pin' || c.desbloqueoTipo === 'contrasena') && c.desbloqueoCodigo)
    return (
      <span className={styles.devIcon} title={c.desbloqueoTipo === 'pin' ? 'Tiene PIN' : 'Tiene contraseña'}>
        <KeyRound aria-hidden />
        <span className="sr-only">{c.desbloqueoTipo === 'pin' ? 'Con PIN' : 'Con contraseña'}</span>
      </span>
    );
  return null;
}

function PhotoIcon({ c }: { c: Client }) {
  if (!c.numFotos) return null;
  return (
    <span className={styles.devIcon} title={`${c.numFotos} fotos de evidencia`}>
      <Camera aria-hidden />
      <span className={styles.devIconNum}>{c.numFotos}</span>
      <span className="sr-only">fotos</span>
    </span>
  );
}

/** Alerta: equipo entregado sin liquidar. `full` incluye el monto (tarjeta móvil). */
function DebtBadge({ c, full }: { c: Client; full?: boolean }) {
  const debt = deliveredDebtCents(c);
  return (
    <Badge size="sm" tone="pending" icon={<TriangleAlert />} title={`Entregado con saldo ${formatMoney(debt)}`} className={styles.debtBadge}>
      {full ? `Entregado con saldo ${formatMoney(debt)}` : 'Entregado con saldo'}
    </Badge>
  );
}

function PayBadge({ c }: { c: Client }) {
  if (deliveredDebtCents(c) > 0) return <DebtBadge c={c} />;
  const s = paymentStatus(c);
  if (s === 'pagado')
    return (
      <Badge size="sm" tone="success" dot>
        Pagado
      </Badge>
    );
  return (
    <Badge size="sm" tone={s === 'parcial' ? 'pending' : 'danger'} dot>
      {s === 'parcial' ? 'Abono' : 'Pendiente'}
    </Badge>
  );
}

export function ClientList() {
  const route = useRoute();
  const clients = useClients();
  const reduced = usePrefersReducedMotion();
  const status = parseStatusFilter(route.query.get('estado'));
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [pay, setPay] = useState<PayFilter>('todos');
  const [sort, setSort] = useState<SortKey>('recientes');
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement | null>(null);
  // Teléfono: un buscador + chips de estado + un botón "Filtros" (pago y orden) en lugar de tres filas.
  const compact = useMediaQuery('(max-width: 640px)');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const setStatus = (v: StatusFilter) => setQuery({ estado: v === 'todos' ? null : v });

  const stats = useMemo(() => {
    if (!clients) return null;
    let taller = 0;
    let listos = 0;
    let porCobrar = 0;
    let conSaldo = 0;
    const counts = { todos: clients.length, taller: 0, listo: 0, entregado: 0, cancelado: 0 } as Record<string, number>;
    const byStatus: Record<string, number> = {};
    for (const c of clients) {
      byStatus[c.estado] = (byStatus[c.estado] ?? 0) + 1;
      if (TALLER.includes(c.estado)) taller++;
      if (c.estado === 'listo') listos++;
      if (c.estado !== 'cancelado') {
        const s = saldoCents(c);
        if (s > 0) {
          porCobrar += s;
          conSaldo++;
        }
      }
    }
    counts.taller = taller;
    counts.listo = listos;
    counts.entregado = byStatus.entregado ?? 0;
    counts.cancelado = byStatus.cancelado ?? 0;
    return { taller, listos, porCobrar, conSaldo, counts, byStatus };
  }, [clients]);

  const filtered = useMemo(() => {
    if (!clients) return undefined;
    const out = clients.filter((c) => matchesStatus(c, status) && matchesPay(c, pay) && matchesSearch(c, dq));
    return out.sort(SORTERS[sort]);
  }, [clients, status, pay, dq, sort]);

  // Reinicia la paginación al cambiar filtros.
  useEffect(() => setLimit(PAGE), [status, pay, dq, sort]);

  const total = filtered?.length ?? 0;
  const rows = useMemo(() => filtered?.slice(0, limit), [filtered, limit]);
  const hasMore = total > limit;

  // Carga incremental al acercarse al final.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE);
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, rows]);

  const statusOptions: FilterChipOption<StatusFilter>[] = [
    { value: 'todos', label: 'Todos', count: stats?.counts.todos },
    { value: 'taller', label: 'En taller', count: stats?.counts.taller, dotColor: 'var(--status-reparando)' },
    { value: 'listo', label: 'Listos', count: stats?.counts.listo, dotColor: 'var(--status-listo)' },
    { value: 'entregado', label: 'Entregados', count: stats?.counts.entregado, dotColor: 'var(--status-entregado)' },
    { value: 'cancelado', label: 'Cancelados', count: stats?.counts.cancelado, dotColor: 'var(--status-cancelado)' },
  ];
  if (status === 'recibido' || status === 'diagnostico' || status === 'reparando') {
    statusOptions.splice(2, 0, { value: status, label: REPAIR_STATUS_LABEL[status], count: stats?.byStatus[status] ?? 0, dotColor: `var(--status-${status})` });
  }

  const filtersActive = status !== 'todos' || pay !== 'todos' || !!q.trim();
  const clearFilters = () => {
    setQ('');
    setPay('todos');
    setStatus('todos');
  };

  const open = (c: Client) => navigate(`#/clientes/${c.id}`);

  const exportar = async () => {
    try {
      const blob = await exportCSV('clientes');
      downloadBlob(blob, `clientes-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success('Exportación lista', { description: 'Se descargó el archivo CSV de clientes.' });
    } catch {
      toast.error('No se pudo exportar');
    }
  };

  const columns: Column<Client>[] = [
    {
      key: 'folio',
      header: 'Folio',
      width: 84,
      cell: (c) => (
        <span className={styles.folio}>
          <Highlight text={formatFolio(c.folio)} query={dq} />
        </span>
      ),
    },
    {
      key: 'cliente',
      header: 'Cliente',
      cell: (c) => (
        <div className={styles.person}>
          <Avatar name={c.nombre || '?'} size="sm" />
          <div className={styles.personText}>
            <span className={styles.name}>
              <Highlight text={c.nombre || 'Sin nombre'} query={dq} />
            </span>
            <span className={styles.sub}>{c.telefono ? <Highlight text={c.telefono} query={dq} /> : 'Sin teléfono'}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'equipo',
      header: 'Equipo',
      cell: (c) => (
        <div className={styles.device}>
          <span className={styles.deviceName}>
            <Highlight text={deviceFullName(c) || 'Sin equipo'} query={dq} />
          </span>
          <UnlockIcon c={c} />
          <PhotoIcon c={c} />
        </div>
      ),
    },
    {
      key: 'servicio',
      header: 'Servicio',
      hideBelow: 'lg',
      cell: (c) => <span className={styles.service}>{c.servicio || '—'}</span>,
    },
    { key: 'estado', header: 'Estado', width: 116, cell: (c) => <StatusBadge status={c.estado} size="sm" short /> },
    {
      key: 'pago',
      header: 'Pago',
      width: 150,
      hideBelow: 'xl',
      cell: (c) => {
        const s = saldoCents(c);
        return (
          <div className={styles.pay}>
            <PayBadge c={c} />
            {s > 0 && (s < c.cobroCents || deliveredDebtCents(c) > 0) && c.estado !== 'cancelado' && <span className={styles.saldo}>Saldo {formatMoney(s)}</span>}
          </div>
        );
      },
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      width: 116,
      cell: (c) => <MoneyText cents={c.cobroCents} tone={c.estado === 'cancelado' ? 'muted' : 'neutral'} strike={c.estado === 'cancelado'} />,
    },
    {
      key: 'fecha',
      header: 'Fecha y hora',
      align: 'right',
      width: 112,
      // Fecha y hora en dos líneas (como nombre/teléfono): la tabla cabe en tableta sin recortar la columna.
      cell: (c) => (
        <span className={styles.dateStack}>
          <DateTimeText value={c.fecha} variant="date" className={styles.date} />
          <DateTimeText value={c.fecha} variant="time" muted className={styles.dateTime} />
        </span>
      ),
    },
  ];

  const renderMobile = (c: Client) => {
    const s = saldoCents(c);
    return (
      <div className={styles.card}>
        <div className={styles.cardTop}>
          <Avatar name={c.nombre || '?'} size="md" />
          <div className={styles.cardHead}>
            <div className={styles.cardTitleRow}>
              <span className={styles.name}>
                <Highlight text={c.nombre || 'Sin nombre'} query={dq} />
              </span>
              <span className={styles.folio}>{formatFolio(c.folio)}</span>
            </div>
            <div className={styles.device}>
              <Smartphone className={styles.inlineIcon} aria-hidden />
              <span className={styles.deviceName}>
                <Highlight text={deviceFullName(c) || 'Sin equipo'} query={dq} />
              </span>
              <UnlockIcon c={c} />
              <PhotoIcon c={c} />
            </div>
            {c.servicio && <span className={styles.sub}>{c.servicio}</span>}
          </div>
        </div>
        <div className={styles.cardBottom}>
          <div className={styles.cardBadges}>
            {deliveredDebtCents(c) > 0 ? (
              <DebtBadge c={c} full />
            ) : (
              <>
                <StatusBadge status={c.estado} size="sm" short />
                <PayBadge c={c} />
              </>
            )}
          </div>
          <div className={styles.cardMoney}>
            <MoneyText cents={c.cobroCents} weight="semibold" strike={c.estado === 'cancelado'} tone={c.estado === 'cancelado' ? 'muted' : 'neutral'} />
            {/* Sólo con abono parcial: si no ha pagado nada, el saldo es el mismo total (lo dice la insignia). */}
            {s > 0 && s < c.cobroCents && c.estado !== 'cancelado' && deliveredDebtCents(c) === 0 && <span className={styles.saldo}>Saldo {formatMoney(s)}</span>}
          </div>
        </div>
        <DateTimeText value={c.fecha} variant="relative-datetime" muted className={styles.cardDate} />
      </div>
    );
  };

  const empty =
    clients && clients.length === 0 ? (
      <EmptyState
        icon={<Users />}
        accent={<Plus />}
        title="Aún no hay clientes"
        description="Registra el primer equipo que llega al taller: datos del cliente, falla, patrón de desbloqueo, fotos y cobro."
        action={
          <Button variant="primary" iconLeft={<UserPlus />} onClick={() => setQuery({ nuevo: '1' })}>
            Registrar primer cliente
          </Button>
        }
        size="lg"
      />
    ) : (
      <EmptyState
        icon={<Search />}
        tone="neutral"
        title="Sin resultados"
        description={q.trim() ? `No hay clientes que coincidan con «${q.trim()}» con estos filtros.` : 'No hay clientes con estos filtros.'}
        action={<Button onClick={clearFilters}>Limpiar filtros</Button>}
      />
    );

  return (
    <div className={styles.page}>
      <PageHeader
        title="Clientes"
        subtitle={clients ? `${clients.length.toLocaleString('es-MX')} ${clients.length === 1 ? 'cliente' : 'clientes'} · equipos, reparaciones y cobros` : 'Equipos, reparaciones y cobros'}
        actions={
          <>
            <Button variant="ghost" iconLeft={<Download />} onClick={exportar} className={styles.hideMobile}>
              Exportar
            </Button>
            <Button variant="primary" iconLeft={<Plus />} onClick={() => setQuery({ nuevo: '1' })}>
              Nuevo cliente
            </Button>
          </>
        }
      />

      {compact ? (
        <motion.div
          className={styles.statStrip}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <button type="button" className={cx(styles.stat, status === 'taller' && styles.statOn)} aria-pressed={status === 'taller'} onClick={() => setStatus(status === 'taller' ? 'todos' : 'taller')}>
            <span className={styles.statLabel}>
              <Wrench aria-hidden /> En taller
            </span>
            <span className={styles.statValue}>{stats ? stats.taller : '—'}</span>
          </button>
          <button type="button" className={cx(styles.stat, styles.statListo, status === 'listo' && styles.statOn)} aria-pressed={status === 'listo'} onClick={() => setStatus(status === 'listo' ? 'todos' : 'listo')}>
            <span className={styles.statLabel}>
              <PackageCheck aria-hidden /> Listos
            </span>
            <span className={styles.statValue}>{stats ? stats.listos : '—'}</span>
          </button>
          <button type="button" className={cx(styles.stat, styles.statPend, pay === 'saldo' && styles.statOn)} aria-pressed={pay === 'saldo'} onClick={() => setPay(pay === 'saldo' ? 'todos' : 'saldo')}>
            <span className={styles.statLabel}>
              <CircleDollarSign aria-hidden /> Por cobrar
            </span>
            <span className={styles.statValue}>{stats ? formatMoney(stats.porCobrar, { decimals: false }) : '—'}</span>
          </button>
        </motion.div>
      ) : (
      <motion.div
        className={styles.kpis}
        initial={reduced ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <KpiCard
          label="En taller"
          icon={<Wrench />}
          tone="brand"
          value={stats?.taller ?? 0}
          loading={!stats}
          format={(n) => String(Math.round(n))}
          footer={<span>Recibidos, en diagnóstico o reparación</span>}
          onClick={() => setStatus(status === 'taller' ? 'todos' : 'taller')}
        />
        <KpiCard
          label="Listos para entregar"
          icon={<PackageCheck />}
          tone="income"
          value={stats?.listos ?? 0}
          loading={!stats}
          format={(n) => String(Math.round(n))}
          footer={<span>Avisa al cliente que pase por su equipo</span>}
          onClick={() => setStatus(status === 'listo' ? 'todos' : 'listo')}
        />
        <KpiCard
          label="Por cobrar"
          icon={<CircleDollarSign />}
          tone="pending"
          value={stats?.porCobrar ?? 0}
          loading={!stats}
          format={(n) => formatMoney(Math.round(n))}
          footer={<span>{stats ? `${stats.conSaldo} ${stats.conSaldo === 1 ? 'servicio' : 'servicios'} con saldo` : ''}</span>}
          onClick={() => setPay(pay === 'saldo' ? 'todos' : 'saldo')}
        />
      </motion.div>
      )}

      <div className={styles.filters}>
        {compact ? (
          <div className={styles.compactBar}>
            <SearchField value={q} onChange={setQ} placeholder="Buscar cliente, folio o IMEI…" containerClassName={styles.search} />
            <IconButton
              icon={<SlidersHorizontal />}
              label="Filtros y orden"
              variant="secondary"
              tooltip={false}
              badge={(pay !== 'todos' ? 1 : 0) + (sort !== 'recientes' ? 1 : 0)}
              className={styles.filterBtn}
              onClick={() => setFiltersOpen(true)}
            />
          </div>
        ) : (
          <Toolbar aria-label="Filtros de clientes" className={styles.toolbar}>
            <SearchField value={q} onChange={setQ} placeholder="Buscar cliente, folio, equipo o IMEI…" containerClassName={styles.search} />
            <SegmentedControl<PayFilter>
              size="sm"
              className={styles.paySeg}
              aria-label="Filtrar por pago"
              value={pay}
              onChange={setPay}
              options={PAY_OPTIONS}
            />
            <Select<SortKey> size="sm" aria-label="Ordenar" value={sort} onChange={setSort} options={SORT_OPTIONS} icon={<ArrowDownUp />} width={170} containerClassName={styles.sortSel} />
          </Toolbar>
        )}
        <FilterChips<StatusFilter> aria-label="Filtrar por estado" value={status} onChange={setStatus} options={statusOptions} className={styles.statusChips} />
      </div>

      {compact && (
        <Sheet
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          title="Filtros y orden"
          icon={<SlidersHorizontal />}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setPay('todos');
                  setSort('recientes');
                }}
              >
                Restablecer
              </Button>
              <Button variant="primary" onClick={() => setFiltersOpen(false)}>
                Ver {total} {total === 1 ? 'resultado' : 'resultados'}
              </Button>
            </>
          }
        >
          <div className={styles.sheetGroup}>
            <span className={styles.sheetLabel}>Pago</span>
            <SegmentedControl<PayFilter> aria-label="Filtrar por pago" value={pay} onChange={setPay} options={PAY_OPTIONS} className={styles.sheetSeg} />
          </div>
          <div className={styles.sheetGroup}>
            <span className={styles.sheetLabel}>Ordenar por</span>
            <div role="radiogroup" aria-label="Ordenar por" className={styles.sortList}>
              {SORT_OPTIONS.map((o) => (
                <button key={o.value} type="button" role="radio" aria-checked={sort === o.value} className={cx(styles.sortItem, sort === o.value && styles.sortOn)} onClick={() => setSort(o.value)}>
                  {o.label}
                  {sort === o.value && <Check aria-hidden />}
                </button>
              ))}
            </div>
          </div>
        </Sheet>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(c) => c.id}
        onRowClick={open}
        renderMobileRow={renderMobile}
        rowAccent={(c) => (c.estado === 'listo' ? 'var(--status-listo)' : undefined)}
        caption="Lista de clientes"
        empty={empty}
        skeletonRows={8}
        footer={
          total > 0 ? (
            <div className={styles.footer}>
              <span>
                Mostrando <strong>{Math.min(limit, total)}</strong> de <strong>{total}</strong>
                {filtersActive && clients ? ` · ${clients.length} en total` : ''}
              </span>
              {hasMore && (
                <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + PAGE * 2)}>
                  Cargar más
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
      <div ref={sentinel} aria-hidden className={styles.sentinel} />
    </div>
  );
}

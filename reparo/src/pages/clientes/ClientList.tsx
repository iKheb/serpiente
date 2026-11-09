import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowDownUp, Camera, CircleDollarSign, Download, Grid3x3, KeyRound, PackageCheck, Plus, Search, Smartphone, UserPlus, Users, Wrench } from 'lucide-react';
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
  KpiCard,
  MoneyText,
  PageHeader,
  SearchField,
  SegmentedControl,
  Select,
  StatusBadge,
  Toolbar,
  toast,
  usePrefersReducedMotion,
  type Column,
  type FilterChipOption,
} from '@/ui';
import { SORTERS, SORT_OPTIONS, TALLER, matchesPay, matchesSearch, matchesStatus, parseStatusFilter, type PayFilter, type SortKey, type StatusFilter } from './lib';
import styles from './ClientesPage.module.css';

const PAGE = 40;

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

function PayBadge({ c }: { c: Client }) {
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
      width: 92,
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
    { key: 'estado', header: 'Estado', width: 150, cell: (c) => <StatusBadge status={c.estado} size="sm" short /> },
    {
      key: 'pago',
      header: 'Pago',
      width: 130,
      hideBelow: 'xl',
      cell: (c) => {
        const s = saldoCents(c);
        return (
          <div className={styles.pay}>
            <PayBadge c={c} />
            {s > 0 && c.estado !== 'cancelado' && <span className={styles.saldo}>Saldo {formatMoney(s)}</span>}
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
      width: 168,
      cell: (c) => <DateTimeText value={c.fecha} muted className={styles.date} />,
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
            <StatusBadge status={c.estado} size="sm" short />
            <PayBadge c={c} />
          </div>
          <div className={styles.cardMoney}>
            <MoneyText cents={c.cobroCents} weight="semibold" strike={c.estado === 'cancelado'} tone={c.estado === 'cancelado' ? 'muted' : 'neutral'} />
            {s > 0 && c.estado !== 'cancelado' && <span className={styles.saldo}>Saldo {formatMoney(s)}</span>}
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
        subtitle={clients ? `${clients.length} ${clients.length === 1 ? 'servicio registrado' : 'servicios registrados'} · equipos, reparaciones y cobros` : 'Equipos, reparaciones y cobros'}
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

      <div className={styles.filters}>
        <Toolbar aria-label="Filtros de clientes" className={styles.toolbar}>
          <SearchField value={q} onChange={setQ} placeholder="Buscar nombre, teléfono, folio, equipo o IMEI…" containerClassName={styles.search} />
          <SegmentedControl<PayFilter>
            size="sm"
            aria-label="Filtrar por pago"
            value={pay}
            onChange={setPay}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'pagados', label: 'Pagados' },
              { value: 'saldo', label: 'Con saldo' },
            ]}
          />
          <Select<SortKey> size="sm" aria-label="Ordenar" value={sort} onChange={setSort} options={SORT_OPTIONS} icon={<ArrowDownUp />} width={170} />
        </Toolbar>
        <FilterChips<StatusFilter> aria-label="Filtrar por estado" value={status} onChange={setStatus} options={statusOptions} />
      </div>

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

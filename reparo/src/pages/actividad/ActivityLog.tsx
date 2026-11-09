import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { History, ListFilter, SearchX, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { setQuery } from '@/app/router';
import {
  AUDIT_ACTION_LABEL,
  ENTITY_LABEL,
  db,
  dayKey,
  formatDayHeading,
  type AuditAction,
  type AuditEntry,
  type EntityType,
} from '@/data';
import {
  Badge,
  Button,
  EmptyState,
  FilterChips,
  SearchField,
  SegmentedControl,
  Skeleton,
  toast,
  useNow,
  usePrefersReducedMotion,
} from '@/ui';
import { EventRow, ENTITY_ICON, type RecordState } from './EventRow';
import {
  ACTION_GROUPS,
  AUDIT_ACTIONS,
  ENTITY_FILTERS,
  ENTITY_PLURAL,
  GROUP_LABEL,
  GROUP_OF,
  RANGE_LABEL,
  entryMatches,
  isTrashEntity,
  matchTokens,
  plural,
  rangeStart,
  restoreEntity,
  type ActionGroup,
  type RangeKey,
} from './lib';
import styles from './Actividad.module.css';

const PAGE = 100;

type GroupFilter = 'todas' | ActionGroup;
type EntFilter = 'todas' | EntityType;

/** Ids existentes (no purgados) de clientes, gastos e inventario. */
function useExistingIds(): Set<string> | undefined {
  return useLiveQuery(async () => {
    const [a, b, c] = await Promise.all([
      db.clients.toCollection().primaryKeys(),
      db.expenses.toCollection().primaryKeys(),
      db.inventory.toCollection().primaryKeys(),
    ]);
    return new Set<string>([...a, ...b, ...c].map(String));
  }, []);
}

export interface ActivityLogProps {
  entries: AuditEntry[] | undefined;
  trashIds: Set<string>;
  query: URLSearchParams;
}

export function ActivityLog({ entries, trashIds, query }: ActivityLogProps) {
  const reduced = usePrefersReducedMotion();
  const existing = useExistingIds();
  const now = useNow(60_000);

  // ---- Filtros (entidad / acción / id viven en la URL) ----
  const qEnt = query.get('entidad');
  const entity: EntFilter = qEnt && (ENTITY_FILTERS as string[]).includes(qEnt) ? (qEnt as EntityType) : 'todas';
  const qAcc = query.get('accion');
  const exactAction: AuditAction | null = qAcc && (AUDIT_ACTIONS as string[]).includes(qAcc) ? (qAcc as AuditAction) : null;
  const group: GroupFilter = exactAction
    ? GROUP_OF[exactAction]
    : qAcc && (ACTION_GROUPS as string[]).includes(qAcc)
      ? (qAcc as ActionGroup)
      : 'todas';
  const scopeId = query.get('id');

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [range, setRange] = useState<RangeKey>('todo');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Set<string>>(() => new Set());

  const tokens = useMemo(() => matchTokens(deferredSearch), [deferredSearch]);
  const start = rangeStart(range, now);

  // Reinicia la paginación al cambiar filtros.
  useEffect(() => setLimit(PAGE), [entity, group, exactAction, scopeId, deferredSearch, range]);

  // ---- Filtrado + contadores por faceta ----
  const result = useMemo(() => {
    const entCounts: Record<string, number> = { todas: 0 };
    const grpCounts: Record<string, number> = { todas: 0 };
    const rngCounts: Record<RangeKey, number> = { hoy: 0, '7d': 0, '30d': 0, todo: 0 };
    const list: AuditEntry[] = [];
    if (!entries) return { list, entCounts, grpCounts, rngCounts };
    const s = { hoy: rangeStart('hoy', now), '7d': rangeStart('7d', now), '30d': rangeStart('30d', now) };
    for (const e of entries) {
      if (scopeId && e.entityId !== scopeId) continue;
      if (!entryMatches(e, tokens)) continue;
      const okEnt = entity === 'todas' || e.entity === entity;
      const okAct = exactAction ? e.action === exactAction : group === 'todas' || GROUP_OF[e.action] === group;
      const okRange = e.ts >= start;
      if (okAct && okRange) {
        entCounts.todas++;
        entCounts[e.entity] = (entCounts[e.entity] ?? 0) + 1;
      }
      if (okEnt && okRange) {
        grpCounts.todas++;
        const g = GROUP_OF[e.action];
        grpCounts[g] = (grpCounts[g] ?? 0) + 1;
      }
      if (okEnt && okAct) {
        rngCounts.todo++;
        if (e.ts >= s['30d']) rngCounts['30d']++;
        if (e.ts >= s['7d']) rngCounts['7d']++;
        if (e.ts >= s.hoy) rngCounts.hoy++;
      }
      if (okEnt && okAct && okRange) list.push(e);
    }
    return { list, entCounts, grpCounts, rngCounts };
  }, [entries, scopeId, tokens, entity, group, exactAction, start, now]);

  const { list, entCounts, grpCounts, rngCounts } = result;
  const visible = list.slice(0, limit);

  const days = useMemo(() => {
    const out: { key: string; ts: number; items: AuditEntry[]; total: number }[] = [];
    const totals = new Map<string, number>();
    for (const e of list) {
      const k = dayKey(e.ts);
      totals.set(k, (totals.get(k) ?? 0) + 1);
    }
    for (const e of visible) {
      const k = dayKey(e.ts);
      const last = out[out.length - 1];
      if (last && last.key === k) last.items.push(e);
      else out.push({ key: k, ts: e.ts, items: [e], total: totals.get(k) ?? 0 });
    }
    return out;
  }, [list, visible]);

  const stateOf = useCallback(
    (e: AuditEntry): RecordState => {
      if (!isTrashEntity(e.entity) || !e.entityId) return 'na';
      if (trashIds.has(e.entityId)) return 'papelera';
      if (!existing) return 'activo';
      return existing.has(e.entityId) ? 'activo' : 'purgado';
    },
    [trashIds, existing],
  );

  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const onRestore = useCallback(async (e: AuditEntry) => {
    if (!e.entityId || !isTrashEntity(e.entity)) return;
    try {
      await restoreEntity(e.entity, e.entityId);
      toast.success(`${ENTITY_LABEL[e.entity]} restaurado`, { description: e.title });
    } catch (err) {
      toast.error('No se pudo restaurar', { description: err instanceof Error ? err.message : undefined });
    }
  }, []);

  const onHistory = useCallback((e: AuditEntry) => {
    setQuery({ id: e.entityId, entidad: e.entity, accion: null });
    setSearch('');
    setRange('todo');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const filtersActive = !!search || range !== 'todo' || entity !== 'todas' || group !== 'todas' || !!scopeId;
  const clearAll = () => {
    setSearch('');
    setRange('todo');
    setQuery({ entidad: null, accion: null, id: null });
  };

  const scopeTitle = scopeId ? entries?.find((e) => e.entityId === scopeId)?.title : null;
  const scopeEntity = scopeId ? entries?.find((e) => e.entityId === scopeId)?.entity : null;

  // ---- Opciones de filtros ----
  const entityOptions = [
    { value: 'todas' as EntFilter, label: 'Todo', count: entCounts.todas },
    ...ENTITY_FILTERS.filter((k) => k !== 'sistema' || (entCounts.sistema ?? 0) > 0 || entity === 'sistema').map((k) => ({
      value: k as EntFilter,
      label: ENTITY_PLURAL[k],
      icon: ENTITY_ICON[k],
      count: entCounts[k] ?? 0,
    })),
  ];
  const groupOptions = [
    { value: 'todas' as GroupFilter, label: 'Todas', count: grpCounts.todas },
    ...ACTION_GROUPS.map((g) => ({
      value: g as GroupFilter,
      label: GROUP_LABEL[g],
      count: grpCounts[g] ?? 0,
      dotColor: GROUP_DOT[g],
    })),
  ];
  const rangeOptions = (Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => ({
    value: k,
    label: (
      <>
        {RANGE_LABEL[k]}
        <span className={styles.segCount}>{rngCounts[k].toLocaleString('es-MX')}</span>
      </>
    ),
    ariaLabel: `${RANGE_LABEL[k]} (${rngCounts[k]})`,
  }));

  if (!entries) return <LogSkeleton />;

  if (entries.length === 0) {
    return (
      <EmptyState
        size="lg"
        icon={<History />}
        title="Aún no hay actividad"
        description="Cada vez que agregues, edites o elimines un cliente, gasto o artículo, quedará registrado aquí con fecha y hora exactas."
        action={
          <Button variant="primary" onClick={() => (location.hash = '#/clientes?nuevo=1')}>
            Registrar cliente
          </Button>
        }
      />
    );
  }

  return (
    <div className={styles.log}>
      <div className={styles.filters}>
        <div className={styles.filterRow}>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar en el registro…"
            label="Buscar por título, resumen o campo"
            containerClassName={styles.search}
          />
          <SegmentedControl value={range} onChange={setRange} options={rangeOptions} aria-label="Rango de fechas" className={styles.range} />
        </div>
        <FilterChips
          aria-label="Tipo de registro"
          size="sm"
          value={entity}
          onChange={(v) => setQuery({ entidad: v === 'todas' ? null : v })}
          options={entityOptions}
        />
        <FilterChips
          aria-label="Tipo de acción"
          size="sm"
          value={group}
          onChange={(v) => setQuery({ accion: v === 'todas' ? null : v })}
          options={groupOptions}
        />
      </div>

      {(scopeId || exactAction) && (
        <div className={styles.scope} role="status">
          <ListFilter aria-hidden />
          {scopeId && (
            <span className={styles.scopeText}>
              Historial de <strong>{scopeTitle ?? 'registro'}</strong>
              {scopeEntity && (
                <Badge size="sm" icon={ENTITY_ICON[scopeEntity]}>
                  {ENTITY_LABEL[scopeEntity]}
                </Badge>
              )}
            </span>
          )}
          {exactAction && (
            <span className={styles.scopeText}>
              Sólo: <strong>{AUDIT_ACTION_LABEL[exactAction]}</strong>
            </span>
          )}
          <Button size="sm" variant="ghost" iconLeft={<X />} onClick={() => setQuery({ id: null, accion: exactAction ? null : query.get('accion') })} className={styles.scopeClear}>
            Ver todo
          </Button>
        </div>
      )}

      <div className={styles.resultLine} aria-live="polite">
        <span>
          <strong>{plural(list.length, 'evento', 'eventos')}</strong>
          {list.length > visible.length && <> · mostrando {visible.length.toLocaleString('es-MX')}</>}
        </span>
        {filtersActive && (
          <button type="button" className={styles.clearLink} onClick={clearAll}>
            Limpiar filtros
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          tone="neutral"
          title="Sin resultados"
          description={search ? `Ningún evento coincide con “${search}” con los filtros actuales.` : 'Ningún evento coincide con los filtros seleccionados.'}
          action={
            <Button variant="secondary" onClick={clearAll}>
              Limpiar filtros
            </Button>
          }
        />
      ) : (
        <>
          {days.map((d) => (
            <section key={d.key} className={styles.day} aria-labelledby={`dia-${d.key}`}>
              <h2 id={`dia-${d.key}`} className={styles.dayHead}>
                <span className={styles.dayTitle}>{formatDayHeading(d.ts, now)}</span>
                <span className={styles.dayCount}>{plural(d.total, 'evento', 'eventos')}</span>
              </h2>
              <ol className={styles.timeline}>
                {d.items.map((e) => (
                  <EventRow
                    key={e.id}
                    entry={e}
                    expanded={open.has(e.id)}
                    onToggle={toggle}
                    state={stateOf(e)}
                    query={deferredSearch}
                    reduced={reduced}
                    onRestore={onRestore}
                    onHistory={onHistory}
                    scoped={!!scopeId}
                  />
                ))}
              </ol>
            </section>
          ))}
          {list.length > visible.length ? (
            <div className={styles.more}>
              <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
                Cargar {Math.min(PAGE, list.length - visible.length)} más
              </Button>
              <span className={styles.moreHint}>
                {visible.length.toLocaleString('es-MX')} de {list.length.toLocaleString('es-MX')}
              </span>
            </div>
          ) : (
            <p className={styles.end}>
              {list.length > 8 ? 'Llegaste al inicio del registro' : ' '}
            </p>
          )}
        </>
      )}
    </div>
  );
}

const GROUP_DOT: Record<ActionGroup, string> = {
  altas: 'var(--success)',
  ediciones: 'var(--info)',
  eliminaciones: 'var(--danger)',
  movimientos: 'var(--pending)',
  sistema: 'var(--text-3)',
};

function LogSkeleton() {
  return (
    <div className={styles.log} aria-busy="true" aria-label="Cargando actividad">
      <div className={styles.filters}>
        <div className={styles.filterRow}>
          <Skeleton height={36} width={320} radius={10} />
          <Skeleton height={36} width={280} radius={10} />
        </div>
        <Skeleton height={28} width={420} radius={999} />
        <Skeleton height={28} width={560} radius={999} />
      </div>
      {[0, 1].map((g) => (
        <div key={g} className={styles.day}>
          <div className={styles.dayHead}>
            <Skeleton height={14} width={220} />
          </div>
          <ol className={styles.timeline}>
            {Array.from({ length: g ? 3 : 5 }, (_, i) => (
              <li key={i} className={styles.event}>
                <span className={styles.node} style={{ background: 'var(--skeleton-base)' }} />
                <div className={styles.card}>
                  <div className={styles.head}>
                    <div className={styles.main}>
                      <Skeleton height={13} width={`${40 + ((i * 17) % 30)}%`} />
                      <Skeleton height={11} width={`${55 + ((i * 11) % 25)}%`} style={{ marginTop: 8 }} />
                    </div>
                    <Skeleton height={13} width={64} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Download, Plus, Receipt, SearchX } from 'lucide-react';
import { navigate, setQuery, useRoute } from '@/app/router';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  backupFilename,
  deleteExpense,
  downloadBlob,
  emptyExpenseInput,
  exportCSV,
  formatMoney,
  formatNumber,
  getPeriod,
  matchesQuery,
  restoreExpense,
  shiftPeriod,
  useClients,
  useExpense,
  useExpenses,
  useInventory,
  useSettings,
  type DateRange,
  type Expense,
  type ExpenseCategory,
  type ExpenseInput,
  type ID,
} from '@/data';
import { Button, EmptyState, FilterChips, PageHeader, SearchField, SegmentedControl, Skeleton, confirm, toast, useNow } from '@/ui';
import { CATEGORY_COLOR } from './categories';
import { ExpenseDetailSheet } from './ExpenseDetail';
import { ExpenseFormSheet } from './ExpenseForm';
import { ExpenseList } from './ExpenseList';
import { ExpenseSummary } from './ExpenseSummary';
import styles from './gastos.module.css';

type PeriodFilter = 'semana' | 'mes' | 'anterior' | 'todo';

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: 'semana', label: 'Esta semana' },
  { value: 'mes', label: 'Este mes' },
  { value: 'anterior', label: 'Mes anterior' },
  { value: 'todo', label: 'Todo' },
];

function periodRange(f: PeriodFilter, now: number, ws: 0 | 1): { range: DateRange; label: string } {
  if (f === 'semana') {
    const p = getPeriod('week', now, ws);
    return { range: { start: p.start, end: p.end }, label: `Esta semana · ${p.shortLabel}` };
  }
  if (f === 'mes') {
    const p = getPeriod('month', now);
    return { range: { start: p.start, end: p.end }, label: `Este mes · ${p.label}` };
  }
  if (f === 'anterior') {
    const p = shiftPeriod(getPeriod('month', now), -1);
    return { range: { start: p.start, end: p.end }, label: `Mes anterior · ${p.label}` };
  }
  return { range: { start: 0, end: 8_640_000_000_000 }, label: 'Todo el historial' };
}

type FormState = { key: string; mode: 'create' | 'edit'; id?: ID; initial: ExpenseInput };

export default function GastosPage() {
  const route = useRoute();
  const now = useNow(60_000);
  const settings = useSettings();
  const ws: 0 | 1 = settings?.weekStartsOn === 0 ? 0 : 1;
  const expenses = useExpenses();
  const clients = useClients();
  const inventory = useInventory({ includeDeleted: true });

  const [period, setPeriod] = useState<PeriodFilter>('mes');
  const [category, setCategory] = useState<ExpenseCategory | 'todas'>('todas');
  const [q, setQ] = useState('');

  const routeId = route.params[0] ?? null;
  const editing = !!routeId && route.query.get('editar') === '1';
  const creating = !routeId && route.query.get('nuevo') === '1';
  const prefillClient = route.query.get('cliente');
  const duplicateFrom = route.query.get('desde');
  const detailOpen = !!routeId && !editing;

  const routeExpense = useExpense(routeId);

  const clientsById = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c])), [clients]);
  const itemsById = useMemo(() => new Map((inventory ?? []).map((i) => [i.id, i])), [inventory]);
  const activeInventory = useMemo(() => (inventory ?? []).filter((i) => !i.deletedAt), [inventory]);

  /* ------------------------------ Filtros ------------------------------ */
  const { range, label: rangeLabel } = useMemo(() => periodRange(period, now, ws), [period, now, ws]);

  const inPeriodAndSearch = useMemo(() => {
    if (!expenses) return undefined;
    const query = q.trim();
    return expenses.filter((e) => {
      if (e.fecha < range.start || e.fecha >= range.end) return false;
      if (!query) return true;
      const c = e.clienteId ? clientsById.get(e.clienteId) : undefined;
      return matchesQuery(`${e.concepto} ${e.proveedor} ${e.notas} ${EXPENSE_CATEGORY_LABEL[e.categoria]} ${c ? `${c.nombre} ${c.folio}` : ''}`, query);
    });
  }, [expenses, range.start, range.end, q, clientsById]);

  const filtered = useMemo(() => (inPeriodAndSearch ?? []).filter((e) => category === 'todas' || e.categoria === category), [inPeriodAndSearch, category]);
  const filteredTotal = useMemo(() => filtered.reduce((s, e) => s + e.totalCents, 0), [filtered]);

  const chipOptions = useMemo(() => {
    const counts = new Map<ExpenseCategory, number>();
    for (const e of inPeriodAndSearch ?? []) counts.set(e.categoria, (counts.get(e.categoria) ?? 0) + 1);
    return [
      { value: 'todas' as const, label: 'Todas', count: inPeriodAndSearch?.length },
      ...EXPENSE_CATEGORIES.filter((c) => counts.get(c) || c === category).map((c) => ({
        value: c,
        label: EXPENSE_CATEGORY_LABEL[c],
        count: counts.get(c) ?? 0,
        dotColor: CATEGORY_COLOR[c],
      })),
    ];
  }, [inPeriodAndSearch, category]);

  const hasFilters = category !== 'todas' || !!q.trim();
  const clearFilters = () => {
    setCategory('todas');
    setQ('');
  };

  /* ---------------------------- Formulario ----------------------------- */
  const dataReady = !!expenses && !!clients && !!inventory;
  const wantKey = creating ? `new:${prefillClient ?? ''}:${duplicateFrom ?? ''}` : editing ? `edit:${routeId}` : null;
  const [form, setForm] = useState<FormState | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Abre / cierra el formulario según la query (sin desmontarlo para animar la salida).
  if (wantKey && dataReady && (!formOpen || form?.key !== wantKey)) {
    let next: FormState | null = null;
    if (creating) {
      const base = emptyExpenseInput();
      const src = duplicateFrom ? expenses!.find((x) => x.id === duplicateFrom) : undefined;
      const initial: ExpenseInput = src
        ? {
            concepto: src.concepto,
            categoria: src.categoria,
            proveedor: src.proveedor,
            cantidad: src.cantidad,
            costoUnitarioCents: src.costoUnitarioCents,
            clienteId: src.clienteId,
            inventarioId: src.inventarioId,
            metodoPago: src.metodoPago,
            fecha: Date.now(),
            notas: '',
          }
        : { ...base, fecha: Date.now() };
      if (prefillClient && clientsById.has(prefillClient)) initial.clienteId = prefillClient;
      next = { key: wantKey + ':' + Date.now(), mode: 'create', initial };
      next.key = wantKey;
    } else if (editing && routeExpense) {
      const x = routeExpense;
      next = {
        key: wantKey,
        mode: 'edit',
        id: x.id,
        initial: {
          concepto: x.concepto,
          categoria: x.categoria,
          proveedor: x.proveedor,
          cantidad: x.cantidad,
          costoUnitarioCents: x.costoUnitarioCents,
          clienteId: x.clienteId,
          inventarioId: x.inventarioId,
          metodoPago: x.metodoPago,
          fecha: x.fecha,
          notas: x.notas,
        },
      };
    }
    if (next) {
      setForm(next);
      setFormOpen(true);
    }
  } else if (!wantKey && formOpen) {
    setFormOpen(false);
  }

  const closeForm = () => {
    if (form?.mode === 'edit') setQuery({ editar: null });
    else setQuery({ nuevo: null, cliente: null, desde: null });
  };

  /* ------------------------------ Acciones ----------------------------- */
  const openNew = () => setQuery({ nuevo: '1' });
  const openEdit = (e: Expense) => navigate(`#/gastos/${e.id}?editar=1`);
  const duplicate = (e: Expense) => navigate(`#/gastos?nuevo=1&desde=${e.id}`);
  const remove = async (e: Expense) => {
    const ok = await confirm({
      title: '¿Eliminar este gasto?',
      description: `«${e.concepto}» por ${formatMoney(e.totalCents)} se enviará a la papelera. Podrás restaurarlo.${e.inventarioId ? ' El stock del inventario no se modifica.' : ''}`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteExpense(e.id);
      if (routeId === e.id) navigate('#/gastos');
      toast.undo('Gasto enviado a la papelera', () => {
        restoreExpense(e.id)
          .then(() => toast.success('Gasto restaurado'))
          .catch(() => toast.error('No se pudo restaurar el gasto'));
      }, { description: `${e.concepto} · ${formatMoney(e.totalCents)}` });
    } catch (err) {
      toast.error('No se pudo eliminar el gasto', { description: err instanceof Error ? err.message : undefined });
    }
  };

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await exportCSV('gastos');
      downloadBlob(blob, backupFilename('csv', 'gastos'));
      toast.success('CSV de gastos exportado');
    } catch (err) {
      toast.error('No se pudo exportar', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setExporting(false);
    }
  };

  const detailExpense = routeId ? routeExpense : undefined;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Gastos"
        subtitle="Compras de repuestos, herramientas y otros gastos del taller."
        actions={
          <>
            <Button variant="secondary" iconLeft={<Download />} onClick={exportCsv} loading={exporting} disabled={!expenses?.length}>
              Exportar CSV
            </Button>
            <Button variant="primary" iconLeft={<Plus />} onClick={openNew}>
              Nuevo gasto
            </Button>
          </>
        }
      />

      <ExpenseSummary
        expenses={expenses}
        now={now}
        weekStartsOn={ws}
        range={range}
        rangeLabel={rangeLabel}
        onCategoryClick={(c) => setCategory(c as ExpenseCategory)}
        onProviderClick={(p) => setQ(p)}
      />

      <section className={styles.listSection} aria-labelledby="gastos-lista">
        <h2 id="gastos-lista" className={styles.srOnly}>
          Lista de gastos
        </h2>
        <div className={styles.toolbar}>
          <SegmentedControl<PeriodFilter> aria-label="Período" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} size="sm" className={styles.periodCtl} />
          <SearchField value={q} onChange={setQ} placeholder="Buscar concepto, proveedor o notas…" size="sm" containerClassName={styles.search} />
        </div>
        <div className={styles.chipsRow}>
          <FilterChips<ExpenseCategory | 'todas'> aria-label="Categoría" value={category} onChange={setCategory} options={chipOptions} size="sm" />
        </div>

        {expenses && filtered.length > 0 && (
          <div className={styles.resultBar} aria-live="polite">
            <span>
              <strong>{formatNumber(filtered.length)}</strong> {filtered.length === 1 ? 'gasto' : 'gastos'} · {rangeLabel}
              {hasFilters && (
                <button type="button" className={styles.clearLink} onClick={clearFilters}>
                  Limpiar filtros
                </button>
              )}
            </span>
            <span className={styles.resultTotal}>
              Total <strong>{formatMoney(filteredTotal)}</strong>
            </span>
          </div>
        )}

        {!expenses ? (
          <ListSkeleton />
        ) : expenses.length === 0 ? (
          <EmptyState
            icon={<Receipt />}
            accent={<Plus />}
            tone="expense"
            title="Aún no registras gastos"
            description="Anota cada compra de repuestos o herramientas para saber cuánto gastas por semana y por mes."
            action={
              <Button variant="primary" iconLeft={<Plus />} onClick={openNew}>
                Registrar primer gasto
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            tone="neutral"
            size="sm"
            title="Sin gastos con estos filtros"
            description={q.trim() ? `No hay coincidencias para «${q.trim()}» en ${rangeLabel.toLowerCase()}.` : `No hay gastos en ${rangeLabel.toLowerCase()}.`}
            secondaryAction={
              period !== 'todo' ? (
                <Button variant="ghost" onClick={() => setPeriod('todo')}>
                  Ver todo el historial
                </Button>
              ) : undefined
            }
            action={
              hasFilters ? (
                <Button onClick={clearFilters}>Limpiar filtros</Button>
              ) : (
                <Button variant="primary" iconLeft={<Plus />} onClick={openNew}>
                  Nuevo gasto
                </Button>
              )
            }
          />
        ) : (
          <ExpenseList expenses={filtered} clients={clientsById} items={itemsById} query={q} onEdit={openEdit} onDuplicate={duplicate} onDelete={remove} />
        )}
      </section>

      {form && (
        <ExpenseFormSheet
          key={form.key}
          open={formOpen}
          mode={form.mode}
          expenseId={form.id}
          initial={form.initial}
          expenses={expenses ?? []}
          clients={clients ?? []}
          inventory={activeInventory}
          weekStartsOn={ws}
          onClose={closeForm}
          onSaved={(_saved, mode) => {
            if (mode === 'edit') setQuery({ editar: null });
            else setQuery({ nuevo: null, cliente: null, desde: null });
          }}
        />
      )}

      <ExpenseDetailSheet
        open={detailOpen}
        expense={detailExpense}
        client={detailExpense?.clienteId ? clientsById.get(detailExpense.clienteId) : undefined}
        item={detailExpense?.inventarioId ? itemsById.get(detailExpense.inventarioId) : undefined}
        onClose={() => navigate('#/gastos')}
        onEdit={openEdit}
        onDuplicate={duplicate}
        onDelete={remove}
      />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className={styles.groups} aria-busy="true" aria-label="Cargando gastos">
      {[0, 1].map((g) => (
        <div key={g} className={styles.group}>
          <div className={styles.dayHead}>
            <Skeleton width={200} height={12} />
            <Skeleton width={90} height={12} />
          </div>
          <div className={styles.rows}>
            {[0, 1, 2].map((r) => (
              <div key={r} className={styles.rowInner}>
                <Skeleton width={40} height={40} radius={10} />
                <div className={styles.rowMain}>
                  <Skeleton width="55%" height={13} />
                  <Skeleton width="38%" height={11} />
                </div>
                <span />
                <div className={styles.rowAmount}>
                  <Skeleton width={84} height={14} />
                  <Skeleton width={64} height={10} />
                </div>
                <span />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

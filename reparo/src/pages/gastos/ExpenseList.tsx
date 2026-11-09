import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Copy, Ellipsis, Eye, Package, Pencil, Trash2, User } from 'lucide-react';
import { Link } from '@/app/router';
import {
  EXPENSE_CATEGORY_LABEL,
  dayKey,
  formatDayHeading,
  formatFolio,
  formatMoney,
  formatNumber,
  type Client,
  type Expense,
  type ID,
  type InventoryItem,
} from '@/data';
import { Button, DateTimeText, DropdownMenu, Highlight, IconButton, MoneyText, usePrefersReducedMotion } from '@/ui';
import { CategoryIcon } from './categories';
import styles from './gastos.module.css';

const PAGE = 40;

export interface ExpenseListProps {
  expenses: readonly Expense[];
  clients: Map<ID, Client>;
  items: Map<ID, InventoryItem>;
  query: string;
  onEdit: (e: Expense) => void;
  onDuplicate: (e: Expense) => void;
  onDelete: (e: Expense) => void;
}

export function ExpenseList({ expenses, clients, items, query, onEdit, onDuplicate, onDelete }: ExpenseListProps) {
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();

  // Reinicia la paginación al cambiar el conjunto filtrado.
  const signature = expenses.length + ':' + (expenses[0]?.id ?? '') + query;
  const [lastSig, setLastSig] = useState(signature);
  if (lastSig !== signature) {
    setLastSig(signature);
    setLimit(PAGE);
  }

  const visible = expenses.slice(0, limit);
  const hasMore = expenses.length > limit;

  const groups = useMemo(() => {
    // Totales por día con TODOS los gastos filtrados (no sólo los visibles).
    const totals = new Map<string, { total: number; count: number }>();
    for (const e of expenses) {
      const k = dayKey(e.fecha);
      const t = totals.get(k) ?? { total: 0, count: 0 };
      t.total += e.totalCents;
      t.count++;
      totals.set(k, t);
    }
    const out: { key: string; ts: number; total: number; count: number; rows: Expense[] }[] = [];
    for (const e of visible) {
      const k = dayKey(e.fecha);
      let g = out[out.length - 1];
      if (!g || g.key !== k) {
        const t = totals.get(k)!;
        g = { key: k, ts: e.fecha, total: t.total, count: t.count, rows: [] };
        out.push(g);
      }
      g.rows.push(e);
    }
    return out;
  }, [expenses, visible]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting)) setLimit((l) => l + PAGE);
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, limit]);

  return (
    <div className={styles.groups}>
      {groups.map((g) => (
        <section key={g.key} className={styles.group} aria-label={formatDayHeading(g.ts)}>
          <header className={styles.dayHead}>
            <h3 className={styles.dayTitle}>{formatDayHeading(g.ts)}</h3>
            <span className={styles.dayMeta}>
              <span className={styles.dayCount}>
                {g.count} {g.count === 1 ? 'gasto' : 'gastos'}
              </span>
              <MoneyText cents={g.total} tone="expense" weight="semibold" className={styles.dayTotal} />
            </span>
          </header>
          <ul className={styles.rows}>
            {g.rows.map((e, i) => (
              <motion.li
                key={e.id}
                className={styles.row}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: Math.min(i, 8) * 0.02, ease: [0.16, 1, 0.3, 1] }}
              >
                <ExpenseRow
                  e={e}
                  client={e.clienteId ? clients.get(e.clienteId) : undefined}
                  item={e.inventarioId ? items.get(e.inventarioId) : undefined}
                  query={query}
                  onEdit={onEdit}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                />
              </motion.li>
            ))}
          </ul>
        </section>
      ))}
      {hasMore && (
        <div ref={sentinel} className={styles.more}>
          <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
            Cargar más ({formatNumber(expenses.length - limit)} restantes)
          </Button>
        </div>
      )}
      {!hasMore && expenses.length > PAGE && <p className={styles.endNote}>Fin de la lista · {formatNumber(expenses.length)} gastos</p>}
    </div>
  );
}

function ExpenseRow({
  e,
  client,
  item,
  query,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  e: Expense;
  client?: Client;
  item?: InventoryItem;
  query: string;
  onEdit: (e: Expense) => void;
  onDuplicate: (e: Expense) => void;
  onDelete: (e: Expense) => void;
}) {
  const hasLinks = !!(client || item);
  return (
    <div className={styles.rowInner}>
      <Link to={`#/gastos/${e.id}`} className={styles.rowLink} aria-label={`${e.concepto}, ${formatMoney(e.totalCents)}`} />
      <CategoryIcon categoria={e.categoria} />
      <div className={styles.rowMain}>
        <div className={styles.rowTitle}>
          <Highlight text={e.concepto} query={query} className={styles.mark} />
        </div>
        <div className={styles.rowMeta}>
          <span>{EXPENSE_CATEGORY_LABEL[e.categoria]}</span>
          {e.proveedor && (
            <>
              <span className={styles.sep} aria-hidden>·</span>
              <span className={styles.provider}>
                <Highlight text={e.proveedor} query={query} className={styles.mark} />
              </span>
            </>
          )}
          <span className={styles.sep} aria-hidden>·</span>
          <DateTimeText value={e.fecha} muted className={styles.rowDate} />
        </div>
      </div>
      <div className={styles.rowLinks}>
        {client && (
          <Link to={`#/clientes/${client.id}`} className={styles.chip} title={`Ver servicio de ${client.nombre}`}>
            <User aria-hidden />
            <span className={styles.chipFolio}>{formatFolio(client.folio)}</span>
            <span className={styles.chipText}>{client.nombre}</span>
          </Link>
        )}
        {item && (
          <Link to={`#/inventario/${item.id}`} className={styles.chip} title={`Ver ${item.nombre} en inventario`}>
            <Package aria-hidden />
            <span className={styles.chipText}>Inventario</span>
          </Link>
        )}
        {!hasLinks && <span className={styles.noLinks} aria-hidden />}
      </div>
      <div className={styles.rowAmount}>
        <MoneyText cents={e.totalCents} tone="expense" weight="semibold" className={styles.rowTotal} />
        <span className={styles.rowQty}>
          {formatNumber(e.cantidad)} × {formatMoney(e.costoUnitarioCents)}
        </span>
      </div>
      <div className={styles.rowMenu}>
        <DropdownMenu
          align="end"
          label={`Acciones de ${e.concepto}`}
          trigger={<IconButton icon={<Ellipsis />} label="Acciones" size="sm" tooltip={false} />}
          items={[
            { label: 'Ver detalle', icon: <Eye />, href: `#/gastos/${e.id}` },
            { label: 'Editar', icon: <Pencil />, onSelect: () => onEdit(e) },
            { label: 'Duplicar', description: 'Registrar la misma compra hoy', icon: <Copy />, onSelect: () => onDuplicate(e) },
            { type: 'separator' },
            { label: 'Eliminar', icon: <Trash2 />, danger: true, onSelect: () => onDelete(e) },
          ]}
        />
      </div>
    </div>
  );
}

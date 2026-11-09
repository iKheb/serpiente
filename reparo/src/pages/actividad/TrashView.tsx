import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { OctagonX, RotateCcw, Trash2 } from 'lucide-react';
import {
  EXPENSE_CATEGORY_LABEL,
  REPAIR_STATUS_LABEL,
  clientTitle,
  formatDate,
  formatFolio,
  formatMoney,
  type Client,
  type Expense,
  type InventoryItem,
} from '@/data';
import { Badge, Button, DateTimeText, EmptyState, FilterChips, IconButton, Skeleton, Tooltip, confirm, cx, fullDateTime, toast, usePrefersReducedMotion } from '@/ui';
import { ENTITY_ICON } from './EventRow';
import { formatClock, plural, purgeEntity, restoreEntity, type TrashEntity } from './lib';
import styles from './Actividad.module.css';

interface TrashRow {
  entity: TrashEntity;
  id: string;
  title: string;
  detail: string;
  amount: string | null;
  deletedAt: number;
}

const LABEL: Record<TrashEntity, string> = { cliente: 'Cliente', gasto: 'Gasto', inventario: 'Artículo' };
const HREF: Record<TrashEntity, string> = { cliente: '#/clientes/', gasto: '#/gastos/', inventario: '#/inventario/' };

function rowsFrom(trash: { clients: Client[]; expenses: Expense[]; inventory: InventoryItem[] }): TrashRow[] {
  const rows: TrashRow[] = [
    ...trash.clients.map((c) => ({
      entity: 'cliente' as const,
      id: c.id,
      title: clientTitle(c),
      detail: [formatFolio(c.folio), c.servicio, REPAIR_STATUS_LABEL[c.estado]].filter(Boolean).join(' · '),
      amount: formatMoney(c.cobroCents),
      deletedAt: c.deletedAt ?? 0,
    })),
    ...trash.expenses.map((e) => ({
      entity: 'gasto' as const,
      id: e.id,
      title: e.concepto || 'Gasto sin concepto',
      detail: [EXPENSE_CATEGORY_LABEL[e.categoria], e.proveedor, `${e.cantidad} × ${formatMoney(e.costoUnitarioCents)}`].filter(Boolean).join(' · '),
      amount: formatMoney(e.totalCents),
      deletedAt: e.deletedAt ?? 0,
    })),
    ...trash.inventory.map((i) => ({
      entity: 'inventario' as const,
      id: i.id,
      title: i.nombre || 'Artículo sin nombre',
      detail: [EXPENSE_CATEGORY_LABEL[i.categoria], `${i.stock} en stock`, i.ubicacion].filter(Boolean).join(' · '),
      amount: formatMoney(i.costoUnitarioCents),
      deletedAt: i.deletedAt ?? 0,
    })),
  ];
  return rows.sort((a, b) => b.deletedAt - a.deletedAt);
}

type F = 'todas' | TrashEntity;

export function TrashView({
  trash,
  onShowLog,
}: {
  trash: { clients: Client[]; expenses: Expense[]; inventory: InventoryItem[] } | undefined;
  onShowLog: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const [filter, setFilter] = useState<F>('todas');
  const [busy, setBusy] = useState<string | null>(null);
  const rows = useMemo(() => (trash ? rowsFrom(trash) : []), [trash]);
  const shown = filter === 'todas' ? rows : rows.filter((r) => r.entity === filter);

  if (!trash) {
    return (
      <div className={styles.trashList} aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={styles.trashItem}>
            <Skeleton circle height={36} />
            <div style={{ flex: 1 }}>
              <Skeleton height={13} width="45%" />
              <Skeleton height={11} width="65%" style={{ marginTop: 8 }} />
            </div>
            <Skeleton height={32} width={180} radius={8} />
          </div>
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        size="lg"
        tone="success"
        icon={<Trash2 />}
        title="La papelera está vacía"
        description="Los clientes, gastos y artículos que elimines aparecerán aquí con la fecha y hora de eliminación. Podrás restaurarlos o eliminarlos definitivamente."
        action={
          <Button variant="secondary" onClick={onShowLog}>
            Ver registro de actividad
          </Button>
        }
      />
    );
  }

  const counts = {
    cliente: trash.clients.length,
    gasto: trash.expenses.length,
    inventario: trash.inventory.length,
  };

  const restore = async (r: TrashRow) => {
    setBusy(r.id);
    try {
      await restoreEntity(r.entity, r.id);
      toast.success(`${LABEL[r.entity]} restaurado`, {
        description: r.title,
        action: { label: 'Abrir', onClick: () => (location.hash = HREF[r.entity] + r.id) },
      });
    } catch (err) {
      toast.error('No se pudo restaurar', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const purge = async (r: TrashRow) => {
    const ok = await confirm({
      tone: 'danger',
      icon: <OctagonX />,
      title: `¿Eliminar definitivamente “${r.title}”?`,
      description:
        r.entity === 'cliente'
          ? 'Se borrará para siempre junto con sus fotos de evidencia. Esta acción no se puede deshacer; el registro de actividad conservará la constancia.'
          : 'Se borrará para siempre. Esta acción no se puede deshacer; el registro de actividad conservará la constancia.',
      confirmLabel: 'Eliminar definitivamente',
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      await purgeEntity(r.entity, r.id);
      toast({ title: 'Eliminado definitivamente', description: r.title, tone: 'neutral' });
    } catch (err) {
      toast.error('No se pudo eliminar', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const emptyAll = async () => {
    const parts = [
      counts.cliente && plural(counts.cliente, 'cliente', 'clientes'),
      counts.gasto && plural(counts.gasto, 'gasto', 'gastos'),
      counts.inventario && plural(counts.inventario, 'artículo', 'artículos'),
    ].filter(Boolean);
    const ok = await confirm({
      tone: 'danger',
      title: '¿Vaciar la papelera?',
      description: `Se eliminarán definitivamente ${plural(rows.length, 'elemento', 'elementos')} (${parts.join(', ')}). Esta acción no se puede deshacer.`,
      confirmLabel: 'Vaciar papelera',
    });
    if (!ok) return;
    setBusy('*');
    let n = 0;
    try {
      for (const r of rows) {
        await purgeEntity(r.entity, r.id);
        n++;
      }
      toast({ title: 'Papelera vaciada', description: `${plural(n, 'elemento eliminado', 'elementos eliminados')} definitivamente`, tone: 'neutral' });
    } catch (err) {
      toast.error('No se pudo vaciar por completo', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.trash}>
      <div className={styles.trashBar}>
        <FilterChips
          size="sm"
          aria-label="Tipo de elemento"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'todas', label: 'Todo', count: rows.length },
            { value: 'cliente', label: 'Clientes', icon: ENTITY_ICON.cliente, count: counts.cliente },
            { value: 'gasto', label: 'Gastos', icon: ENTITY_ICON.gasto, count: counts.gasto },
            { value: 'inventario', label: 'Inventario', icon: ENTITY_ICON.inventario, count: counts.inventario },
          ]}
        />
        <Button variant="danger-ghost" size="sm" iconLeft={<Trash2 />} onClick={emptyAll} loading={busy === '*'} className={styles.emptyBtn}>
          Vaciar papelera
        </Button>
      </div>
      <p className={styles.trashNote}>Los elementos en la papelera no cuentan en reportes ni listas. Restáuralos para volver a usarlos.</p>

      {shown.length === 0 ? (
        <EmptyState size="sm" tone="neutral" icon={<Trash2 />} title="Nada de este tipo en la papelera" />
      ) : (
        <ul className={styles.trashList}>
          <AnimatePresence initial={false}>
            {shown.map((r) => (
              <motion.li
                key={r.id}
                layout={!reduced}
                className={styles.trashItem}
                initial={{ opacity: 0, y: reduced ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: reduced ? 0 : 24, transition: { duration: 0.18 } }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className={cx(styles.node, styles.tDanger, styles.trashIcon)} aria-hidden>
                  {ENTITY_ICON[r.entity]}
                </span>
                <div className={styles.trashMain}>
                  <div className={styles.titleLine}>
                    <span className={styles.title}>{r.title}</span>
                    <Badge size="sm">{LABEL[r.entity]}</Badge>
                  </div>
                  <p className={styles.trashDetail}>
                    {r.detail}
                    {r.amount && (
                      <>
                        <span className={styles.dotSep}>·</span>
                        <span className={styles.num}>{r.amount}</span>
                      </>
                    )}
                  </p>
                  <p className={styles.trashWhen}>
                    <Trash2 aria-hidden />
                    Eliminado el{' '}
                    <Tooltip content={fullDateTime(r.deletedAt)}>
                      <time dateTime={new Date(r.deletedAt).toISOString()} className={styles.num}>
                        {formatDate(r.deletedAt)}
                        {' · '}
                        {formatClock(r.deletedAt)}
                      </time>
                    </Tooltip>
                    <span className={styles.dotSep}>·</span>
                    <DateTimeText value={r.deletedAt} variant="relative" muted />
                  </p>
                </div>
                <div className={styles.trashActions}>
                  <Button size="sm" variant="secondary" iconLeft={<RotateCcw />} onClick={() => restore(r)} loading={busy === r.id} disabled={busy === '*'}>
                    Restaurar
                  </Button>
                  <IconButton
                    size="sm"
                    variant="danger-ghost"
                    icon={<OctagonX />}
                    label="Eliminar definitivamente"
                    onClick={() => purge(r)}
                    disabled={!!busy}
                    tooltipSide="top"
                  />
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

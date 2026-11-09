/* Ficha del artículo (#/inventario/<id>). */
import { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  ArchiveRestore,
  ArrowDownToLine,
  ClipboardCheck,
  History,
  MoreHorizontal,
  PackageX,
  Pencil,
  Receipt,
  SlidersHorizontal,
  Trash2,
  Truck,
  Wrench,
  Minus,
  Plus,
} from 'lucide-react';
import { navigate } from '@/app/router';
import { Badge, Button, Card, DateTimeText, DropdownMenu, EmptyState, IconButton, MoneyText, PageHeader, Skeleton, cx, toast, usePrefersReducedMotion } from '@/ui';
import {
  EXPENSE_CATEGORY_LABEL,
  MINUS,
  MOVEMENT_TYPE_LABEL,
  formatFolio,
  formatMoney,
  formatPercent,
  restoreInventoryItem,
  useAudit,
  useClients,
  useInventoryItem,
  useMovements,
  type AuditEntry,
  type Client,
  type InventoryItem,
  type InventoryMovement,
  type InventoryMovementType,
} from '@/data';
import { openAction } from './actions';
import { itemMenu } from './InventoryList';
import { compatLabel, errorMessage, plural } from './lib';
import { ItemThumb, StockBadge, StockMeter } from './parts';
import styles from './detail.module.css';

const MOVE_ICON: Record<InventoryMovementType, typeof Wrench> = {
  entrada: ArrowDownToLine,
  uso: Wrench,
  ajuste: SlidersHorizontal,
  merma: PackageX,
};

export function ItemDetail({ id }: { id: string }) {
  const item = useInventoryItem(id);

  if (item === undefined) return <DetailSkeleton />;
  if (item === null) {
    return (
      <>
        <PageHeader title="Artículo" back={{ href: '#/inventario', label: 'Inventario' }} />
        <EmptyState
          icon={<PackageX />}
          tone="neutral"
          title="Este artículo no existe"
          description="Puede que se haya eliminado definitivamente."
          action={
            <Button variant="primary" onClick={() => navigate('#/inventario')}>
              Volver al inventario
            </Button>
          }
        />
      </>
    );
  }
  return <DetailBody item={item} />;
}

function DetailBody({ item }: { item: InventoryItem }) {
  const deleted = item.deletedAt != null;
  const pedido = item.pedidoAt != null;
  const compat = compatLabel(item);
  const valor = Math.max(0, item.stock) * item.costoUnitarioCents;
  const margen = item.precioVentaCents > 0 ? (item.precioVentaCents - item.costoUnitarioCents) / item.precioVentaCents : null;
  const reduced = usePrefersReducedMotion();

  const restore = async () => {
    try {
      await restoreInventoryItem(item.id);
      toast.success('Artículo restaurado');
    } catch (err) {
      toast.error('No se pudo restaurar', { description: errorMessage(err) });
    }
  };

  const fade = (d: number) => ({
    initial: reduced ? false : ({ opacity: 0, y: 8 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.28, delay: d, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <>
      <PageHeader
        back={{ href: '#/inventario', label: 'Inventario' }}
        title={item.nombre}
        subtitle={[EXPENSE_CATEGORY_LABEL[item.categoria], compat].filter(Boolean).join(' · ')}
        meta={!deleted && <StockBadge item={item} size="md" />}
        actions={
          deleted ? (
            <Button variant="primary" iconLeft={<ArchiveRestore />} onClick={() => void restore()}>
              Restaurar
            </Button>
          ) : (
            <>
              <Button iconLeft={<Pencil />} onClick={() => navigate(`#/inventario/${item.id}?editar=1`)}>
                Editar
              </Button>
              {pedido ? (
                <Button iconLeft={<Truck />} onClick={() => openAction('recibir', item)}>
                  Recibir
                </Button>
              ) : (
                <Button iconLeft={<Plus />} onClick={() => openAction('reponer', item)}>
                  Reponer
                </Button>
              )}
              <Button variant="primary" iconLeft={<Minus />} disabled={item.stock <= 0} onClick={() => openAction('usar', item)}>
                Usar
              </Button>
              <DropdownMenu trigger={<IconButton icon={<MoreHorizontal />} label="Más acciones" variant="secondary" />} items={itemMenu(item, { detail: true })} align="end" width={240} />
            </>
          )
        }
      />

      {deleted && (
        <div className={styles.trashBanner} role="status">
          <Trash2 aria-hidden />
          <span>
            Este artículo está en la papelera desde <DateTimeText value={item.deletedAt!} />. Restáuralo para volver a usarlo.
          </span>
        </div>
      )}

      <motion.section className={styles.hero} aria-label="Resumen de stock" {...fade(0)}>
        <div className={styles.heroArt}>
          <ItemThumb categoria={item.categoria} size={168} />
        </div>
        <div className={styles.heroStock}>
          <span className={styles.eyebrow}>Stock actual</span>
          <StockMeter item={item} size="lg" />
          <p className={styles.heroHint}>
            {item.stock <= 0
              ? pedido
                ? 'Agotado · ya está pedido al proveedor.'
                : 'Agotado · agrégalo a tu próximo pedido.'
              : item.stock <= item.stockMinimo
                ? `En el mínimo · ${pedido ? 'pedido en camino.' : 'está en «Por pedir».'}`
                : `${plural(item.stock - item.stockMinimo, 'unidad', 'unidades')} por encima del mínimo.`}
          </p>
          {!deleted && (
            <div className={styles.heroActions}>
              <Button size="sm" variant="ghost" iconLeft={<ClipboardCheck />} onClick={() => openAction('ajustar', item)}>
                Ajustar conteo
              </Button>
              <Button size="sm" variant="ghost" iconLeft={<PackageX />} disabled={item.stock <= 0} onClick={() => openAction('merma', item)}>
                Merma
              </Button>
            </div>
          )}
        </div>
        <dl className={styles.heroStats}>
          <Stat label="Valor en stock" value={<MoneyText cents={valor} size="lg" weight="semibold" />} hint={`${item.stock} × ${formatMoney(item.costoUnitarioCents)}`} />
          <Stat label="Costo unitario" value={<MoneyText cents={item.costoUnitarioCents} size="lg" weight="semibold" />} />
          <Stat
            label="Precio sugerido"
            value={item.precioVentaCents ? <MoneyText cents={item.precioVentaCents} size="lg" weight="semibold" /> : <span className={styles.muted}>—</span>}
          />
          <Stat
            label="Margen"
            value={<span className={cx(styles.statBig, margen != null && (margen > 0 ? styles.good : styles.bad))}>{formatPercent(margen)}</span>}
            hint={margen != null ? `${formatMoney(item.precioVentaCents - item.costoUnitarioCents)} por pieza` : 'Sin precio sugerido'}
          />
        </dl>
      </motion.section>

      <div className={styles.columns}>
        <motion.div {...fade(0.06)}>
          <MovementsCard item={item} />
        </motion.div>
        <div className={styles.side}>
          <motion.div {...fade(0.1)}>
            <DataCard item={item} />
          </motion.div>
          <motion.div {...fade(0.14)}>
            <AuditCard item={item} />
          </motion.div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className={styles.stat}>
      <dt>{label}</dt>
      <dd>
        {value}
        {hint && <span className={styles.statHint}>{hint}</span>}
      </dd>
    </div>
  );
}

/* ------------------------------ Movimientos ------------------------------ */

function MovementsCard({ item }: { item: InventoryItem }) {
  const moves = useMovements({ itemId: item.id });
  const clients = useClients({ includeDeleted: true });
  const byId = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c] as const)), [clients]);
  const totals = useMemo(() => {
    const t = { entrada: 0, uso: 0, merma: 0 };
    for (const m of moves ?? []) {
      if (m.type === 'entrada') t.entrada += m.cantidad;
      else if (m.type === 'uso') t.uso += -m.cantidad;
      else if (m.type === 'merma') t.merma += -m.cantidad;
    }
    return t;
  }, [moves]);

  return (
    <Card
      padding="none"
      title="Historial de movimientos"
      icon={<History />}
      description={moves && moves.length ? `${totals.entrada} entradas · ${totals.uso} usadas · ${totals.merma} merma` : undefined}
      className={styles.card}
    >
      {moves === undefined ? (
        <div className={styles.listPad}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={styles.moveSkeleton}>
              <Skeleton width={32} height={32} radius={9} />
              <Skeleton width="45%" height={12} />
              <Skeleton width={60} height={12} />
            </div>
          ))}
        </div>
      ) : moves.length === 0 ? (
        <EmptyState size="sm" tone="neutral" icon={<History />} title="Sin movimientos" description="Cada uso, reposición, ajuste o merma quedará registrado aquí con fecha y hora." />
      ) : (
        <ol className={styles.moves}>
          {moves.map((m) => (
            <MovementRow key={m.id} m={m} client={m.clienteId ? (byId.get(m.clienteId) ?? null) : null} />
          ))}
        </ol>
      )}
    </Card>
  );
}

function MovementRow({ m, client }: { m: InventoryMovement; client: Client | null }) {
  const Icon = MOVE_ICON[m.type];
  const positive = m.cantidad > 0;
  return (
    <li className={styles.move} data-type={m.type}>
      <span className={styles.moveIcon} aria-hidden>
        <Icon />
      </span>
      <div className={styles.moveBody}>
        <div className={styles.moveTitle}>
          <span>{MOVEMENT_TYPE_LABEL[m.type]}</span>
          {client && (
            <a href={`#/clientes/${client.id}`} className={styles.moveClient}>
              <span className={styles.folio}>{formatFolio(client.folio)}</span> {client.nombre}
            </a>
          )}
          {m.clienteId && !client && <span className={styles.muted}>Cliente eliminado</span>}
          {m.gastoId && (
            <a href={`#/gastos/${m.gastoId}`} className={styles.moveLink}>
              <Receipt aria-hidden /> Ver gasto
            </a>
          )}
        </div>
        <div className={styles.moveMeta}>
          <DateTimeText value={m.ts} />
          {m.nota && <span className={styles.moveNote}>· {m.nota}</span>}
          {m.type === 'entrada' && m.costoUnitarioCents > 0 && <span>· {formatMoney(m.costoUnitarioCents)} c/u</span>}
        </div>
      </div>
      <div className={styles.moveQty}>
        <span className={cx(styles.qty, positive ? styles.qtyUp : m.cantidad < 0 ? styles.qtyDown : styles.qtyFlat)}>
          {positive ? '+' : m.cantidad < 0 ? MINUS : '±'}
          {Math.abs(m.cantidad)}
        </span>
        <span className={styles.moveStock}>
          {m.stockAntes} → {m.stockDespues}
        </span>
      </div>
    </li>
  );
}

/* --------------------------------- Datos --------------------------------- */

function DataCard({ item }: { item: InventoryItem }) {
  const rows: [string, React.ReactNode][] = [
    ['Categoría', EXPENSE_CATEGORY_LABEL[item.categoria]],
    ['Marca', item.marca || null],
    ['Modelo(s)', item.modelo || null],
    ['SKU', item.sku ? <span className="mono">{item.sku}</span> : null],
    ['Proveedor', item.proveedor || null],
    ['Ubicación', item.ubicacion || null],
    ['Stock mínimo', plural(item.stockMinimo, 'unidad', 'unidades')],
    ['Cantidad a pedir', item.cantidadPedido ? plural(item.cantidadPedido, 'unidad', 'unidades') : null],
    ['Pedido', item.pedidoAt ? <DateTimeText value={item.pedidoAt} /> : null],
    [
      'Volver a pedir',
      item.marcadoReorden ? (
        <Badge tone="pending" size="sm">
          Marcado
        </Badge>
      ) : null,
    ],
    ['Alta', <DateTimeText key="c" value={item.createdAt} />],
    ['Última edición', <DateTimeText key="u" value={item.updatedAt} />],
  ];
  return (
    <Card title="Datos" padding="none" className={styles.card}>
      <dl className={styles.data}>
        {rows.map(([k, v]) => (
          <div key={k} className={styles.dataRow}>
            <dt>{k}</dt>
            <dd>{v ?? <span className={styles.muted}>—</span>}</dd>
          </div>
        ))}
      </dl>
      {item.notas && (
        <div className={styles.notes}>
          <span className={styles.notesLabel}>Notas</span>
          <p>{item.notas}</p>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------- Auditoría ------------------------------- */

function AuditCard({ item }: { item: InventoryItem }) {
  const entries = useAudit({ entity: 'inventario', entityId: item.id, limit: 12 });
  return (
    <Card
      title="Actividad"
      padding="none"
      className={styles.card}
      actions={
        <a className={styles.cardLink} href={`#/actividad?entidad=inventario&id=${item.id}`}>
          Ver todo
        </a>
      }
    >
      {entries === undefined ? (
        <div className={styles.listPad}>
          <Skeleton lines={3} />
        </div>
      ) : entries.length === 0 ? (
        <p className={cx(styles.listPad, styles.muted)}>Sin actividad registrada.</p>
      ) : (
        <ol className={styles.audit}>
          {entries.map((e) => (
            <AuditRow key={e.id} e={e} />
          ))}
        </ol>
      )}
    </Card>
  );
}

function AuditRow({ e }: { e: AuditEntry }) {
  const changes = e.changes.slice(0, 4);
  return (
    <li className={styles.auditRow} data-action={e.action}>
      <span className={styles.auditDot} aria-hidden />
      <div className={styles.auditBody}>
        <span className={styles.auditSummary}>{e.summary}</span>
        {changes.length > 0 && (
          <ul className={styles.changes}>
            {changes.map((c, i) => (
              <li key={i}>
                <span className={styles.changeLabel}>{c.label}</span>{' '}
                {c.fromText && <span className={styles.changeFrom}>{c.fromText}</span>}
                {c.fromText && ' → '}
                <span className={styles.changeTo}>{c.toText || '—'}</span>
              </li>
            ))}
            {e.changes.length > changes.length && <li className={styles.muted}>y {e.changes.length - changes.length} más…</li>}
          </ul>
        )}
        <DateTimeText value={e.ts} className={styles.auditTime} />
      </div>
    </li>
  );
}

/* -------------------------------- Carga ---------------------------------- */

function DetailSkeleton() {
  return (
    <div aria-busy="true">
      <div className={styles.skHead}>
        <Skeleton width={90} height={12} />
        <Skeleton width="40%" height={28} radius={8} />
      </div>
      <div className={styles.hero}>
        <Skeleton width={168} height={168} radius={20} />
        <div className={styles.heroStock}>
          <Skeleton width={80} height={10} />
          <Skeleton width={120} height={48} radius={10} />
          <Skeleton height={10} />
        </div>
        <div className={styles.heroStats}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={44} radius={8} />
          ))}
        </div>
      </div>
      <div className={styles.columns}>
        <Skeleton height={320} radius={14} />
        <Skeleton height={320} radius={14} />
      </div>
    </div>
  );
}

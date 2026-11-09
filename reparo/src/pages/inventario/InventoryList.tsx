/* Lista (tabla en escritorio / tarjetas en móvil) y cuadrícula de artículos. */
import { motion } from 'motion/react';
import {
  Bell,
  BellOff,
  ClipboardCheck,
  Eye,
  MapPin,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Truck,
  Undo2,
} from 'lucide-react';
import { navigate } from '@/app/router';
import { Button, DataTable, DropdownMenu, Highlight, IconButton, MoneyText, cx, usePrefersReducedMotion, type Column, type MenuItem } from '@/ui';
import { EXPENSE_CATEGORY_LABEL, stockStatus, type InventoryItem } from '@/data';
import { deleteItem, openAction, toggleOrdered, toggleReorder } from './actions';
import { compatLabel } from './lib';
import { ItemThumb, StockBadge, StockMeter } from './parts';
import styles from './inventario.module.css';

/* ------------------------------ Menú por fila ----------------------------- */

export function itemMenu(item: InventoryItem, o: { detail?: boolean } = {}): MenuItem[] {
  const pedido = item.pedidoAt != null;
  const showFlag = !pedido && (item.marcadoReorden || item.stock > item.stockMinimo);
  const items: MenuItem[] = [];
  if (!o.detail) {
    items.push({ label: 'Ver ficha', icon: <Eye />, onSelect: () => navigate(`#/inventario/${item.id}`) });
    items.push({ type: 'separator' });
  }
  items.push(
    { label: 'Usar', icon: <Minus />, disabled: item.stock <= 0, onSelect: () => openAction('usar', item) },
    { label: pedido ? 'Recibir pedido' : 'Reponer', icon: pedido ? <Truck /> : <Plus />, onSelect: () => openAction(pedido ? 'recibir' : 'reponer', item) },
    { type: 'separator' },
    pedido
      ? { label: 'Quitar pedido', icon: <Undo2 />, onSelect: () => void toggleOrdered(item, false) }
      : { label: 'Marcar como pedido', icon: <Truck />, onSelect: () => void toggleOrdered(item, true) },
  );
  if (showFlag)
    items.push(
      item.marcadoReorden
        ? { label: 'Quitar de Por pedir', icon: <BellOff />, onSelect: () => void toggleReorder(item, false) }
        : { label: 'Volver a pedir', description: 'Agregar a la lista aunque haya stock', icon: <Bell />, onSelect: () => void toggleReorder(item, true) },
    );
  items.push(
    { type: 'separator' },
    { label: 'Ajustar conteo', icon: <ClipboardCheck />, onSelect: () => openAction('ajustar', item) },
    { label: 'Registrar merma', icon: <Trash2 />, disabled: item.stock <= 0, onSelect: () => openAction('merma', item) },
    { label: 'Editar', icon: <Pencil />, onSelect: () => navigate(`#/inventario/${item.id}?editar=1`) },
    { type: 'separator' },
    { label: 'Eliminar', icon: <Trash2 />, danger: true, onSelect: () => void deleteItem(item) },
  );
  return items;
}

export function RowActions({ item, compact }: { item: InventoryItem; compact?: boolean }) {
  const pedido = item.pedidoAt != null;
  return (
    <div className={cx(styles.rowActions, compact && styles.rowActionsCompact)}>
      {pedido ? (
        <Button size="sm" variant="secondary" iconLeft={<Truck />} onClick={() => openAction('recibir', item)}>
          Recibir
        </Button>
      ) : (
        <>
          <Button size="sm" variant="secondary" iconLeft={<Minus />} disabled={item.stock <= 0} onClick={() => openAction('usar', item)} aria-label={`Usar ${item.nombre}`}>
            Usar
          </Button>
          <Button size="sm" variant="ghost" iconLeft={<Plus />} onClick={() => openAction('reponer', item)} aria-label={`Reponer ${item.nombre}`}>
            {compact ? null : 'Reponer'}
          </Button>
        </>
      )}
      <DropdownMenu trigger={<IconButton icon={<MoreHorizontal />} label="Más acciones" size="sm" tooltip={false} />} items={itemMenu(item)} align="end" width={232} label={`Acciones de ${item.nombre}`} />
    </div>
  );
}

function NameCell({ item, q }: { item: InventoryItem; q: string }) {
  const compat = compatLabel(item);
  return (
    <div className={styles.nameCell}>
      <ItemThumb categoria={item.categoria} size={40} />
      <div className={styles.nameText}>
        <a
          className={styles.nameLink}
          href={`#/inventario/${item.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Highlight text={item.nombre} query={q} />
        </a>
        <span className={styles.nameSub}>
          {compat ? <Highlight text={compat} query={q} /> : <span className={styles.muted}>{EXPENSE_CATEGORY_LABEL[item.categoria]}</span>}
          {item.sku && (
            <span className={styles.sku}>
              <Highlight text={item.sku} query={q} />
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------- Tabla --------------------------------- */

export interface InventoryListProps {
  rows: InventoryItem[] | undefined;
  q: string;
  view: 'lista' | 'cuadricula';
  mobile: boolean;
  empty: React.ReactNode;
}

const STATUS_ORDER = { agotado: 0, bajo: 1, pedido: 2, ok: 3 } as const;

export function InventoryList({ rows, q, view, mobile, empty }: InventoryListProps) {
  if (view === 'cuadricula' && rows && rows.length) return <InventoryGrid rows={rows} q={q} />;
  if (mobile) return <InventoryCards rows={rows} q={q} empty={empty} />;

  const columns: Column<InventoryItem>[] = [
    { key: 'nombre', header: 'Artículo', cell: (i) => <NameCell item={i} q={q} />, sortValue: (i) => i.nombre },
    {
      key: 'ubicacion',
      header: 'Ubicación',
      hideBelow: 'lg',
      width: 140,
      cell: (i) => (i.ubicacion ? <span className={styles.location}><MapPin aria-hidden />{i.ubicacion}</span> : <span className={styles.muted}>—</span>),
      sortValue: (i) => i.ubicacion || null,
    },
    { key: 'stock', header: 'Stock', width: 168, cell: (i) => <StockMeter item={i} size="sm" />, sortValue: (i) => i.stock - i.stockMinimo },
    {
      key: 'costo',
      header: 'Costo unit.',
      align: 'right',
      width: 116,
      hideBelow: 'xl',
      cell: (i) => <MoneyText cents={i.costoUnitarioCents} tone={i.costoUnitarioCents ? 'neutral' : 'muted'} />,
      sortValue: (i) => i.costoUnitarioCents,
      defaultDir: 'desc',
    },
    { key: 'estado', header: 'Estado', width: 128, cell: (i) => <StockBadge item={i} />, sortValue: (i) => STATUS_ORDER[stockStatus(i)] },
    { key: 'acciones', header: <span className="sr-only">Acciones</span>, align: 'right', width: 214, cell: (i) => <RowActions item={i} /> },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={(i) => i.id}
      onRowClick={(i) => navigate(`#/inventario/${i.id}`)}
      rowAccent={(i) => {
        const s = stockStatus(i);
        return s === 'agotado' ? 'var(--danger)' : s === 'bajo' ? 'var(--warning)' : undefined;
      }}
      empty={empty}
      caption="Artículos del inventario"
      skeletonRows={8}
    />
  );
}

/* --------------------------------- Móvil ---------------------------------- */

function InventoryCards({ rows, q, empty }: { rows: InventoryItem[] | undefined; q: string; empty: React.ReactNode }) {
  const reduced = usePrefersReducedMotion();
  if (rows === undefined) {
    return (
      <div className={styles.cards} aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={cx(styles.card, styles.cardSkeleton)} />
        ))}
      </div>
    );
  }
  if (!rows.length) return <>{empty}</>;
  return (
    <ul className={styles.cards} aria-label="Artículos del inventario">
      {rows.map((i, n) => {
        const s = stockStatus(i);
        return (
          <motion.li
            key={i.id}
            className={styles.card}
            data-status={s}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: Math.min(n, 8) * 0.025 }}
          >
            <a href={`#/inventario/${i.id}`} className={styles.cardMain}>
              <ItemThumb categoria={i.categoria} size={44} />
              <span className={styles.cardText}>
                <span className={styles.cardName}>
                  <Highlight text={i.nombre} query={q} />
                </span>
                <span className={styles.cardSub}>{[compatLabel(i), i.ubicacion].filter(Boolean).join(' · ') || EXPENSE_CATEGORY_LABEL[i.categoria]}</span>
              </span>
              <StockBadge item={i} showFlag={false} />
            </a>
            <div className={styles.cardBottom}>
              <StockMeter item={i} size="sm" className={styles.cardMeter} />
              <RowActions item={i} compact />
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}

/* -------------------------------- Cuadrícula ------------------------------- */

function InventoryGrid({ rows, q }: { rows: InventoryItem[]; q: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <ul className={styles.grid} aria-label="Artículos del inventario">
      {rows.map((i, n) => (
        <motion.li
          key={i.id}
          className={styles.tile}
          data-status={stockStatus(i)}
          initial={reduced ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: Math.min(n, 12) * 0.02 }}
        >
          <a href={`#/inventario/${i.id}`} className={styles.tileLink}>
            <div className={styles.tileArt}>
              <ItemThumb categoria={i.categoria} size={88} />
              <span className={styles.tileBadge}>
                <StockBadge item={i} />
              </span>
            </div>
            <span className={styles.tileName}>
              <Highlight text={i.nombre} query={q} />
            </span>
            <span className={styles.tileSub}>{compatLabel(i) || EXPENSE_CATEGORY_LABEL[i.categoria]}</span>
          </a>
          <StockMeter item={i} size="sm" />
          <div className={styles.tileFoot}>
            <MoneyText cents={i.costoUnitarioCents} size="sm" tone={i.costoUnitarioCents ? 'neutral' : 'muted'} />
            <RowActions item={i} compact />
          </div>
        </motion.li>
      ))}
    </ul>
  );
}


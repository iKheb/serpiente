import { openExternal } from '@/app/external';
/* Vista "Por pedir" como lista de compras agrupada por proveedor + pedidos en camino. */
import { useMemo } from 'react';
import { motion } from 'motion/react';
import { Check, CheckCheck, ClipboardCopy, MessageCircle, PartyPopper, Truck, Undo2 } from 'lucide-react';
import { Avatar, Badge, Button, DateTimeText, EmptyState, IconButton, MoneyText, NumberStepper, Skeleton, Tooltip, cx, toast, useLocalState, usePrefersReducedMotion } from '@/ui';
import { needsReorder, useSettings, whatsappUrl, type InventoryItem } from '@/data';
import { markManyOrdered, openAction, toggleOrdered } from './actions';
import { NO_SUPPLIER, buildOrderText, compatLabel, copyText, groupBySupplier, plural, suggestedQty, type OrderGroup, type OrderLine } from './lib';
import { CategoryIcon } from '../gastos/categories';
import styles from './inventario.module.css';

const QTY_KEY = 'reparo.inventario.cantidadesPedido';

function useOrderQty() {
  const [map, setMap] = useLocalState<Record<string, number>>(QTY_KEY, {});
  return {
    get: (i: InventoryItem) => (map[i.id] ?? suggestedQty(i)),
    set: (i: InventoryItem, n: number) => setMap({ ...map, [i.id]: n }),
  };
}

function openWhatsApp(text: string, countryCode: string) {
  openExternal(whatsappUrl('', text, countryCode));
}

export interface ShoppingListProps {
  items: InventoryItem[] | undefined;
  /** Sólo pedidos en camino (pestaña "Pedidos"). */
  onlyOrdered?: boolean;
  q?: string;
}

export function ShoppingList({ items, onlyOrdered }: ShoppingListProps) {
  const settings = useSettings();
  const qty = useOrderQty();
  const reduced = usePrefersReducedMotion();

  const porPedir = useMemo(() => (items ?? []).filter(needsReorder), [items]);
  const enCamino = useMemo(() => (items ?? []).filter((i) => i.pedidoAt != null).sort((a, b) => (a.pedidoAt ?? 0) - (b.pedidoAt ?? 0)), [items]);
  const lines: OrderLine[] = porPedir.map((i) => ({ item: i, qty: qty.get(i) }));
  const groups = groupBySupplier(lines);
  const active = lines.filter((l) => l.qty > 0);
  const total = active.reduce((s, l) => s + l.qty * l.item.costoUnitarioCents, 0);
  const piezas = active.reduce((s, l) => s + l.qty, 0);
  const proveedores = new Set(active.map((l) => l.item.proveedor.trim() || NO_SUPPLIER)).size;
  const business = settings?.businessName?.trim() || undefined;
  const cc = settings?.phoneCountryCode ?? '52';

  if (items === undefined) {
    return (
      <div className={styles.shop}>
        <Skeleton height={132} radius={14} />
        <Skeleton height={220} radius={14} />
      </div>
    );
  }

  const copyAll = async () => {
    const ok = await copyText(buildOrderText(groups, { businessName: business }));
    if (ok) toast.success('Lista copiada', { description: `${plural(active.length, 'artículo', 'artículos')} · listo para pegar donde quieras` });
    else toast.error('No se pudo copiar la lista');
  };

  const enCaminoSection = enCamino.length > 0 && (
    <section className={styles.shopSection} aria-labelledby="inv-encamino">
      <div className={styles.shopSectionHead}>
        <h2 id="inv-encamino" className={styles.shopSectionTitle}>
          <Truck aria-hidden /> En camino <span className={styles.count}>{enCamino.length}</span>
        </h2>
        <p className={styles.shopSectionDesc}>Pedidos al proveedor. Recíbelos cuando lleguen para sumarlos al stock.</p>
      </div>
      <ul className={styles.orderList}>
        {enCamino.map((i) => (
          <li key={i.id} className={styles.orderRow}>
            <a href={`#/inventario/${i.id}`} className={styles.orderMain}>
              <CategoryIcon categoria={i.categoria} />
              <span className={styles.lineText}>
                <span className={styles.lineName}>{i.nombre}</span>
                <span className={styles.lineSub}>
                  {i.proveedor || NO_SUPPLIER} · Pedido <DateTimeText value={i.pedidoAt!} variant="relative-datetime" />
                </span>
              </span>
            </a>
            <span className={styles.orderStock}>
              Stock <strong>{i.stock}</strong>
            </span>
            <div className={styles.lineActions}>
              <Button size="sm" variant="primary" iconLeft={<Truck />} onClick={() => openAction('recibir', i, { cantidad: qty.get(i) })}>
                Recibir
              </Button>
              <IconButton icon={<Undo2 />} label="Quitar pedido" size="sm" onClick={() => void toggleOrdered(i, false)} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );

  if (onlyOrdered) {
    return enCamino.length ? (
      <div className={styles.shop}>{enCaminoSection}</div>
    ) : (
      <EmptyState icon={<Truck />} tone="neutral" title="No hay pedidos en camino" description="Cuando marques artículos como pedidos aparecerán aquí hasta que los recibas." />
    );
  }

  return (
    <div className={styles.shop}>
      {porPedir.length === 0 ? (
        <EmptyState
          icon={<PartyPopper />}
          tone="success"
          title="Todo en orden"
          description="No hay repuestos por pedir. Cuando un artículo llegue a su mínimo o lo marques para volver a pedir, aparecerá aquí."
        />
      ) : (
        <>
          <div className={styles.shopSummary}>
            <div className={styles.shopSummaryText}>
              <span className={styles.eyebrow}>Lista de compras</span>
              <div className={styles.shopTotal}>
                <MoneyText cents={total} size="xl" weight="semibold" />
                <span className={styles.shopTotalLabel}>total estimado</span>
              </div>
              <span className={styles.shopStats}>
                {plural(active.length, 'artículo', 'artículos')} · {plural(piezas, 'pieza', 'piezas')} · {plural(proveedores, 'proveedor', 'proveedores')}
              </span>
            </div>
            <div className={styles.shopActions}>
              <Button iconLeft={<ClipboardCopy />} onClick={() => void copyAll()} disabled={!active.length}>
                Copiar lista
              </Button>
              <Button iconLeft={<MessageCircle />} onClick={() => openWhatsApp(buildOrderText(groups, { businessName: business }), cc)} disabled={!active.length}>
                Enviar por WhatsApp
              </Button>
              <Button variant="primary" iconLeft={<CheckCheck />} onClick={() => void markManyOrdered(active.map((l) => l.item))} disabled={!active.length}>
                Marcar todo como pedido
              </Button>
            </div>
          </div>

          {groups.map((g, gi) => (
            <motion.section
              key={g.proveedor}
              className={styles.supplier}
              aria-label={`Proveedor ${g.proveedor}`}
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.26, delay: gi * 0.05 }}
            >
              <SupplierHeader group={g} business={business} cc={cc} />
              <ul className={styles.lines}>
                {g.lines.map((l) => (
                  <OrderLineRow key={l.item.id} line={l} onQty={(n) => qty.set(l.item, n)} />
                ))}
              </ul>
            </motion.section>
          ))}
        </>
      )}
      {enCaminoSection}
    </div>
  );
}

function SupplierHeader({ group: g, business, cc }: { group: OrderGroup; business?: string; cc: string }) {
  const activeLines = g.lines.filter((l) => l.qty > 0);
  return (
    <header className={styles.supplierHead}>
      <div className={styles.supplierId}>
        <Avatar name={g.proveedor} size="sm" />
        <div className={styles.supplierText}>
          <h3 className={styles.supplierName}>{g.proveedor}</h3>
          <span className={styles.supplierMeta}>
            {plural(g.lines.length, 'artículo', 'artículos')} · {plural(g.piezas, 'pieza', 'piezas')}
          </span>
        </div>
      </div>
      <div className={styles.supplierSend}>
        <Tooltip content={`Enviar pedido a ${g.proveedor} por WhatsApp (sin costos)`}>
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<MessageCircle />}
            aria-label={`Enviar pedido a ${g.proveedor} por WhatsApp`}
            disabled={!activeLines.length}
            onClick={() => openWhatsApp(buildOrderText([g], { businessName: business, forSupplier: true }), cc)}
          >
            Enviar
          </Button>
        </Tooltip>
        <Tooltip content={`Marcar ${plural(activeLines.length, 'artículo', 'artículos')} de ${g.proveedor} como pedidos (pasan a «En camino»)`}>
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<CheckCheck />}
            aria-label={`Marcar todo lo de ${g.proveedor} como pedido`}
            disabled={!activeLines.length}
            onClick={() => void markManyOrdered(activeLines.map((l) => l.item))}
          >
            Marcar pedido
          </Button>
        </Tooltip>
      </div>
      <div className={styles.supplierTotal}>
        <span className={styles.supplierTotalLabel}>Total</span>
        <MoneyText cents={g.totalCents} weight="semibold" />
      </div>
    </header>
  );
}

function OrderLineRow({ line, onQty }: { line: OrderLine; onQty: (n: number) => void }) {
  const { item: i, qty } = line;
  const compat = compatLabel(i);
  const low = i.stock <= 0 ? 'agotado' : i.stock <= i.stockMinimo ? 'bajo' : 'flag';
  return (
    <li className={cx(styles.line, qty === 0 && styles.lineOff)}>
      <a href={`#/inventario/${i.id}`} className={styles.lineMain}>
        <CategoryIcon categoria={i.categoria} />
        <span className={styles.lineText}>
          <span className={styles.lineName}>{i.nombre}</span>
          <span className={styles.lineSub}>
            <span className={styles.lineStock} data-tone={low}>
              {i.stock <= 0 ? 'Agotado' : `Quedan ${i.stock}`} · mín {i.stockMinimo}
            </span>
            {i.marcadoReorden && low === 'flag' && (
              <Badge tone="pending" size="sm">
                Marcado
              </Badge>
            )}
            <span className={styles.lineUnitInline}>
              <MoneyText cents={i.costoUnitarioCents} tone="muted" weight="regular" /> c/u
            </span>
            {compat && <span className={styles.hideSm}>{compat}</span>}
          </span>
        </span>
      </a>
      <div className={styles.lineQty}>
        <NumberStepper value={qty} onChange={onQty} min={0} max={9999} size="sm" />
      </div>
      <span className={styles.lineUnit}>
        × <MoneyText cents={i.costoUnitarioCents} tone="muted" weight="regular" />
      </span>
      <MoneyText cents={qty * i.costoUnitarioCents} weight="semibold" className={styles.lineTotal} tone={qty ? 'neutral' : 'muted'} />
      <div className={styles.lineActions}>
        <IconButton
          size="sm"
          variant="ghost"
          icon={<Check />}
          label={`Marcar ${i.nombre} como pedido`}
          disabled={qty === 0}
          onClick={() => void toggleOrdered(i, true)}
          className={styles.lineCheck}
        />
      </div>
    </li>
  );
}

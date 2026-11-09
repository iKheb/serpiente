/* Selector "Usar repuesto" (#/inventario?usar=1[&cliente=<id>]). */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PackageMinus, PackageSearch, Sparkles } from 'lucide-react';
import { Badge, Button, EmptyState, Highlight, NumberStepper, SearchField, Sheet, Skeleton, cx } from '@/ui';
import { normalizeText, useClient, useInventory, type Client, type ID, type InventoryItem } from '@/data';
import { consumeParts } from './actions';
import { ClientPicker } from './ClientPicker';
import { compatLabel, matchesItem } from './lib';
import { ItemThumb, StockBadge } from './parts';
import styles from './inventario.module.css';

function isCompatible(i: InventoryItem, c: Client | null | undefined): boolean {
  if (!c) return false;
  const modelo = normalizeText(c.modelo);
  if (modelo && normalizeText(i.modelo).split(',').some((m) => m.trim() && (m.trim() === modelo || modelo.includes(m.trim()) || m.trim().includes(modelo)))) return true;
  return false;
}

export interface UsePickerProps {
  open: boolean;
  clienteId: ID | null;
  onClose: () => void;
}

export function UsePicker({ open, clienteId: initialClient, onClose }: UsePickerProps) {
  const items = useInventory();
  const [clienteId, setClienteId] = useState<ID | null>(initialClient);
  const client = useClient(clienteId);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<ID | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setClienteId(initialClient);
    setQ('');
    setSelected(null);
    setCantidad(1);
  }, [open, initialClient]);

  const results = useMemo(() => {
    const list = (items ?? []).filter((i) => i.stock > 0 && matchesItem(i, q));
    return list
      .map((i) => ({ i, compat: isCompatible(i, client) }))
      .sort((a, b) => Number(b.compat) - Number(a.compat) || a.i.nombre.localeCompare(b.i.nombre, 'es'));
  }, [items, q, client]);

  const current = results.find((r) => r.i.id === selected)?.i ?? (items ?? []).find((i) => i.id === selected) ?? null;
  const sinStockTotal = items && items.length > 0 && items.every((i) => i.stock <= 0);

  useEffect(() => {
    if (current && cantidad > current.stock) setCantidad(Math.max(1, current.stock));
  }, [current, cantidad]);

  const move = (dir: 1 | -1) => {
    if (!results.length) return;
    const pos = results.findIndex((r) => r.i.id === selected);
    const next = pos === -1 ? (dir === 1 ? 0 : results.length - 1) : Math.min(results.length - 1, Math.max(0, pos + dir));
    const id = results[next].i.id;
    setSelected(id);
    listRef.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const submit = async () => {
    if (!current || busy) return;
    setBusy(true);
    const ok = await consumeParts(current, cantidad, { clienteId, clienteNombre: client?.nombre, backToClient: !!initialClient && clienteId === initialClient });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={() => !busy && onClose()}
      size="md"
      icon={<PackageMinus />}
      title="Usar repuesto"
      description="Elige la pieza que instalaste. Se descuenta del stock sin crear gasto."
      footer={
        <div className={styles.sheetFooter}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!current} loading={busy}>
            {current ? `Usar ${cantidad}` : 'Elige una pieza'}
          </Button>
        </div>
      }
    >
      <div className={styles.picker}>
        <ClientPicker value={clienteId} onChange={(id) => setClienteId(id)} label="Cliente / servicio" />
        <div className={styles.pickerSearch}>
          <SearchField
            value={q}
            onChange={setQ}
            placeholder="Buscar pieza, modelo o SKU…"
            label="Buscar pieza"
            fullWidth
            shortcut={false}
            autoFocus={!!initialClient}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                move(e.key === 'ArrowDown' ? 1 : -1);
              } else if (e.key === 'Enter' && current) {
                e.preventDefault();
                void submit();
              }
            }}
          />
        </div>
        {items === undefined ? (
          <div className={styles.pickList}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={styles.pickSkeleton}>
                <Skeleton width={36} height={36} radius={10} />
                <Skeleton width="50%" height={12} />
              </div>
            ))}
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<PackageSearch />}
            tone="neutral"
            title={sinStockTotal || !items.length ? 'No hay piezas en stock' : 'Sin coincidencias'}
            description={sinStockTotal || !items.length ? 'Repón tu inventario para poder usar piezas.' : `Ninguna pieza con stock coincide con «${q}».`}
          />
        ) : (
          <div ref={listRef} role="radiogroup" aria-label="Piezas con stock" className={styles.pickList}>
            {results.map(({ i, compat }) => {
              const on = i.id === selected;
              return (
                <button
                  key={i.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-id={i.id}
                  className={cx(styles.pickRow, on && styles.pickOn)}
                  onClick={() => setSelected(i.id)}
                  onDoubleClick={() => {
                    setSelected(i.id);
                    void submit();
                  }}
                >
                  <ItemThumb categoria={i.categoria} size={36} />
                  <span className={styles.pickText}>
                    <span className={styles.pickName}>
                      <Highlight text={i.nombre} query={q} />
                    </span>
                    <span className={styles.pickSub}>{[compatLabel(i), i.ubicacion].filter(Boolean).join(' · ') || 'Sin compatibilidad'}</span>
                  </span>
                  <span className={styles.pickMeta}>
                    {compat && (
                      <Badge tone="brand" size="sm" icon={<Sparkles />}>
                        Compatible
                      </Badge>
                    )}
                    <span className={styles.pickStock}>
                      <strong>{i.stock}</strong> en stock
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {current && (
          <div className={styles.pickQty}>
            <div className={styles.pickQtyText}>
              <span className={styles.pickQtyName}>{current.nombre}</span>
              <StockBadge item={current} />
            </div>
            <NumberStepper label="Cantidad" value={cantidad} onChange={setCantidad} min={1} max={current.stock} unit={cantidad === 1 ? 'pza' : 'pzas'} />
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* Diálogos de movimiento: Usar, Reponer/Recibir, Ajustar conteo y Merma. */
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ClipboardCheck, PackageMinus, PackagePlus, Trash2, Truck } from 'lucide-react';
import { Button, Dialog, FormGrid, Input, MoneyInput, NumberStepper, Select, Switch, toast, type DialogTone } from '@/ui';
import {
  MINUS,
  PAYMENT_METHOD_LABEL,
  adjustInventory,
  formatMoney,
  registerWaste,
  useInventoryItem,
  type Client,
  type ID,
  type InventoryItem,
  type PaymentMethod,
} from '@/data';
import { closeAction, consumeParts, restockParts, useActionState, type ActionKind } from './actions';
import { ClientPicker } from './ClientPicker';
import { compatLabel, errorMessage, plural, suggestedQty } from './lib';
import { ItemThumb } from './parts';
import styles from './inventario.module.css';

const METHODS = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }));

/** Monta el diálogo activo (uno a la vez). Se renderiza una sola vez en la página. */
export function ActionHost() {
  const st = useActionState();
  const item = useInventoryItem(st?.itemId ?? null);
  const [shown, setShown] = useState<{ kind: ActionKind; item: InventoryItem; cantidad?: number; seq: number } | null>(null);
  const open = !!st && !!item && item.deletedAt == null;

  useEffect(() => {
    if (st && item) setShown((s) => (s && s.seq === st.seq ? { ...s, item } : { kind: st.kind, item, cantidad: st.cantidad, seq: st.seq }));
  }, [st, item]);

  if (!shown) return null;
  const props = { open, item: shown.item, onClose: closeAction };
  const k = shown.seq;
  switch (shown.kind) {
    case 'usar':
      return <UseDialog key={k} {...props} />;
    case 'reponer':
    case 'recibir':
      return <RestockDialog key={k} {...props} recibir={shown.kind === 'recibir'} defaultQty={shown.cantidad} />;
    case 'ajustar':
      return <AdjustDialog key={k} {...props} />;
    case 'merma':
      return <WasteDialog key={k} {...props} />;
  }
}

interface BaseProps {
  open: boolean;
  item: InventoryItem;
  onClose: () => void;
}

function ItemSummary({ item, right }: { item: InventoryItem; right?: ReactNode }) {
  const compat = compatLabel(item);
  return (
    <div className={styles.dlgItem}>
      <ItemThumb categoria={item.categoria} size={40} />
      <div className={styles.dlgItemText}>
        <span className={styles.dlgItemName}>{item.nombre}</span>
        <span className={styles.dlgItemSub}>{[compat, item.ubicacion].filter(Boolean).join(' · ') || 'Sin compatibilidad'}</span>
      </div>
      {right}
    </div>
  );
}

function StockPreview({ from, to }: { from: number; to: number }) {
  const diff = to - from;
  return (
    <div className={styles.preview} aria-live="polite">
      <span className={styles.previewLabel}>Stock</span>
      <span className={styles.previewFrom}>{from}</span>
      <span className={styles.previewArrow} aria-hidden>
        →
      </span>
      <motion.span key={to} className={styles.previewTo} data-tone={to < from ? 'down' : to > from ? 'up' : 'flat'} initial={{ y: 4, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.2 }}>
        {to}
      </motion.span>
      {diff !== 0 && (
        <span className={styles.previewDiff} data-tone={diff < 0 ? 'down' : 'up'}>
          {diff > 0 ? '+' : MINUS}
          {Math.abs(diff)}
        </span>
      )}
    </div>
  );
}

function FormDialog({
  open,
  onClose,
  title,
  description,
  icon,
  tone,
  formId,
  submitLabel,
  busy,
  disabled,
  onSubmit,
  children,
  danger,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon: ReactNode;
  tone: DialogTone;
  formId: string;
  submitLabel: string;
  busy: boolean;
  disabled?: boolean;
  onSubmit: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  const handle = (e: FormEvent) => {
    e.preventDefault();
    if (!busy && !disabled) onSubmit();
  };
  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      title={title}
      description={description}
      icon={icon}
      tone={tone}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant={danger ? 'danger' : 'primary'} loading={busy} disabled={disabled}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={handle}
        className={styles.dlgForm}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handle(e);
        }}
      >
        {children}
      </form>
    </Dialog>
  );
}

/* --------------------------------- Usar --------------------------------- */

function UseDialog({ open, item, onClose }: BaseProps) {
  const formId = useId();
  const [cantidad, setCantidad] = useState(1);
  const [cliente, setCliente] = useState<{ id: ID | null; c: Client | null }>({ id: null, c: null });
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const max = Math.max(1, item.stock);
  const sinStock = item.stock <= 0;

  const submit = async () => {
    setBusy(true);
    const ok = await consumeParts(item, cantidad, { clienteId: cliente.id, clienteNombre: cliente.c?.nombre, nota });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Usar repuesto"
      description="Descuenta la pieza del stock. No crea gasto: ya se contó al comprarla."
      icon={<PackageMinus />}
      tone="brand"
      formId={formId}
      submitLabel={sinStock ? 'Sin stock' : `Usar ${cantidad}`}
      busy={busy}
      disabled={sinStock}
      onSubmit={submit}
    >
      <ItemSummary item={item} />
      <FormGrid columns={2}>
        <NumberStepper label="Cantidad" value={cantidad} onChange={setCantidad} min={1} max={max} unit={cantidad === 1 ? 'pza' : 'pzas'} disabled={sinStock} fullWidth />
        <StockPreview from={item.stock} to={Math.max(0, item.stock - cantidad)} />
      </FormGrid>
      <ClientPicker value={cliente.id} onChange={(id, c) => setCliente({ id, c })} />
      <Input label="Nota" optional placeholder="Ej. garantía, pieza de reemplazo…" value={nota} onValueChange={setNota} maxLength={200} />
      {item.stock - cantidad <= item.stockMinimo && !sinStock && (
        <p className={styles.dlgNote} data-tone="warning">
          {item.stock - cantidad <= 0 ? 'Se agotará' : 'Llegará al mínimo'} y se agregará a «Por pedir».
        </p>
      )}
    </FormDialog>
  );
}

/* --------------------------- Reponer / Recibir --------------------------- */

function RestockDialog({ open, item, onClose, recibir, defaultQty }: BaseProps & { recibir?: boolean; defaultQty?: number }) {
  const formId = useId();
  const [cantidad, setCantidad] = useState(() => Math.max(1, defaultQty ?? suggestedQty(item)));
  const [costo, setCosto] = useState(item.costoUnitarioCents);
  const [gasto, setGasto] = useState(true);
  const [metodo, setMetodo] = useState<PaymentMethod>('efectivo');
  const [busy, setBusy] = useState(false);
  const total = cantidad * costo;

  const submit = async () => {
    setBusy(true);
    const ok = await restockParts(item, { cantidad, costoUnitarioCents: costo, registrarGasto: gasto, metodoPago: metodo, recibir });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={recibir ? 'Recibir pedido' : 'Reponer stock'}
      description={recibir ? 'Suma al stock lo que llegó del proveedor y quita la marca de pedido.' : 'Suma unidades compradas al stock.'}
      icon={recibir ? <Truck /> : <PackagePlus />}
      tone="success"
      formId={formId}
      submitLabel={`${recibir ? 'Recibir' : 'Reponer'} ${cantidad}`}
      busy={busy}
      onSubmit={submit}
    >
      <ItemSummary item={item} />
      <FormGrid columns={2}>
        <NumberStepper label="Cantidad" value={cantidad} onChange={setCantidad} min={1} max={100000} unit={cantidad === 1 ? 'pza' : 'pzas'} fullWidth />
        <MoneyInput label="Costo unitario" value={costo} onChange={setCosto} />
      </FormGrid>
      <StockPreview from={item.stock} to={item.stock + cantidad} />
      <div className={styles.switchBox}>
        <Switch
          checked={gasto}
          onChange={setGasto}
          label="Registrar como gasto"
          description={gasto ? `Se creará un gasto de ${formatMoney(total)} vinculado a este artículo.` : 'Sólo se sumará el stock (útil si ya registraste la compra).'}
        />
        <AnimatePresence initial={false}>
          {gasto && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
              <div className={styles.switchExtra}>
                <Select label="Método de pago" value={metodo} onChange={setMetodo} options={METHODS} size="sm" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </FormDialog>
  );
}

/* ---------------------------- Ajustar conteo ---------------------------- */

function AdjustDialog({ open, item, onClose }: BaseProps) {
  const formId = useId();
  const [nuevo, setNuevo] = useState(item.stock);
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await adjustInventory(item.id, { nuevoStock: nuevo, nota: nota || 'Conteo físico' });
      const d = nuevo - item.stock;
      toast.success(d === 0 ? `Conteo confirmado · ${item.nombre}` : `Conteo ajustado · ${item.nombre} · ${item.stock} → ${nuevo}`, {
        description: d === 0 ? `Hay ${plural(nuevo, 'unidad', 'unidades')}, sin diferencias.` : `Diferencia de ${d > 0 ? '+' : MINUS}${Math.abs(d)}`,
      });
      onClose();
    } catch (err) {
      toast.error('No se pudo ajustar', { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Ajustar conteo"
      description="Corrige el stock según lo que contaste físicamente."
      icon={<ClipboardCheck />}
      tone="info"
      formId={formId}
      submitLabel={nuevo === item.stock ? 'Confirmar conteo' : 'Guardar ajuste'}
      busy={busy}
      onSubmit={submit}
    >
      <ItemSummary item={item} />
      <FormGrid columns={2}>
        <NumberStepper label="Stock contado" value={nuevo} onChange={setNuevo} min={0} max={1000000} fullWidth />
        <StockPreview from={item.stock} to={nuevo} />
      </FormGrid>
      <Input label="Motivo" optional placeholder="Ej. conteo mensual, error de captura…" value={nota} onValueChange={setNota} maxLength={200} />
    </FormDialog>
  );
}

/* --------------------------------- Merma -------------------------------- */

function WasteDialog({ open, item, onClose }: BaseProps) {
  const formId = useId();
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const sinStock = item.stock <= 0;

  const submit = async () => {
    setBusy(true);
    try {
      const mv = await registerWaste(item.id, { cantidad, nota });
      toast.warning(`Merma registrada · ${item.nombre}`, {
        description: `${plural(cantidad, 'pieza', 'piezas')} · ${formatMoney(cantidad * item.costoUnitarioCents)} perdidos · quedan ${mv.stockDespues}`,
      });
      onClose();
    } catch (err) {
      toast.error('No se pudo registrar la merma', { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title="Registrar merma"
      description="Piezas dañadas, defectuosas o perdidas. Se descuentan del stock."
      icon={<Trash2 />}
      tone="danger"
      danger
      formId={formId}
      submitLabel={sinStock ? 'Sin stock' : `Descontar ${cantidad}`}
      busy={busy}
      disabled={sinStock}
      onSubmit={submit}
    >
      <ItemSummary item={item} />
      <FormGrid columns={2}>
        <NumberStepper label="Cantidad" value={cantidad} onChange={setCantidad} min={1} max={Math.max(1, item.stock)} disabled={sinStock} fullWidth />
        <StockPreview from={item.stock} to={Math.max(0, item.stock - cantidad)} />
      </FormGrid>
      <Input label="Motivo" optional placeholder="Ej. llegó defectuosa, se rompió al instalar…" value={nota} onValueChange={setNota} maxLength={200} />
      {item.costoUnitarioCents > 0 && (
        <p className={styles.dlgNote} data-tone="danger">
          Pérdida estimada: <strong className="tabular-nums">{formatMoney(cantidad * item.costoUnitarioCents)}</strong>
        </p>
      )}
    </FormDialog>
  );
}

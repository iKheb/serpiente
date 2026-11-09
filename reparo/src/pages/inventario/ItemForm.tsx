/* Formulario de alta/edición de artículo (Sheet). */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { PackagePlus, Pencil } from 'lucide-react';
import { navigate } from '@/app/router';
import {
  Button,
  Combobox,
  Field,
  FormGrid,
  FormSection,
  Input,
  Kbd,
  MoneyInput,
  NumberStepper,
  Select,
  Sheet,
  Switch,
  Textarea,
  confirm,
  cx,
  isApple,
  toast,
} from '@/ui';
import {
  DEVICE_BRANDS,
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  ValidationError,
  createInventoryItem,
  emptyInventoryInput,
  formatMoney,
  formatPercent,
  updateInventoryItem,
  useClients,
  useExpenses,
  useInventory,
  validateInventoryInput,
  type ExpenseCategory,
  type InventoryItem,
  type InventoryItemInput,
  type PaymentMethod,
} from '@/data';
import { CATEGORY_SHORT, errorMessage, uniqueSorted } from './lib';
import { ItemThumb } from './parts';
import styles from './inventario.module.css';

const METHODS = (Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }));

function inputFrom(item: InventoryItem | null | undefined): InventoryItemInput {
  const e = emptyInventoryInput();
  if (!item) return e;
  const out = { ...e } as Record<string, unknown>;
  for (const k of Object.keys(e)) out[k] = (item as unknown as Record<string, unknown>)[k] ?? (e as unknown as Record<string, unknown>)[k];
  return out as unknown as InventoryItemInput;
}

export interface ItemFormProps {
  open: boolean;
  /** Artículo a editar (undefined mientras carga; null = alta). */
  item: InventoryItem | null | undefined;
  onClose: () => void;
}

export function ItemForm({ open, item, onClose }: ItemFormProps) {
  const editing = !!item;
  const [input, setInput] = useState<InventoryItemInput>(() => inputFrom(item));
  const [initial, setInitial] = useState(() => JSON.stringify(inputFrom(item)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [registrarGasto, setRegistrarGasto] = useState(true);
  const [metodo, setMetodo] = useState<PaymentMethod>('efectivo');
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  // Reinicia el formulario cada vez que se abre (o cuando llega el artículo a editar).
  useEffect(() => {
    if (!open) return;
    const next = inputFrom(item);
    setInput(next);
    setInitial(JSON.stringify(next));
    setErrors({});
    setRegistrarGasto(true);
    setMetodo('efectivo');
    const t = setTimeout(() => nameRef.current?.focus(), 260);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const inventory = useInventory();
  const expenses = useExpenses();
  const clients = useClients();

  const proveedores = useMemo(() => uniqueSorted([...(inventory ?? []).map((i) => i.proveedor), ...(expenses ?? []).map((e) => e.proveedor)]), [inventory, expenses]);
  const ubicaciones = useMemo(() => uniqueSorted((inventory ?? []).map((i) => i.ubicacion)), [inventory]);
  const modelos = useMemo(() => {
    const brand = input.marca.trim().toLowerCase();
    const same = (m: string) => !brand || m.trim().toLowerCase() === brand;
    return uniqueSorted([
      ...(clients ?? []).filter((c) => same(c.marca)).map((c) => c.modelo),
      ...(inventory ?? []).filter((i) => same(i.marca)).flatMap((i) => i.modelo.split(',')),
    ]);
  }, [clients, inventory, input.marca]);

  const dirty = JSON.stringify(input) !== initial;
  const set = <K extends keyof InventoryItemInput>(k: K, v: InventoryItemInput[K]) => {
    setInput((s) => ({ ...s, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k as string]: '' }));
  };

  const requestClose = async () => {
    if (busy) return;
    if (dirty && !(await confirm({ title: '¿Descartar los cambios?', description: 'Hay datos sin guardar en este formulario.', tone: 'warning', confirmLabel: 'Descartar', cancelLabel: 'Seguir editando' }))) return;
    onClose();
  };

  const focusFirstError = () =>
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const errs = validateInventoryInput(input);
    if (Object.keys(errs).length) {
      setErrors(errs);
      focusFirstError();
      return;
    }
    setBusy(true);
    try {
      if (item) {
        const updated = await updateInventoryItem(item.id, input);
        toast.success('Cambios guardados', { description: updated.nombre });
      } else {
        const gasto = registrarGasto && input.stock > 0 && input.costoUnitarioCents > 0;
        const created = await createInventoryItem(input, { registrarGasto: gasto, metodoPago: metodo });
        toast.success(`Artículo agregado · ${created.nombre}`, {
          description: gasto ? `Se registró un gasto de ${formatMoney(input.stock * input.costoUnitarioCents)}` : `${created.stock} en stock`,
          action: { label: 'Ver ficha', onClick: () => navigate(`#/inventario/${created.id}`) },
        });
      }
      setInitial(JSON.stringify(input));
      onClose();
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(err.fields);
        focusFirstError();
      }
      toast.error('No se pudo guardar', { description: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const margen = input.precioVentaCents > 0 ? (input.precioVentaCents - input.costoUnitarioCents) / input.precioVentaCents : null;
  const ganancia = input.precioVentaCents - input.costoUnitarioCents;
  const compraTotal = input.stock * input.costoUnitarioCents;
  const stockChanged = item && input.stock !== item.stock;

  return (
    <Sheet
      open={open}
      onClose={() => void requestClose()}
      dismissible={!busy}
      size="lg"
      icon={editing ? <Pencil /> : <PackagePlus />}
      title={editing ? 'Editar artículo' : 'Nuevo artículo'}
      description={editing ? item?.nombre : 'Agrega un repuesto o consumible a tu inventario.'}
      footer={
        <div className={styles.sheetFooter}>
          <span className={styles.footerHint}>
            <Kbd size="sm">{isApple ? '⌘' : 'Ctrl'}</Kbd>
            <Kbd size="sm">↵</Kbd> para guardar
          </span>
          <Button variant="ghost" onClick={() => void requestClose()} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" form="inventario-form" variant="primary" loading={busy}>
            {editing ? 'Guardar cambios' : 'Agregar artículo'}
          </Button>
        </div>
      }
    >
      <form
        id="inventario-form"
        ref={formRef}
        noValidate
        onSubmit={submit}
        className={styles.form}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      >
        <FormSection title="Artículo">
          <Input
            ref={nameRef}
            label="Nombre"
            required
            placeholder="Ej. Pantalla OLED iPhone 13"
            value={input.nombre}
            onValueChange={(v) => set('nombre', v)}
            error={errors.nombre}
            maxLength={160}
          />
          <CategoryPicker value={input.categoria} onChange={(v) => set('categoria', v)} error={errors.categoria} />
        </FormSection>

        <FormSection title="Compatibilidad" description="Con qué equipos funciona. Ayuda a encontrarlo al reparar.">
          <FormGrid columns={2}>
            <Combobox label="Marca" optional value={input.marca} onChange={(v) => set('marca', v)} options={DEVICE_BRANDS} placeholder="Apple, Samsung…" error={errors.marca} />
            <Combobox label="Modelo(s)" optional value={input.modelo} onChange={(v) => set('modelo', v)} options={modelos} placeholder="iPhone 12, iPhone 12 Pro" error={errors.modelo} />
            <Input label="SKU / código" optional placeholder="PAN-IP13-OLED" value={input.sku} onValueChange={(v) => set('sku', v.toUpperCase())} error={errors.sku} className="mono" maxLength={60} />
          </FormGrid>
        </FormSection>

        <FormSection title="Existencias" description="El artículo pasa a «Por pedir» cuando el stock llega al mínimo.">
          <FormGrid columns={3}>
            <NumberStepper
              label={editing ? 'Stock actual' : 'Stock inicial'}
              value={input.stock}
              onChange={(v) => set('stock', v)}
              min={0}
              max={1000000}
              error={errors.stock}
              hint={stockChanged ? 'Se registrará un ajuste de conteo.' : undefined}
              fullWidth
            />
            <NumberStepper label="Stock mínimo" value={input.stockMinimo} onChange={(v) => set('stockMinimo', v)} min={0} max={1000000} error={errors.stockMinimo} fullWidth />
            <NumberStepper label="Cantidad a pedir" value={input.cantidadPedido} onChange={(v) => set('cantidadPedido', v)} min={0} max={1000000} error={errors.cantidadPedido} fullWidth />
          </FormGrid>
        </FormSection>

        <FormSection title="Costo y precio">
          <FormGrid columns={2}>
            <MoneyInput label="Costo unitario" hint="Lo que te cuesta cada pieza." value={input.costoUnitarioCents} onChange={(v) => set('costoUnitarioCents', v)} error={errors.costoUnitarioCents} />
            <MoneyInput label="Precio sugerido al cliente" optional hint="Por pieza instalada." value={input.precioVentaCents} onChange={(v) => set('precioVentaCents', v)} error={errors.precioVentaCents} />
          </FormGrid>
          <div className={styles.marginBar} data-tone={margen == null ? 'muted' : ganancia > 0 ? 'good' : 'bad'} aria-live="polite">
            <span className={styles.marginLabel}>Margen</span>
            <span className={styles.marginValue}>{margen == null ? '—' : formatPercent(margen)}</span>
            <span className={styles.marginText}>
              {margen == null
                ? 'Agrega un precio sugerido para ver tu margen por pieza.'
                : ganancia > 0
                  ? `Ganas ${formatMoney(ganancia)} por pieza`
                  : ganancia === 0
                    ? 'Sin ganancia: precio igual al costo'
                    : `Pierdes ${formatMoney(-ganancia)} por pieza`}
            </span>
          </div>
        </FormSection>

        <FormSection title="Proveedor y ubicación">
          <FormGrid columns={2}>
            <Combobox label="Proveedor" optional value={input.proveedor} onChange={(v) => set('proveedor', v)} options={proveedores} placeholder="¿A quién se lo compras?" error={errors.proveedor} />
            <Combobox label="Ubicación" optional value={input.ubicacion} onChange={(v) => set('ubicacion', v)} options={ubicaciones} placeholder="Cajón A1, vitrina…" error={errors.ubicacion} />
          </FormGrid>
          <Textarea label="Notas" optional minRows={2} placeholder="Calidad, garantía del proveedor, observaciones…" value={input.notas} onValueChange={(v) => set('notas', v)} error={errors.notas} maxLength={4000} />
        </FormSection>

        {!editing && (
          <FormSection title="Compra">
            <div className={styles.switchBox}>
              <Switch
                checked={registrarGasto && input.stock > 0}
                onChange={setRegistrarGasto}
                disabled={input.stock <= 0}
                label="Registrar la compra como gasto"
                description={
                  input.stock <= 0
                    ? 'Sin stock inicial no hay compra que registrar.'
                    : input.costoUnitarioCents <= 0
                      ? 'Captura el costo unitario para registrar el gasto.'
                      : registrarGasto
                        ? `Se creará un gasto de ${formatMoney(compraTotal)} (${input.stock} × ${formatMoney(input.costoUnitarioCents)}) con fecha de hoy.`
                        : 'El stock se agregará sin crear un gasto.'
                }
              />
              <AnimatePresence initial={false}>
                {registrarGasto && input.stock > 0 && input.costoUnitarioCents > 0 && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}>
                    <div className={styles.switchExtra}>
                      <Select label="Método de pago" value={metodo} onChange={setMetodo} options={METHODS} size="sm" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </FormSection>
        )}
      </form>
    </Sheet>
  );
}

function CategoryPicker({ value, onChange, error }: { value: ExpenseCategory; onChange: (v: ExpenseCategory) => void; error?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = EXPENSE_CATEGORIES.indexOf(value);
  return (
    <Field label="Categoría" labelAs="span" labelId="inv-cat-label" error={error} className={styles.catField}>
      <div
        role="radiogroup"
        aria-labelledby="inv-cat-label"
        className={styles.catGrid}
        onKeyDown={(e) => {
          const dirs: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
          if (!(e.key in dirs)) return;
          e.preventDefault();
          const n = EXPENSE_CATEGORIES.length;
          const next = (idx + dirs[e.key] + n) % n;
          onChange(EXPENSE_CATEGORIES[next]);
          refs.current[next]?.focus();
        }}
      >
        {EXPENSE_CATEGORIES.map((c, i) => {
          const on = c === value;
          return (
            <button
              key={c}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              title={EXPENSE_CATEGORY_LABEL[c]}
              className={cx(styles.catOption, on && styles.catOn)}
              onClick={() => onChange(c)}
            >
              <ItemThumb categoria={c} size={30} />
              <span>{CATEGORY_SHORT[c]}</span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

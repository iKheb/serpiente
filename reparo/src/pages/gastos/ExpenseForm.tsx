import { useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Package, PackagePlus, Receipt, Store, User, X } from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
  ValidationError,
  createExpense,
  deviceFullName,
  formatFolio,
  formatMoney,
  formatNumber,
  normalizeText,
  restockInventory,
  updateExpense,
  validateExpenseInput,
  type Client,
  type Expense,
  type ExpenseCategory,
  type ExpenseInput,
  type ID,
  type InventoryItem,
  type PaymentMethod,
} from '@/data';
import {
  Button,
  Combobox,
  DateTimeInput,
  FormGrid,
  FormSection,
  IconButton,
  Kbd,
  MoneyInput,
  NumberStepper,
  RadioCards,
  SegmentedControl,
  Sheet,
  SHEET_SIDE_QUERY,
  Switch,
  Textarea,
  confirm,
  toast,
  useMediaQuery,
  type ComboboxOption,
} from '@/ui';
import { CategoryIcon } from './categories';
import styles from './gastos.module.css';

const FORM_ID = 'gasto-form';
const METHODS: PaymentMethod[] = ['efectivo', 'transferencia', 'tarjeta', 'otro'];

export interface ExpenseFormSheetProps {
  open: boolean;
  mode: 'create' | 'edit';
  /** Gasto que se edita (modo edit). */
  expenseId?: ID;
  initial: ExpenseInput;
  expenses: readonly Expense[];
  clients: readonly Client[];
  inventory: readonly InventoryItem[];
  weekStartsOn: 0 | 1;
  onClose: () => void;
  onSaved: (expense: Expense, mode: 'create' | 'edit') => void;
}

function clientLabel(c: Client) {
  return c.nombre.trim() || 'Cliente sin nombre';
}

export function ExpenseFormSheet({ open, mode, expenseId, initial, expenses, clients, inventory, weekStartsOn, onClose, onSaved }: ExpenseFormSheetProps) {
  const side = useMediaQuery(SHEET_SIDE_QUERY);
  const [v, setV] = useState<ExpenseInput>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [restock, setRestock] = useState(true);
  const initialClient = initial.clienteId ? clients.find((c) => c.id === initial.clienteId) : undefined;
  const [clientText, setClientText] = useState('');
  const initialRef = useRef(JSON.stringify(initial));
  const formRef = useRef<HTMLFormElement | null>(null);

  const set = <K extends keyof ExpenseInput>(k: K, val: ExpenseInput[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k as string]: '' }));
  };

  const itemsById = useMemo(() => new Map(inventory.map((i) => [i.id, i])), [inventory]);
  const itemsByName = useMemo(() => new Map(inventory.map((i) => [normalizeText(i.nombre), i])), [inventory]);
  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const linkedItem = v.inventarioId ? itemsById.get(v.inventarioId) : undefined;
  const linkedClient = v.clienteId ? (clientsById.get(v.clienteId) ?? initialClient) : undefined;
  const canRestock = mode === 'create' && !!linkedItem;
  const willRestock = canRestock && restock;

  /* ---------------------------- Sugerencias ---------------------------- */
  const conceptOptions = useMemo<ComboboxOption[]>(() => {
    const out: ComboboxOption[] = [];
    const seen = new Set<string>();
    for (const it of inventory) {
      seen.add(normalizeText(it.nombre));
      out.push({
        value: it.nombre,
        id: 'i:' + it.id,
        description: `Inventario · ${EXPENSE_CATEGORY_LABEL[it.categoria]}${it.proveedor ? ' · ' + it.proveedor : ''}`,
        keywords: `${it.marca} ${it.modelo} ${it.sku}`,
        icon: <CategoryIcon categoria={it.categoria} size="sm" />,
        meta: `${formatNumber(it.stock)} en stock`,
      });
    }
    const prev: ComboboxOption[] = [];
    for (const e of expenses) {
      const k = normalizeText(e.concepto);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      prev.push({
        value: e.concepto,
        id: 'e:' + e.id,
        description: `Compra previa · ${EXPENSE_CATEGORY_LABEL[e.categoria]}${e.proveedor ? ' · ' + e.proveedor : ''}`,
        icon: <CategoryIcon categoria={e.categoria} size="sm" />,
        meta: formatMoney(e.costoUnitarioCents),
      });
    }
    // Primero las compras previas (más recientes), luego el inventario.
    return [...prev, ...out];
  }, [inventory, expenses]);

  const providerOptions = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of expenses) if (e.proveedor.trim()) count.set(e.proveedor.trim(), (count.get(e.proveedor.trim()) ?? 0) + 1);
    for (const i of inventory) if (i.proveedor.trim() && !count.has(i.proveedor.trim())) count.set(i.proveedor.trim(), 0);
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([p, n]) => ({ value: p, meta: n ? `${n} ${n === 1 ? 'compra' : 'compras'}` : undefined, icon: <Store /> }));
  }, [expenses, inventory]);

  const clientOptions = useMemo<ComboboxOption[]>(
    () =>
      clients.slice(0, 200).map((c) => ({
        value: clientLabel(c),
        id: c.id,
        description: [deviceFullName(c), c.servicio].filter(Boolean).join(' · '),
        keywords: `${c.folio} ${formatFolio(c.folio)} ${c.telefono} ${c.imei}`,
        meta: formatFolio(c.folio),
        icon: <User />,
      })),
    [clients],
  );

  /* ----------------------------- Handlers ------------------------------ */
  const onConceptChange = (text: string) => {
    const match = itemsByName.get(normalizeText(text));
    setV((p) => {
      const next = { ...p, concepto: text };
      if (match) {
        next.inventarioId = match.id;
        next.categoria = match.categoria;
      } else if (p.inventarioId) {
        const cur = itemsById.get(p.inventarioId);
        if (!cur || normalizeText(cur.nombre) !== normalizeText(text)) next.inventarioId = mode === 'edit' && p.inventarioId === initial.inventarioId && !cur ? p.inventarioId : null;
      }
      return next;
    });
    if (errors.concepto) setErrors((e) => ({ ...e, concepto: '' }));
  };

  const onConceptSelect = (o: ComboboxOption) => {
    if (!o.id) return;
    if (o.id.startsWith('i:')) {
      const it = itemsById.get(o.id.slice(2));
      if (!it) return;
      setRestock(true);
      setV((p) => ({
        ...p,
        concepto: it.nombre,
        inventarioId: it.id,
        categoria: it.categoria,
        proveedor: p.proveedor || it.proveedor,
        costoUnitarioCents: p.costoUnitarioCents || it.costoUnitarioCents,
      }));
    } else if (o.id.startsWith('e:')) {
      const e = expenses.find((x) => x.id === o.id!.slice(2));
      if (!e) return;
      setV((p) => ({
        ...p,
        concepto: e.concepto,
        categoria: e.categoria,
        proveedor: p.proveedor || e.proveedor,
        costoUnitarioCents: p.costoUnitarioCents || e.costoUnitarioCents,
        inventarioId: e.inventarioId && itemsById.has(e.inventarioId) ? e.inventarioId : p.inventarioId,
      }));
    }
  };

  const dirty = JSON.stringify(v) !== initialRef.current;
  const requestClose = async () => {
    if (saving) return;
    if (dirty) {
      const ok = await confirm({
        title: '¿Descartar los cambios?',
        description: 'Tienes cambios sin guardar en este gasto.',
        confirmLabel: 'Descartar',
        cancelLabel: 'Seguir editando',
        tone: 'warning',
      });
      if (!ok) return;
    }
    onClose();
  };

  const submit = async (ev?: FormEvent) => {
    ev?.preventDefault();
    if (saving) return;
    const data: ExpenseInput = { ...v, concepto: v.concepto.trim(), proveedor: v.proveedor.trim(), notas: v.notas.trim() };
    const errs = validateExpenseInput(data);
    if (Object.keys(errs).length) {
      setErrors(errs);
      const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.focus();
      return;
    }
    setSaving(true);
    try {
      let saved: Expense;
      if (mode === 'edit' && expenseId) {
        saved = await updateExpense(expenseId, data);
        toast.success('Gasto actualizado', { description: `${saved.concepto} · ${formatMoney(saved.totalCents)}` });
      } else if (willRestock && linkedItem) {
        const r = await restockInventory(linkedItem.id, {
          cantidad: data.cantidad,
          costoUnitarioCents: data.costoUnitarioCents,
          registrarGasto: true,
          proveedor: data.proveedor,
          metodoPago: data.metodoPago,
          nota: data.notas,
          ts: data.fecha,
        });
        saved = r.expense!;
        // restockInventory no conoce el cliente: se vincula después.
        if (saved && data.clienteId) saved = await updateExpense(saved.id, { clienteId: data.clienteId });
        toast.success('Gasto registrado y stock actualizado', {
          description: `${linkedItem.nombre}: ${formatNumber(linkedItem.stock)} → ${formatNumber(linkedItem.stock + data.cantidad)} uds`,
        });
      } else {
        saved = await createExpense(data);
        toast.success('Gasto registrado', { description: `${saved.concepto} · ${formatMoney(saved.totalCents)}` });
      }
      initialRef.current = JSON.stringify(v);
      onSaved(saved, mode);
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(err.fields);
      } else {
        toast.error('No se pudo guardar el gasto', { description: err instanceof Error ? err.message : undefined });
      }
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  const total = Math.round((Number.isFinite(v.cantidad) ? v.cantidad : 0) * v.costoUnitarioCents);
  const categoryOptions = EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABEL[c], icon: <CategoryIcon categoria={c} size="sm" /> }));

  return (
    <Sheet
      open={open}
      onClose={requestClose}
      dismissible={!saving}
      size="lg"
      icon={<Receipt />}
      title={mode === 'edit' ? 'Editar gasto' : 'Nuevo gasto'}
      description={mode === 'edit' ? 'Los cambios quedan en el registro de actividad.' : 'Compra de repuestos, herramientas u otro gasto del taller.'}
      footer={
        <div className={styles.formFooter}>
          {side && (
            <span className={styles.footHint}>
              <Kbd size="sm">{typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'}</Kbd>
              <Kbd size="sm">↵</Kbd> para guardar
            </span>
          )}
          <Button variant="ghost" onClick={requestClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={saving} iconLeft={willRestock ? <PackagePlus /> : undefined}>
            {mode === 'edit' ? 'Guardar cambios' : willRestock ? 'Guardar y sumar al stock' : 'Guardar gasto'}
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} ref={formRef} onSubmit={submit} onKeyDown={onKeyDown} noValidate className={styles.form}>
        <FormSection title="Qué compraste">
          <FormGrid columns={1}>
            <Combobox
              label="Concepto"
              required
              autoFocus={side}
              value={v.concepto}
              onChange={onConceptChange}
              onSelect={onConceptSelect}
              options={conceptOptions}
              placeholder="Ej. Pantalla OLED iPhone 13"
              error={errors.concepto}
              hint="Elige un repuesto del inventario o una compra anterior, o escribe uno nuevo."
              maxResults={8}
            />
            <AnimatePresence initial={false}>
              {linkedItem && (
                <motion.div
                  key="inv"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className={styles.invBox}>
                    <div className={styles.invHead}>
                      <CategoryIcon categoria={linkedItem.categoria} size="sm" />
                      <div className={styles.invText}>
                        <span className={styles.invName}>{linkedItem.nombre}</span>
                        <span className={styles.invMeta}>
                          En inventario · {formatNumber(linkedItem.stock)} en stock{linkedItem.ubicacion ? ` · ${linkedItem.ubicacion}` : ''}
                        </span>
                      </div>
                      <Package className={styles.invGlyph} aria-hidden />
                    </div>
                    {canRestock && (
                      <Switch
                        checked={restock}
                        onChange={setRestock}
                        label={`Sumar al stock de ${linkedItem.nombre}`}
                        description={
                          restock
                            ? `El stock pasará de ${formatNumber(linkedItem.stock)} a ${formatNumber(linkedItem.stock + (v.cantidad || 0))} uds y se registrará la entrada.`
                            : 'Sólo se registrará el gasto; el stock no cambia.'
                        }
                      />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </FormGrid>
          <div className={styles.catField}>
            <span className={styles.catFieldLabel} id="gasto-cat-label">
              Categoría
              {willRestock && <span className={styles.catFieldNote}> · la del artículo de inventario</span>}
            </span>
            <RadioCards<ExpenseCategory>
              aria-label="Categoría"
              value={v.categoria}
              onChange={(c) => set('categoria', c)}
              options={categoryOptions.map((o) => ({ ...o, disabled: willRestock && o.value !== v.categoria }))}
              columns={side ? 3 : 2}
              size="sm"
              className={styles.catCards}
            />
            {errors.categoria && <p className={styles.fieldError}>{errors.categoria}</p>}
          </div>
          <Combobox
            label="Proveedor"
            optional
            value={v.proveedor}
            onChange={(t) => set('proveedor', t)}
            options={providerOptions}
            placeholder="¿Dónde lo compraste?"
            error={errors.proveedor}
            prefix={<Store />}
          />
        </FormSection>

        <FormSection title="Cuánto costó">
          <FormGrid columns={2}>
            <NumberStepper label="Cantidad" value={v.cantidad} onChange={(n) => set('cantidad', n)} min={1} max={100000} unit={v.cantidad === 1 ? 'ud' : 'uds'} error={errors.cantidad} fullWidth />
            <MoneyInput label="Costo unitario" value={v.costoUnitarioCents} onChange={(c) => set('costoUnitarioCents', c)} error={errors.costoUnitarioCents} />
          </FormGrid>
          <div className={styles.totalBox} aria-live="polite">
            <div>
              <span className={styles.totalLabel}>Total</span>
              <span className={styles.totalCalc}>
                {formatNumber(v.cantidad || 0)} × {formatMoney(v.costoUnitarioCents)}
              </span>
            </div>
            <motion.span key={total} className={styles.totalValue} initial={{ opacity: 0.4, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
              {formatMoney(total)}
            </motion.span>
          </div>
          <div className={styles.methodField}>
            <span className={styles.catFieldLabel}>Método de pago</span>
            <SegmentedControl<PaymentMethod>
              aria-label="Método de pago"
              value={v.metodoPago}
              onChange={(m) => set('metodoPago', m)}
              options={METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))}
              fullWidth
              size="sm"
            />
          </div>
          <DateTimeInput label="Fecha y hora de la compra" value={v.fecha} onChange={(ts) => set('fecha', ts)} error={errors.fecha} weekStartsOn={weekStartsOn} />
        </FormSection>

        <FormSection title="Vínculos y notas">
          {linkedClient ? (
            <div className={styles.linkedClient}>
              <span className={styles.linkedLabel}>Cliente vinculado</span>
              <div className={styles.linkedCard}>
                <span className={styles.linkedFolio}>{formatFolio(linkedClient.folio)}</span>
                <div className={styles.linkedText}>
                  <span className={styles.linkedName}>{clientLabel(linkedClient)}</span>
                  <span className={styles.linkedMeta}>{[deviceFullName(linkedClient), linkedClient.servicio].filter(Boolean).join(' · ')}</span>
                </div>
                <IconButton
                  icon={<X />}
                  label="Quitar vínculo"
                  size="sm"
                  onClick={() => {
                    set('clienteId', null);
                    setClientText('');
                  }}
                />
              </div>
            </div>
          ) : (
            <Combobox
              label="Vincular a cliente"
              optional
              value={clientText}
              onChange={setClientText}
              onSelect={(o) => {
                if (o.id) set('clienteId', o.id);
              }}
              options={clientOptions}
              placeholder="Buscar por nombre, folio o equipo"
              emptyText="Sin coincidencias: elige un cliente de la lista"
              hint="Para saber cuánto costaron las piezas de un servicio."
              prefix={<User />}
              error={errors.clienteId}
            />
          )}
          <Textarea label="Notas" optional value={v.notas} onValueChange={(t) => set('notas', t)} minRows={2} maxLength={4000} placeholder="Garantía del proveedor, número de factura…" error={errors.notas} />
        </FormSection>
      </form>
    </Sheet>
  );
}

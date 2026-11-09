import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Banknote, CreditCard, Eye, EyeOff, Landmark, Lock, PenLine, ShieldCheck, Trash2, UserPlus, Wallet } from 'lucide-react';
import { navigate } from '@/app/router';
import {
  DEVICE_BRANDS,
  REPAIR_STATUSES,
  REPAIR_STATUS_LABEL,
  SERVICE_TYPES,
  ValidationError,
  addClientPhotos,
  createClient,
  deleteClient,
  emptyClientInput,
  formatFolio,
  formatMoney,
  restoreClient,
  updateClient,
  validateClientInput,
  useClient,
  useClients,
  useCustomerDirectory,
  type Client,
  type ClientInput,
  type PaymentMethod,
  type RepairStatus,
  type UnlockType,
} from '@/data';
import {
  Button,
  Combobox,
  DateTimeInput,
  Field,
  FilterChips,
  FormGrid,
  FormSection,
  IconButton,
  Input,
  Kbd,
  MOD_KEY_LABEL,
  MoneyInput,
  NumberStepper,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  Switch,
  Textarea,
  confirm,
  cx,
  toast,
  type ComboboxOption,
} from '@/ui';
import { PatternLock } from './components/PatternLock';
import { PhotoCapture } from './components/PhotoCapture';
import { PhotoGallery } from './components/PhotoGallery';
import styles from './ClientForm.module.css';

export interface ClientFormProps {
  open: boolean;
  /** null = nuevo cliente. */
  clientId: string | null;
  onClose: () => void;
}

const FORM_ID = 'client-form';

function toInput(c: Client): ClientInput {
  const { nombre, telefono, email, marca, modelo, imei, servicio, falla, estado, cobroCents, pagadoCents, metodoPago, fecha, fechaEntrega, garantiaDias, desbloqueoTipo, desbloqueoPatron, desbloqueoCodigo, notas } = c;
  return { nombre, telefono, email, marca, modelo, imei, servicio, falla, estado, cobroCents, pagadoCents, metodoPago, fecha, fechaEntrega, garantiaDias, desbloqueoTipo, desbloqueoPatron: [...desbloqueoPatron], desbloqueoCodigo, notas };
}

const FIELD_ORDER = ['nombre', 'telefono', 'email', 'marca', 'modelo', 'imei', 'desbloqueoPatron', 'desbloqueoCodigo', 'servicio', 'falla', 'estado', 'garantiaDias', 'cobroCents', 'pagadoCents', 'metodoPago', 'fecha', 'fechaEntrega', 'notas'];

const METHOD_OPTIONS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: 'efectivo', label: 'Efectivo', icon: <Banknote /> },
  { value: 'transferencia', label: 'Transferencia', icon: <Landmark /> },
  { value: 'tarjeta', label: 'Tarjeta', icon: <CreditCard /> },
  { value: 'otro', label: 'Otro', icon: <Wallet /> },
];

const UNLOCK_OPTIONS: { value: UnlockType; label: string }[] = [
  { value: 'ninguno', label: 'Ninguno' },
  { value: 'patron', label: 'Patrón' },
  { value: 'pin', label: 'PIN' },
  { value: 'contrasena', label: 'Contraseña' },
];

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Ocurrió un error inesperado');

/** Formulario de alta/edición de cliente en un Sheet. */
export function ClientForm({ open, clientId, onClose }: ClientFormProps) {
  const editing = clientId != null;
  const client = useClient(clientId);
  const directory = useCustomerDirectory();
  const allClients = useClients();

  const [initial, setInitial] = useState<ClientInput | null>(() => (editing ? null : emptyClientInput()));
  const [draft, setDraft] = useState<ClientInput | null>(initial);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [paidFull, setPaidFull] = useState(false);
  const [showCode, setShowCode] = useState(true);
  const formRef = useRef<HTMLFormElement | null>(null);

  // En edición, carga los datos cuando llegan.
  useEffect(() => {
    if (editing && client && !draft) {
      const i = toInput(client);
      setInitial(i);
      setDraft(i);
      setPaidFull(i.cobroCents > 0 && i.pagadoCents >= i.cobroCents);
      setShowCode(false);
    }
  }, [editing, client, draft]);

  const dirty = useMemo(() => !!draft && !!initial && (JSON.stringify(draft) !== JSON.stringify(initial) || files.length > 0), [draft, initial, files]);

  const set = <K extends keyof ClientInput>(key: K, value: ClientInput[K]) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, [key]: value };
      if (key === 'cobroCents' && paidFull) next.pagadoCents = value as number;
      if (key === 'estado' && value === 'entregado' && next.fechaEntrega == null) next.fechaEntrega = Math.max(Date.now(), next.fecha);
      if (key === 'estado' && value !== 'entregado') next.fechaEntrega = null;
      return next;
    });
    if (errors[key as string]) setErrors(({ [key as string]: _drop, ...rest }) => rest);
  };

  const requestClose = async () => {
    if (saving) return;
    if (dirty) {
      const ok = await confirm({
        title: '¿Descartar los cambios?',
        description: 'Perderás lo que capturaste en este formulario.',
        tone: 'warning',
        confirmLabel: 'Descartar',
        cancelLabel: 'Seguir editando',
      });
      if (!ok) return;
    }
    onClose();
  };

  const focusFirstError = (errs: Record<string, string>) => {
    const key = FIELD_ORDER.find((k) => errs[k]) ?? Object.keys(errs)[0];
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>(`[data-field="${key}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.querySelector<HTMLElement>('input, textarea, button')?.focus({ preventScroll: true });
    });
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft || saving) return;
    const input: ClientInput = { ...draft, pagadoCents: paidFull ? draft.cobroCents : draft.pagadoCents };
    const errs = validateClientInput(input);
    if (Object.keys(errs).length) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }
    setSaving(true);
    try {
      if (editing && clientId) {
        await updateClient(clientId, input);
        toast.success('Cambios guardados', { description: `${input.nombre} · ${formatFolio(client?.folio ?? 0)}` });
        setInitial(input);
        onClose();
      } else {
        const created = await createClient(input);
        let photoNote: string | undefined;
        if (files.length) {
          try {
            await addClientPhotos(created.id, files, { kind: 'ingreso' });
            photoNote = files.length === 1 ? 'Con 1 foto de evidencia' : `Con ${files.length} fotos de evidencia`;
          } catch (err) {
            toast.warning('El cliente se guardó, pero no las fotos', { description: err instanceof ValidationError ? Object.values(err.fields)[0] : errorMessage(err) });
          }
        }
        toast.success(`Cliente registrado · Folio ${formatFolio(created.folio)}`, {
          description: photoNote ?? `${created.nombre}`,
          action: { label: 'Ver', onClick: () => navigate(`#/clientes/${created.id}`) },
        });
        setInitial(input);
        setFiles([]);
        onClose();
      }
    } catch (err) {
      if (err instanceof ValidationError) {
        setErrors(err.fields);
        focusFirstError(err.fields);
      } else toast.error('No se pudo guardar', { description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!clientId || !client) return;
    const ok = await confirm({
      title: `¿Eliminar a ${client.nombre || 'este cliente'}?`,
      description: `El servicio ${formatFolio(client.folio)} se enviará a la papelera. Podrás restaurarlo después.`,
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await deleteClient(clientId);
      const id = clientId;
      toast.undo(`${client.nombre || 'Cliente'} enviado a la papelera`, () => {
        restoreClient(id)
          .then(() => toast.success('Cliente restaurado', { action: { label: 'Ver', onClick: () => navigate(`#/clientes/${id}`) } }))
          .catch((e) => toast.error('No se pudo restaurar', { description: errorMessage(e) }));
      });
      setInitial(draft);
      navigate('#/clientes');
    } catch (e) {
      toast.error('No se pudo eliminar', { description: errorMessage(e) });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      // Confirma valores de campos con formato (dinero) antes de guardar.
      (document.activeElement as HTMLElement | null)?.blur?.();
      setTimeout(() => submit(), 0);
    }
  };

  /* ----------------------------- Opciones ------------------------------ */
  const nameOptions = useMemo<ComboboxOption[]>(
    () =>
      (directory ?? []).map((d) => ({
        value: d.nombre,
        id: d.telefono,
        description: d.telefono || 'Sin teléfono',
        keywords: d.telefono,
        meta: d.visitas > 1 ? `${d.visitas} visitas` : '1 visita',
      })),
    [directory],
  );

  const modelOptions = useMemo(() => {
    if (!allClients || !draft) return [];
    const brand = draft.marca.trim().toLowerCase();
    const counts = new Map<string, number>();
    for (const c of allClients) {
      if (!c.modelo) continue;
      if (brand && c.marca.trim().toLowerCase() !== brand) continue;
      counts.set(c.modelo, (counts.get(c.modelo) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
  }, [allClients, draft]);

  const serviceOptions = useMemo(() => {
    const list = [...SERVICE_TYPES];
    if (draft?.servicio && !list.includes(draft.servicio)) list.unshift(draft.servicio);
    return list.map((s) => ({ value: s, label: s }));
  }, [draft?.servicio]);

  const saldo = draft ? Math.max(0, draft.cobroCents - (paidFull ? draft.cobroCents : draft.pagadoCents)) : 0;
  const pagado = draft ? (paidFull ? draft.cobroCents : Math.min(draft.pagadoCents, draft.cobroCents)) : 0;

  const title = editing ? 'Editar cliente' : 'Nuevo cliente';
  const description = editing
    ? client
      ? `${client.nombre} · ${formatFolio(client.folio)}`
      : 'Cargando…'
    : 'Registra al cliente, su equipo, el servicio y el cobro.';

  const footer = (
    <div className={styles.footer}>
      {editing && (
        <Button variant="danger-ghost" iconLeft={<Trash2 />} onClick={remove} disabled={!client || saving} className={styles.deleteBtn}>
          Eliminar
        </Button>
      )}
      <span className={styles.footerHint} aria-hidden>
        <Kbd size="sm">{MOD_KEY_LABEL}</Kbd>
        <Kbd size="sm">↵</Kbd>
        <span>para guardar</span>
      </span>
      <div className={styles.footerActions}>
        <Button variant="ghost" onClick={requestClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="primary" type="submit" form={FORM_ID} loading={saving} disabled={!draft}>
          {editing ? 'Guardar cambios' : 'Guardar cliente'}
        </Button>
      </div>
    </div>
  );

  return (
    <Sheet open={open} onClose={requestClose} title={title} description={description} icon={editing ? <PenLine /> : <UserPlus />} size="lg" footer={footer} dismissible={!saving}>
      {!draft ? (
        editing && client === null ? (
          <p className={styles.missing}>Este cliente ya no existe o fue enviado a la papelera.</p>
        ) : (
          <div className={styles.loading} aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className={styles.loadingRow}>
                <Skeleton width={90} height={10} />
                <Skeleton height={36} radius={8} />
              </div>
            ))}
          </div>
        )
      ) : (
        <form id={FORM_ID} ref={formRef} onSubmit={submit} onKeyDown={onKeyDown} noValidate className={styles.form}>
          {/* ------------------------------ Cliente ------------------------------ */}
          <FormSection title="Cliente">
            <FormGrid>
              <div data-field="nombre" className="span-all">
                <Combobox
                  label="Nombre"
                  required
                  value={draft.nombre}
                  onChange={(v) => set('nombre', v)}
                  onSelect={(o) => {
                    if (o.id) set('telefono', o.id);
                  }}
                  options={nameOptions}
                  placeholder="Nombre y apellido"
                  error={errors.nombre}
                  hint={!editing ? 'Si ya vino antes, elígelo para completar su teléfono.' : undefined}
                  openOnFocus={false}
                  maxResults={6}
                  autoFocus={!editing}
                  emptyText="Cliente nuevo"
                />
              </div>
              <div data-field="telefono">
                <Input
                  label="Teléfono"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="55 1234 5678"
                  value={draft.telefono}
                  onValueChange={(v) => set('telefono', v)}
                  error={errors.telefono}
                  numeric
                />
              </div>
              <div data-field="email">
                <Input label="Correo" optional type="email" inputMode="email" autoComplete="email" placeholder="nombre@correo.com" value={draft.email} onValueChange={(v) => set('email', v)} error={errors.email} />
              </div>
            </FormGrid>
          </FormSection>

          {/* ------------------------------ Equipo ------------------------------- */}
          <FormSection title="Equipo">
            <FormGrid>
              <div data-field="marca">
                <Combobox label="Marca" value={draft.marca} onChange={(v) => set('marca', v)} options={DEVICE_BRANDS} placeholder="Apple, Samsung…" error={errors.marca} maxResults={14} />
              </div>
              <div data-field="modelo">
                <Combobox label="Modelo" value={draft.modelo} onChange={(v) => set('modelo', v)} options={modelOptions} placeholder="iPhone 13, Galaxy A54…" error={errors.modelo} openOnFocus={modelOptions.length > 0} emptyText="Modelo nuevo" />
              </div>
              <div data-field="imei" className="span-all">
                <Input
                  label="IMEI o número de serie"
                  optional
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Marca *#06# en el equipo para verlo"
                  value={draft.imei}
                  onValueChange={(v) => set('imei', v)}
                  error={errors.imei}
                  className="mono"
                />
              </div>
            </FormGrid>
          </FormSection>

          {/* ---------------------------- Desbloqueo ----------------------------- */}
          <FormSection title="Desbloqueo">
            <div className={styles.stack}>
              <SegmentedControl<UnlockType>
                fullWidth
                aria-label="Tipo de bloqueo de pantalla"
                value={draft.desbloqueoTipo}
                onChange={(v) => {
                  set('desbloqueoTipo', v);
                  setErrors(({ desbloqueoPatron: _a, desbloqueoCodigo: _b, ...rest }) => rest);
                }}
                options={UNLOCK_OPTIONS}
              />
              {draft.desbloqueoTipo === 'patron' && (
                <div data-field="desbloqueoPatron" className={styles.patternWrap}>
                  <Field label="Dibuja el patrón" error={errors.desbloqueoPatron} labelAs="span" hint="Desliza el dedo por los puntos en el mismo orden que en el equipo.">
                    <div className={styles.patternBox}>
                      <PatternLock value={draft.desbloqueoPatron} onChange={(v) => set('desbloqueoPatron', v)} size={232} />
                    </div>
                  </Field>
                </div>
              )}
              {(draft.desbloqueoTipo === 'pin' || draft.desbloqueoTipo === 'contrasena') && (
                <div data-field="desbloqueoCodigo">
                  <Input
                    label={draft.desbloqueoTipo === 'pin' ? 'PIN' : 'Contraseña'}
                    type={showCode ? 'text' : 'password'}
                    inputMode={draft.desbloqueoTipo === 'pin' ? 'numeric' : 'text'}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={draft.desbloqueoTipo === 'pin' ? '4 a 16 dígitos' : 'Como la escribe el cliente'}
                    value={draft.desbloqueoCodigo}
                    onValueChange={(v) => set('desbloqueoCodigo', draft.desbloqueoTipo === 'pin' ? v.replace(/\D/g, '') : v)}
                    error={errors.desbloqueoCodigo}
                    className="mono"
                    suffix={
                      <IconButton
                        size="sm"
                        icon={showCode ? <EyeOff /> : <Eye />}
                        label={showCode ? 'Ocultar' : 'Mostrar'}
                        onClick={() => setShowCode((s) => !s)}
                        tooltip={false}
                      />
                    }
                  />
                </div>
              )}
              <p className={styles.privacy}>
                <Lock aria-hidden />
                <span>
                  {draft.desbloqueoTipo === 'ninguno'
                    ? 'Si el equipo tiene bloqueo, regístralo para poder probarlo después de la reparación.'
                    : 'Se guarda sólo en este dispositivo. Nunca aparece en el recibo ni en el registro de actividad.'}
                </span>
              </p>
            </div>
          </FormSection>

          {/* --------------------------- Evidencia ------------------------------- */}
          <FormSection title="Evidencia fotográfica" description={editing ? 'Fotos guardadas del equipo. Agrega más en cada etapa.' : undefined}>
            {editing && clientId ? <PhotoGallery clientId={clientId} editable /> : <PhotoCapture files={files} onChange={setFiles} />}
          </FormSection>

          {/* ---------------------------- Servicio ------------------------------- */}
          <FormSection title="Servicio">
            <div className={styles.stack}>
              <div data-field="servicio">
                <Field label="Tipo de servicio" error={errors.servicio} labelAs="span">
                  <FilterChips<string> aria-label="Tipo de servicio" value={draft.servicio} onChange={(v) => set('servicio', v === draft.servicio ? '' : v)} options={serviceOptions} className={styles.wrapChips} />
                </Field>
              </div>
              <div data-field="falla">
                <Textarea label="Falla o diagnóstico" placeholder="Qué le pasa al equipo, qué se revisó, qué se va a cambiar…" value={draft.falla} onValueChange={(v) => set('falla', v)} error={errors.falla} minRows={3} maxLength={2000} />
              </div>
              <FormGrid>
                <div data-field="estado">
                  <Select<RepairStatus>
                    label="Estado"
                    value={draft.estado}
                    onChange={(v) => set('estado', v)}
                    options={REPAIR_STATUSES.map((s) => ({ value: s, label: REPAIR_STATUS_LABEL[s], icon: <span className={styles.statusDot} style={{ background: `var(--status-${s})` }} /> }))}
                    error={errors.estado}
                  />
                </div>
                <div data-field="garantiaDias">
                  <NumberStepper label="Garantía" unit="días" min={0} max={3650} value={draft.garantiaDias} onChange={(v) => set('garantiaDias', v)} error={errors.garantiaDias} fullWidth />
                  <div className={styles.presets} role="group" aria-label="Garantía rápida">
                    {[0, 30, 90].map((d) => (
                      <button key={d} type="button" className={cx(styles.preset, draft.garantiaDias === d && styles.presetOn)} aria-pressed={draft.garantiaDias === d} onClick={() => set('garantiaDias', d)}>
                        {d === 0 ? 'Sin garantía' : `${d} días`}
                      </button>
                    ))}
                  </div>
                </div>
              </FormGrid>
            </div>
          </FormSection>

          {/* ------------------------------ Cobro -------------------------------- */}
          <FormSection title="Cobro">
            <div className={styles.stack}>
              <FormGrid>
                <div data-field="cobroCents">
                  <MoneyInput label="Precio total" value={draft.cobroCents} onChange={(v) => set('cobroCents', v)} error={errors.cobroCents} size="lg" />
                </div>
                <div data-field="pagadoCents">
                  {paidFull ? (
                    <Field label="Abono" labelAs="span">
                      <div className={styles.paidFull}>
                        <ShieldCheck aria-hidden />
                        <span>Pagó {formatMoney(draft.cobroCents)}</span>
                      </div>
                    </Field>
                  ) : (
                    <MoneyInput label="Abono" value={draft.pagadoCents} onChange={(v) => set('pagadoCents', v)} error={errors.pagadoCents} size="lg" hint="Lo que deja hoy el cliente" />
                  )}
                </div>
              </FormGrid>
              <Switch
                checked={paidFull}
                onChange={(v) => {
                  setPaidFull(v);
                  setDraft((d) => (d ? { ...d, pagadoCents: v ? d.cobroCents : Math.min(d.pagadoCents, d.cobroCents) } : d));
                }}
                label="Pagó completo"
                description="El cliente liquidó el total del servicio."
              />
              <div className={styles.balance} aria-live="polite">
                <div>
                  <span className={styles.balanceLabel}>Total</span>
                  <span className={styles.balanceValue}>{formatMoney(draft.cobroCents)}</span>
                </div>
                <div>
                  <span className={styles.balanceLabel}>Abonado</span>
                  <span className={cx(styles.balanceValue, styles.income)}>{formatMoney(pagado)}</span>
                </div>
                <div>
                  <span className={styles.balanceLabel}>Saldo</span>
                  <span className={cx(styles.balanceValue, saldo > 0 ? styles.pending : styles.income)}>{saldo > 0 ? formatMoney(saldo) : draft.cobroCents > 0 ? 'Liquidado' : formatMoney(0)}</span>
                </div>
              </div>
              <div data-field="metodoPago">
                <Field label="Método de pago" labelAs="span" error={errors.metodoPago}>
                  <FilterChips<PaymentMethod> aria-label="Método de pago" value={draft.metodoPago} onChange={(v) => set('metodoPago', v)} options={METHOD_OPTIONS} className={styles.wrapChips} />
                </Field>
              </div>
            </div>
          </FormSection>

          {/* ------------------------------ Fecha -------------------------------- */}
          <FormSection title="Fecha y hora del servicio">
            <FormGrid>
              <div data-field="fecha">
                <DateTimeInput label="Recibido" value={draft.fecha} onChange={(v) => set('fecha', v)} error={errors.fecha} />
              </div>
              {draft.estado === 'entregado' && (
                <div data-field="fechaEntrega">
                  <DateTimeInput label="Entregado" value={draft.fechaEntrega} onChange={(v) => set('fechaEntrega', v)} error={errors.fechaEntrega} />
                </div>
              )}
            </FormGrid>
          </FormSection>

          {/* ------------------------------ Notas -------------------------------- */}
          <FormSection title="Notas">
            <div data-field="notas">
              <Textarea aria-label="Notas" optional placeholder="Accesorios que dejó (funda, chip, cargador), detalles acordados…" value={draft.notas} onValueChange={(v) => set('notas', v)} error={errors.notas} minRows={2} maxLength={4000} />
            </div>
          </FormSection>
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>
      )}
    </Sheet>
  );
}

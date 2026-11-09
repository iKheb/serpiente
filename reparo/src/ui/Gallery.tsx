/**
 * Galería del sistema de diseño (#/ui). Muestra todos los componentes de
 * src/ui con sus variantes y estados, en tema oscuro y claro.
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Bell,
  CircleDollarSign,
  Copy,
  Download,
  Filter,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Receipt,
  Save,
  Search,
  Smartphone,
  Trash,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import { formatMoney } from '@/data';
import { DEVICE_BRANDS, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, REPAIR_STATUSES, type RepairStatus } from '@/data/types';
import {
  AnimatedNumber,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Combobox,
  DataTable,
  DateTimeInput,
  DateTimeText,
  Dialog,
  Divider,
  DropdownMenu,
  EmptyState,
  FilterChips,
  FormGrid,
  FormSection,
  IconButton,
  Input,
  Kbd,
  KbdGroup,
  KpiCard,
  MoneyInput,
  MoneyText,
  NumberStepper,
  PageHeader,
  Popover,
  ProgressBar,
  RadioCards,
  SearchField,
  Section,
  SegmentedControl,
  Select,
  Sheet,
  Skeleton,
  Spinner,
  StatusBadge,
  Switch,
  Tabs,
  Textarea,
  Toolbar,
  ToolbarSpacer,
  Tooltip,
  confirm,
  toast,
  type BadgeTone,
  type Column,
} from './index';
import styles from './Gallery.module.css';

/* ------------------------------- Utilidades ------------------------------- */

function Specimen({ title, note, children, wide }: { title: string; note?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? `${styles.specimen} ${styles.wide}` : styles.specimen}>
      <div className={styles.specHead}>
        <span className={styles.specTitle}>{title}</span>
        {note && <span className={styles.specNote}>{note}</span>}
      </div>
      <div className={styles.specBody}>{children}</div>
    </div>
  );
}

function Row({ children, align = 'center' }: { children: ReactNode; align?: 'center' | 'start' }) {
  return <div className={styles.row} style={{ alignItems: align === 'start' ? 'flex-start' : 'center' }}>{children}</div>;
}

const SECTIONS = [
  { id: 'fundamentos', label: 'Fundamentos' },
  { id: 'botones', label: 'Botones' },
  { id: 'formularios', label: 'Formularios' },
  { id: 'seleccion', label: 'Selección' },
  { id: 'datos', label: 'Datos' },
  { id: 'tarjetas', label: 'Tarjetas' },
  { id: 'tabla', label: 'Tabla' },
  { id: 'capas', label: 'Capas' },
  { id: 'vacios', label: 'Vacíos y carga' },
  { id: 'estructura', label: 'Estructura' },
];

/* ------------------------------ Datos de muestra ------------------------------ */

interface DemoRow {
  id: string;
  folio: number;
  nombre: string;
  telefono: string;
  equipo: string;
  servicio: string;
  estado: RepairStatus;
  cobroCents: number;
  pagadoCents: number;
  fecha: number;
}

const NOW = Date.now();
const H = 3600_000;
const DEMO_ROWS: DemoRow[] = [
  { id: 'a', folio: 128, nombre: 'Ana Sofía López', telefono: '55 2841 9930', equipo: 'Apple iPhone 13', servicio: 'Cambio de pantalla', estado: 'reparando', cobroCents: 289000, pagadoCents: 100000, fecha: NOW - 2 * H },
  { id: 'b', folio: 127, nombre: 'Jorge Ramírez', telefono: '33 1902 4471', equipo: 'Samsung Galaxy A54', servicio: 'Cambio de batería', estado: 'listo', cobroCents: 85000, pagadoCents: 85000, fecha: NOW - 26 * H },
  { id: 'c', folio: 126, nombre: 'María Fernanda Ruiz', telefono: '81 4410 2387', equipo: 'Xiaomi Redmi Note 12', servicio: 'Puerto de carga', estado: 'diagnostico', cobroCents: 45000, pagadoCents: 0, fecha: NOW - 50 * H },
  { id: 'd', folio: 125, nombre: 'Luis Hernández', telefono: '55 7730 1184', equipo: 'Motorola Edge 40', servicio: 'Equipo mojado', estado: 'recibido', cobroCents: 120000, pagadoCents: 0, fecha: NOW - 74 * H },
  { id: 'e', folio: 124, nombre: 'Daniela Torres', telefono: '22 2918 0045', equipo: 'Apple iPhone 11', servicio: 'Tapa trasera', estado: 'entregado', cobroCents: 95000, pagadoCents: 95000, fecha: NOW - 120 * H },
  { id: 'f', folio: 123, nombre: 'Ricardo Méndez', telefono: '55 1093 2271', equipo: 'Huawei P30 Lite', servicio: 'Software / desbloqueo', estado: 'cancelado', cobroCents: 40000, pagadoCents: 0, fecha: NOW - 170 * H },
];

const CLIENT_SUGGESTIONS = DEMO_ROWS.map((r) => ({ value: r.nombre, id: r.id, description: `${r.telefono} · ${r.equipo}`, keywords: r.telefono.replace(/\D/g, '') }));

/* ---------------------------------- Galería ---------------------------------- */

export default function Gallery() {
  // Formularios
  const [name, setName] = useState('Ana Sofía López');
  const [phone, setPhone] = useState('');
  const [cobro, setCobro] = useState(289000);
  const [abono, setAbono] = useState(0);
  const [qty, setQty] = useState(2);
  const [notes, setNotes] = useState('La pantalla parpadea al subir el brillo; el táctil no responde en la esquina superior.');
  const [cat, setCat] = useState<string | null>('pantallas');
  const [brand, setBrand] = useState('Sam');
  const [client, setClient] = useState('');
  const [when, setWhen] = useState<number>(NOW);
  const [search, setSearch] = useState('');
  // Selección
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [tab, setTab] = useState('todos');
  const [sw1, setSw1] = useState(true);
  const [sw2, setSw2] = useState(false);
  const [ck1, setCk1] = useState(true);
  const [ck2, setCk2] = useState(false);
  const [pay, setPay] = useState<'efectivo' | 'transferencia' | 'tarjeta' | 'otro'>('efectivo');
  const [chip, setChip] = useState('activos');
  const [chips, setChips] = useState<string[]>(['reparando', 'listo']);
  // Datos
  const [kpiSeed, setKpiSeed] = useState(0);
  // Capas
  const [sheet, setSheet] = useState(false);
  const [sheetLg, setSheetLg] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  // Tabla
  const [tableState, setTableState] = useState<'datos' | 'cargando' | 'vacio'>('datos');

  const kpi = useMemo(
    () => ({
      cobrado: 4_215_000 + kpiSeed * 137_500,
      gastado: 1_386_000 + kpiSeed * 41_000,
      ganancia: 2_829_000 + kpiSeed * 96_500,
      pendiente: 312_000 - kpiSeed * 12_000,
    }),
    [kpiSeed],
  );

  const money = (n: number) => formatMoney(n);

  const columns: Column<DemoRow>[] = [
    {
      key: 'cliente',
      header: 'Cliente',
      sortValue: (r) => r.nombre,
      cell: (r) => (
        <div className={styles.cellClient}>
          <Avatar name={r.nombre} size="sm" />
          <div className={styles.cellText}>
            <span className={styles.cellTitle}>{r.nombre}</span>
            <span className={styles.cellSub}>
              #{String(r.folio).padStart(6, '0')} · {r.telefono}
            </span>
          </div>
        </div>
      ),
    },
    { key: 'equipo', header: 'Equipo', sortValue: (r) => r.equipo, cell: (r) => <span className={styles.cellMuted}>{r.equipo}</span>, hideBelow: 'lg' },
    { key: 'servicio', header: 'Servicio', cell: (r) => r.servicio, hideBelow: 'xl' },
    { key: 'estado', header: 'Estado', sortValue: (r) => REPAIR_STATUSES.indexOf(r.estado), cell: (r) => <StatusBadge status={r.estado} short /> },
    { key: 'fecha', header: 'Fecha', sortValue: (r) => r.fecha, defaultDir: 'desc', cell: (r) => <DateTimeText value={r.fecha} muted /> },
    {
      key: 'cobro',
      header: 'Cobro',
      align: 'right',
      sortValue: (r) => r.cobroCents,
      defaultDir: 'desc',
      cell: (r) => <MoneyText cents={r.cobroCents} tone={r.estado === 'cancelado' ? 'muted' : 'neutral'} strike={r.estado === 'cancelado'} />,
    },
  ];

  const save = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSheet(false);
      toast({ title: 'Cliente guardado', description: 'Ana Sofía López · #000128', tone: 'success' });
    }, 900);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Reparo', href: '#/panel' }, { label: 'Sistema de diseño' }]}
        title="Sistema de diseño"
        subtitle="Componentes de Reparo con sus variantes y estados. Cambia el tema con T para revisarlos en claro y oscuro."
        actions={
          <>
            <Button variant="secondary" iconLeft={<Copy />} onClick={() => toast.info('Ruta copiada', { description: '#/ui' })}>
              Copiar ruta
            </Button>
            <Button variant="primary" iconLeft={<Plus />} onClick={() => setSheet(true)}>
              Abrir formulario
            </Button>
          </>
        }
      />

      <nav className={styles.toc} aria-label="Secciones de la galería">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#/ui`} onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
            {s.label}
          </a>
        ))}
      </nav>

      {/* ------------------------------ Fundamentos ------------------------------ */}
      <Section id="fundamentos" title="Fundamentos" description="Superficies, texto, marca y semántica financiera. Todo sale de tokens." gap="lg">
        <div className={styles.grid}>
          <Specimen title="Superficies" wide>
            <div className={styles.swatches}>
              {['--bg', '--bg-subtle', '--surface-1', '--surface-2', '--surface-3', '--surface-4'].map((t) => (
                <div key={t} className={styles.swatch}>
                  <span className={styles.swatchColor} style={{ background: `var(${t})` }} />
                  <code>{t}</code>
                </div>
              ))}
            </div>
          </Specimen>
          <Specimen title="Marca y semántica" wide>
            <div className={styles.swatches}>
              {['--brand', '--brand-2', '--income', '--expense', '--profit', '--pending', '--success', '--warning', '--danger', '--info'].map((t) => (
                <div key={t} className={styles.swatch}>
                  <span className={styles.swatchColor} style={{ background: `var(${t})` }} />
                  <code>{t}</code>
                </div>
              ))}
              <div className={styles.swatch}>
                <span className={styles.swatchColor} style={{ background: 'var(--brand-gradient)' }} />
                <code>--brand-gradient</code>
              </div>
            </div>
          </Specimen>
          <Specimen title="Tipografía" note="Geist · tracking negativo en títulos" wide>
            <div className={styles.type}>
              <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.1 }}>Ganancia de la semana</span>
              <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.032em' }}>Título de página · 26</span>
              <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.02em' }}>Título de hoja o diálogo · 17</span>
              <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.015em' }}>Título de sección o tarjeta · 15</span>
              <span style={{ fontSize: 14, color: 'var(--text)' }}>Texto base · 14 — El equipo llegó con la pantalla rota y no enciende.</span>
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Texto secundario · 13 — Recibido el sábado a las 14:32.</span>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Ayuda y metadatos · 12</span>
              <span className="tabular-nums" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>
                {money(4215050)} · {money(1386000)} · 0123456789
              </span>
            </div>
          </Specimen>
          <Specimen title="Estados de reparación">
            <Row>
              {REPAIR_STATUSES.map((s) => (
                <StatusBadge key={s} status={s} />
              ))}
            </Row>
          </Specimen>
          <Specimen title="Radios y sombras">
            <Row>
              {(['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl'] as const).map((r, i) => (
                <span key={r} className={styles.radiusBox} style={{ borderRadius: `var(${r})`, boxShadow: `var(${['--shadow-xs', '--shadow-sm', '--shadow-md', '--shadow-lg'][i]})` }}>
                  {r.replace('--radius-', '')}
                </span>
              ))}
            </Row>
          </Specimen>
        </div>
      </Section>

      {/* -------------------------------- Botones -------------------------------- */}
      <Section id="botones" title="Botones" description="Primario con degradado y brillo de marca; secundario, fantasma, sutil y peligro." gap="lg">
        <div className={styles.grid}>
          <Specimen title="Variantes" wide>
            <Row>
              <Button variant="primary" iconLeft={<Plus />}>
                Nuevo cliente
              </Button>
              <Button variant="secondary" iconLeft={<Download />}>
                Exportar
              </Button>
              <Button variant="ghost">Cancelar</Button>
              <Button variant="subtle" iconRight={<ArrowRight />}>
                Ver todo
              </Button>
              <Button variant="danger" iconLeft={<Trash />}>
                Eliminar
              </Button>
              <Button variant="danger-ghost">Vaciar papelera</Button>
            </Row>
          </Specimen>
          <Specimen title="Tamaños">
            <Row>
              <Button variant="primary" size="sm">
                Pequeño
              </Button>
              <Button variant="primary" size="md">
                Mediano
              </Button>
              <Button variant="primary" size="lg">
                Grande
              </Button>
            </Row>
          </Specimen>
          <Specimen title="Estados">
            <Row>
              <Button variant="primary" loading>
                Guardando
              </Button>
              <Button variant="secondary" loading>
                Cargando
              </Button>
              <Button variant="primary" disabled>
                Deshabilitado
              </Button>
              <Button variant="secondary" disabled>
                No disponible
              </Button>
            </Row>
          </Specimen>
          <Specimen title="Ancho completo">
            <Button variant="primary" size="lg" fullWidth iconLeft={<Save />}>
              Guardar cliente
            </Button>
          </Specimen>
          <Specimen title="IconButton" note="tooltip, atajo y contador">
            <Row>
              <IconButton icon={<Pencil />} label="Editar" shortcut="E" />
              <IconButton icon={<Copy />} label="Duplicar" variant="secondary" />
              <IconButton icon={<Bell />} label="Notificaciones" badge={4} />
              <IconButton icon={<Trash />} label="Eliminar" variant="danger-ghost" />
              <IconButton icon={<Plus />} label="Agregar" variant="primary" />
              <IconButton icon={<Search />} label="Buscar" size="sm" />
              <IconButton icon={<Download />} label="Descargando" loading />
            </Row>
          </Specimen>
        </div>
      </Section>

      {/* ------------------------------ Formularios ------------------------------ */}
      <Section id="formularios" title="Formularios" description="Etiqueta arriba, ayuda o error debajo. Campos de 36 px (42 px en pantallas táctiles)." gap="lg">
        <div className={styles.grid}>
          <Specimen title="Input">
            <div className={styles.stack}>
              <Input label="Nombre del cliente" required value={name} onValueChange={setName} clearable placeholder="Nombre y apellido" />
              <Input label="Teléfono" type="tel" inputMode="tel" optional prefix={<Smartphone />} value={phone} onValueChange={setPhone} placeholder="55 1234 5678" hint="Se usa para enviar el recibo por WhatsApp." />
              <Input label="IMEI" value="35-209900-176148" error="El IMEI debe tener 15 dígitos." onChange={() => {}} numeric />
              <Input label="Correo" value="ana@correo.mx" disabled onChange={() => {}} suffix={<Badge size="sm">Verificado</Badge>} />
            </div>
          </Specimen>
          <Specimen title="Dinero y cantidades">
            <div className={styles.stack}>
              <MoneyInput label="Cobro total" value={cobro} onChange={setCobro} hint={`Valor guardado: ${cobro} centavos`} />
              <MoneyInput
                label="Abonado"
                value={abono}
                onChange={setAbono}
                max={cobro}
                error={abono > cobro ? 'No puede ser mayor al cobro.' : undefined}
                suffix={
                  <button type="button" className={styles.inlineLink} onClick={() => setAbono(cobro)}>
                    Total
                  </button>
                }
              />
              <Row>
                <NumberStepper label="Cantidad" value={qty} onChange={setQty} min={1} max={99} unit="uds" />
                <NumberStepper label="Garantía" value={30} onChange={() => {}} unit="días" disabled />
              </Row>
            </div>
          </Specimen>
          <Specimen title="Select, Combobox y fecha">
            <div className={styles.stack}>
              <Select
                label="Categoría"
                value={cat}
                onChange={setCat}
                options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: EXPENSE_CATEGORY_LABEL[c] }))}
              />
              <Combobox label="Marca" value={brand} onChange={setBrand} options={DEVICE_BRANDS} placeholder="Apple, Samsung…" hint="Escribe libremente o elige una sugerencia." />
              <Combobox
                label="Cliente"
                value={client}
                onChange={setClient}
                options={CLIENT_SUGGESTIONS}
                prefix={<Users />}
                placeholder="Busca por nombre o teléfono"
                onSelect={(o) => toast.info(`Cliente elegido: ${o.value}`)}
              />
              <DateTimeInput label="Fecha y hora del servicio" value={when} onChange={setWhen} required />
            </div>
          </Specimen>
          <Specimen title="Textarea y búsqueda">
            <div className={styles.stack}>
              <Textarea label="Falla reportada" value={notes} onValueChange={setNotes} maxLength={400} showCount />
              <SearchField value={search} onChange={setSearch} placeholder="Buscar por nombre, teléfono o IMEI" fullWidth />
              <Select label="Proveedor" value={null} onChange={() => {}} options={[]} disabled placeholder="Sin proveedores" />
            </div>
          </Specimen>
        </div>
      </Section>

      {/* ------------------------------- Selección ------------------------------- */}
      <Section id="seleccion" title="Selección" gap="lg">
        <div className={styles.grid}>
          <Specimen title="SegmentedControl">
            <div className={styles.stack}>
              <SegmentedControl
                aria-label="Periodo"
                value={period}
                onChange={setPeriod}
                options={[
                  { value: 'week', label: 'Semana' },
                  { value: 'month', label: 'Mes' },
                ]}
              />
              <SegmentedControl
                aria-label="Pago"
                size="sm"
                value={pay}
                onChange={setPay}
                options={[
                  { value: 'efectivo', label: 'Efectivo' },
                  { value: 'transferencia', label: 'Transferencia' },
                  { value: 'tarjeta', label: 'Tarjeta' },
                  { value: 'otro', label: 'Otro', disabled: true },
                ]}
              />
            </div>
          </Specimen>
          <Specimen title="Tabs">
            <Tabs
              aria-label="Estado"
              value={tab}
              onChange={setTab}
              items={[
                { value: 'todos', label: 'Todos', count: 128 },
                { value: 'taller', label: 'En taller', count: 8 },
                { value: 'listos', label: 'Listos', count: 3 },
                { value: 'entregados', label: 'Entregados' },
              ]}
            />
          </Specimen>
          <Specimen title="Switch y Checkbox">
            <div className={styles.stack}>
              <Switch checked={sw1} onChange={setSw1} label="Avisar cuando un repuesto se agote" description="Notificación cuando el stock llega al mínimo." />
              <Switch checked={sw2} onChange={setSw2} label="Resumen diario" description="Cada día a las 20:00." />
              <Row>
                <Switch checked onChange={() => {}} size="sm" aria-label="Pequeño" />
                <Switch checked={false} onChange={() => {}} disabled aria-label="Deshabilitado" />
                <Checkbox checked={ck1} onChange={setCk1} label="Registrar como gasto" />
                <Checkbox checked={ck2} onChange={setCk2} indeterminate={!ck2} label="Parcial" />
                <Checkbox checked onChange={() => {}} disabled label="Bloqueado" />
              </Row>
            </div>
          </Specimen>
          <Specimen title="RadioCards">
            <RadioCards
              aria-label="Método de pago"
              value={pay}
              onChange={setPay}
              columns={2}
              options={[
                { value: 'efectivo', label: 'Efectivo', description: 'Pago en mostrador', icon: <Wallet /> },
                { value: 'transferencia', label: 'Transferencia', description: 'SPEI o depósito', icon: <ArrowRight /> },
                { value: 'tarjeta', label: 'Tarjeta', description: 'Terminal bancaria', icon: <CircleDollarSign /> },
                { value: 'otro', label: 'Otro', description: 'Vale, crédito…', icon: <Receipt /> },
              ]}
            />
          </Specimen>
          <Specimen title="FilterChips" wide>
            <div className={styles.stack}>
              <FilterChips
                aria-label="Filtro"
                value={chip}
                onChange={setChip}
                options={[
                  { value: 'activos', label: 'En taller', count: 8 },
                  { value: 'listos', label: 'Listos', count: 3 },
                  { value: 'pendientes', label: 'Con saldo', count: 5 },
                  { value: 'todos', label: 'Todos', count: 128 },
                ]}
              />
              <FilterChips
                multiple
                aria-label="Estados"
                size="sm"
                value={chips}
                onChange={setChips}
                options={REPAIR_STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1), dotColor: `var(--status-${s})` }))}
              />
            </div>
          </Specimen>
        </div>
      </Section>

      {/* --------------------------------- Datos --------------------------------- */}
      <Section
        id="datos"
        title="Datos"
        description="Indicadores, montos, fechas y etiquetas."
        actions={
          <Button size="sm" variant="secondary" iconLeft={<TrendingUp />} onClick={() => setKpiSeed((s) => s + 1)}>
            Animar valores
          </Button>
        }
        gap="lg"
      >
        <div className={styles.kpis}>
          <KpiCard label="Cobrado" tone="income" icon={<Wallet />} value={kpi.cobrado} format={money} delta={0.124} deltaLabel="vs. semana anterior" />
          <KpiCard label="Gastado" tone="expense" icon={<Receipt />} value={kpi.gastado} format={money} delta={0.081} invertDelta deltaLabel="vs. semana anterior" />
          <KpiCard label="Ganancia" tone="profit" icon={<TrendingUp />} value={kpi.ganancia} format={money} previous={2_500_000} deltaLabel="vs. semana anterior" />
          <KpiCard label="Por cobrar" tone="pending" icon={<CircleDollarSign />} value={kpi.pendiente} format={money} delta={-0.05} invertDelta footer="5 servicios con saldo" />
        </div>
        <div className={styles.kpis}>
          <KpiCard label="Equipos en taller" tone="brand" icon={<Wrench />} value={8} delta={0} deltaLabel="sin cambios" />
          <KpiCard label="Servicios" icon={<Smartphone />} value={42} delta={null} deltaLabel="primer periodo" />
          <KpiCard label="Cargando" tone="income" icon={<Wallet />} value={0} loading />
          <KpiCard label="Clicable" tone="profit" icon={<ArrowRight />} value={128} onClick={() => toast.info('KpiCard interactiva')} footer="Abre el detalle" />
        </div>
        <div className={styles.grid}>
          <Specimen title="Badge" note="tonos y punto">
            <Row>
              {(['neutral', 'brand', 'income', 'expense', 'profit', 'pending', 'success', 'warning', 'danger', 'info'] as BadgeTone[]).map((t) => (
                <Badge key={t} tone={t} dot>
                  {t}
                </Badge>
              ))}
            </Row>
            <Row>
              <Badge tone="warning" size="sm">
                Por pedir
              </Badge>
              <Badge tone="danger" solid size="sm">
                Agotado
              </Badge>
              <Badge tone="brand" solid>
                12
              </Badge>
              <Badge tone="success" icon={<Package />}>
                En stock
              </Badge>
              <Badge tone="info" dot pulse>
                Sincronizando
              </Badge>
            </Row>
          </Specimen>
          <Specimen title="MoneyText">
            <div className={styles.stack}>
              <Row>
                <MoneyText cents={4215050} size="xl" weight="semibold" />
                <MoneyText cents={2829000} tone="profit" size="lg" weight="semibold" />
              </Row>
              <Row>
                <MoneyText cents={85000} tone="income" sign />
                <MoneyText cents={-138600} tone="auto" sign />
                <MoneyText cents={31200} tone="pending" />
                <MoneyText cents={1250000} compact />
                <MoneyText cents={95000} strike />
              </Row>
            </div>
          </Specimen>
          <Specimen title="DateTimeText" note="title con fecha completa">
            <div className={styles.stack}>
              <span>
                Fecha y hora: <DateTimeText value={NOW - 3 * H} />
              </span>
              <span>
                Sólo fecha: <DateTimeText value={NOW - 30 * H} variant="date" /> · Sólo hora: <DateTimeText value={NOW} variant="time" />
              </span>
              <span>
                Relativa: <DateTimeText value={NOW - 5 * 60_000} variant="relative" muted />
              </span>
              <span>
                Relativa + exacta: <DateTimeText value={NOW - 26 * H} variant="relative-datetime" muted />
              </span>
            </div>
          </Specimen>
          <Specimen title="ProgressBar">
            <div className={styles.stack}>
              <ProgressBar label="Meta mensual" valueLabel={`${money(2829000)} / ${money(4000000)}`} value={2829000} max={4000000} />
              <ProgressBar label="Cobrado del total" valueLabel="72 %" value={0.72} tone="income" />
              <ProgressBar value={0.3} tone="warning" size="xs" aria-label="Stock" />
              <ProgressBar value={0.9} tone="danger" size="md" aria-label="Uso" />
            </div>
          </Specimen>
          <Specimen title="AnimatedNumber">
            <div className={styles.bigNumber}>
              <AnimatedNumber value={kpi.ganancia} format={money} />
            </div>
          </Specimen>
          <Specimen title="Avatar, Kbd, Spinner y Divider">
            <Row>
              {DEMO_ROWS.slice(0, 5).map((r, i) => (
                <Avatar key={r.id} name={r.nombre} size={(['xs', 'sm', 'md', 'lg', 'xl'] as const)[i]} />
              ))}
            </Row>
            <Row>
              <KbdGroup keys={['⌘', 'K']} />
              <Kbd>/</Kbd>
              <Kbd>C</Kbd>
              <Divider orientation="vertical" />
              <Spinner size={14} />
              <Spinner size={18} />
              <Spinner size={24} />
            </Row>
            <Divider label="o continúa con" />
          </Specimen>
        </div>
      </Section>

      {/* -------------------------------- Tarjetas -------------------------------- */}
      <Section id="tarjetas" title="Tarjetas" gap="lg">
        <div className={styles.cards3}>
          <Card title="Servicios de hoy" description="3 equipos recibidos" icon={<Smartphone />} actions={<IconButton icon={<ArrowRight />} label="Ver todos" size="sm" />} footer="Actualizado hace 2 min">
            <div className={styles.stack}>
              {DEMO_ROWS.slice(0, 3).map((r) => (
                <div key={r.id} className={styles.miniRow}>
                  <Avatar name={r.nombre} size="sm" />
                  <span className={styles.miniName}>{r.nombre}</span>
                  <StatusBadge status={r.estado} size="sm" short />
                </div>
              ))}
            </div>
          </Card>
          <Card variant="glass" title="Variante glass" description="Fondo translúcido con desenfoque, para destacar sobre el fondo ambiental.">
            <MoneyText cents={2829000} size="xl" weight="semibold" tone="profit" />
          </Card>
          <Card interactive onClick={() => toast.info('Tarjeta interactiva')} title="Interactiva" description="Elevación al pasar el cursor y borde luminoso sutil.">
            <Row>
              <Badge tone="brand" dot>
                Clic o Enter
              </Badge>
            </Row>
          </Card>
        </div>
      </Section>

      {/* --------------------------------- Tabla --------------------------------- */}
      <Section
        id="tabla"
        title="DataTable"
        description="Orden por columna, cabecera fija, filas clicables (Enter, ↑ ↓). En móvil, tarjetas."
        actions={
          <SegmentedControl
            size="sm"
            aria-label="Estado de la tabla"
            value={tableState}
            onChange={setTableState}
            options={[
              { value: 'datos', label: 'Datos' },
              { value: 'cargando', label: 'Cargando' },
              { value: 'vacio', label: 'Vacía' },
            ]}
          />
        }
      >
        <Toolbar aria-label="Filtros de clientes">
          <SearchField value={search} onChange={setSearch} placeholder="Buscar clientes" shortcut={false} />
          <FilterChips
            aria-label="Filtro"
            size="sm"
            value={chip}
            onChange={setChip}
            options={[
              { value: 'activos', label: 'En taller', count: 4 },
              { value: 'todos', label: 'Todos', count: 6 },
            ]}
          />
          <ToolbarSpacer />
          <Button size="sm" variant="secondary" iconLeft={<Filter />}>
            Filtros
          </Button>
        </Toolbar>
        <DataTable
          caption="Clientes de ejemplo"
          columns={columns}
          rows={tableState === 'cargando' ? undefined : tableState === 'vacio' ? [] : DEMO_ROWS.filter((r) => !search || r.nombre.toLowerCase().includes(search.toLowerCase()))}
          getRowId={(r) => r.id}
          defaultSort={{ key: 'fecha', dir: 'desc' }}
          onRowClick={(r) => toast.info(r.nombre, { description: `#${String(r.folio).padStart(6, '0')} · ${r.equipo}` })}
          rowAccent={(r) => (r.estado === 'listo' ? 'var(--status-listo)' : undefined)}
          footer="6 clientes · ordenados por fecha"
          empty={
            <EmptyState
              size="sm"
              icon={<Users />}
              accent={<Search />}
              title="Sin resultados"
              description="Ningún cliente coincide con la búsqueda."
              action={
                <Button size="sm" variant="secondary" onClick={() => setTableState('datos')}>
                  Limpiar filtros
                </Button>
              }
            />
          }
          renderMobileRow={(r) => (
            <div className={styles.mobileRow}>
              <Avatar name={r.nombre} size="md" />
              <div className={styles.cellText}>
                <span className={styles.cellTitle}>{r.nombre}</span>
                <span className={styles.cellSub}>
                  #{String(r.folio).padStart(6, '0')} · {r.equipo}
                </span>
                <span className={styles.cellSub}>
                  <DateTimeText value={r.fecha} />
                </span>
              </div>
              <div className={styles.mobileRight}>
                <MoneyText cents={r.cobroCents} weight="semibold" />
                <StatusBadge status={r.estado} size="sm" short />
              </div>
            </div>
          )}
        />
      </Section>

      {/* --------------------------------- Capas --------------------------------- */}
      <Section id="capas" title="Capas" description="Sheet, Dialog, confirm(), toast(), menús, popovers y tooltips." gap="lg">
        <div className={styles.grid}>
          <Specimen title="Sheet" note="lateral en escritorio · hoja inferior en móvil">
            <Row>
              <Button variant="primary" iconLeft={<UserPlus />} onClick={() => setSheet(true)}>
                Nuevo cliente
              </Button>
              <Button variant="secondary" onClick={() => setSheetLg(true)}>
                Sheet grande
              </Button>
            </Row>
          </Specimen>
          <Specimen title="Dialog y confirm()">
            <Row>
              <Button variant="secondary" onClick={() => setDialog(true)}>
                Abrir diálogo
              </Button>
              <Button
                variant="danger-ghost"
                iconLeft={<Trash />}
                onClick={async () => {
                  const ok = await confirm({
                    title: '¿Enviar a la papelera?',
                    description: 'Ana Sofía López · #000128. Podrás restaurarlo desde Ajustes › Papelera.',
                    confirmLabel: 'Enviar a la papelera',
                    tone: 'danger',
                  });
                  if (ok) toast.undo('Cliente enviado a la papelera', () => toast.success('Cliente restaurado'));
                }}
              >
                Eliminar
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  const ok = await confirm({ title: '¿Marcar como entregado?', description: 'Se registrará la fecha y hora de entrega.', confirmLabel: 'Marcar entregado' });
                  toast({ title: ok ? 'Equipo entregado' : 'Sin cambios', tone: ok ? 'success' : 'neutral' });
                }}
              >
                Confirmar
              </Button>
            </Row>
          </Specimen>
          <Specimen title="toast()" note="apilado · desliza para descartar">
            <Row>
              <Button size="sm" variant="secondary" onClick={() => toast.success('Gasto guardado', { description: 'Pantalla OLED iPhone 12 · ' + money(185000) })}>
                Éxito
              </Button>
              <Button size="sm" variant="secondary" onClick={() => toast.error('No se pudo guardar', { description: 'Revisa los campos marcados.' })}>
                Error
              </Button>
              <Button size="sm" variant="secondary" onClick={() => toast.warning('Stock bajo', { description: 'Quedan 2 baterías de iPhone 11.' })}>
                Aviso
              </Button>
              <Button size="sm" variant="secondary" onClick={() => toast.info('Copia de seguridad lista')}>
                Info
              </Button>
              <Button size="sm" variant="secondary" onClick={() => toast.undo('Repuesto eliminado', () => toast.success('Repuesto restaurado'))}>
                Deshacer
              </Button>
            </Row>
          </Specimen>
          <Specimen title="DropdownMenu, Popover y Tooltip">
            <Row>
              <DropdownMenu
                label="Acciones del cliente"
                items={[
                  { type: 'label', label: 'Cliente' },
                  { label: 'Editar', icon: <Pencil />, shortcut: ['E'], onSelect: () => toast.info('Editar') },
                  { label: 'Duplicar', icon: <Copy />, onSelect: () => toast.info('Duplicar') },
                  { label: 'Usar repuesto', icon: <PackagePlus />, description: 'Descontar del inventario', onSelect: () => toast.info('Usar repuesto') },
                  { label: 'Exportar', icon: <Download />, disabled: true },
                  { type: 'separator' },
                  { label: 'Enviar a la papelera', icon: <Trash />, danger: true, onSelect: () => toast.undo('Cliente enviado a la papelera', () => {}) },
                ]}
                trigger={<Button variant="secondary">Acciones</Button>}
              />
              <Popover trigger={<Button variant="ghost">Popover</Button>} width={280} label="Detalle de pago">
                {(close) => (
                  <div className={styles.stack}>
                    <strong>Saldo pendiente</strong>
                    <MoneyText cents={189000} tone="pending" size="lg" weight="semibold" />
                    <Button size="sm" variant="primary" onClick={close}>
                      Registrar abono
                    </Button>
                  </div>
                )}
              </Popover>
              <Tooltip content="Se guarda en este equipo" shortcut={['⌘', 'S']}>
                <Button variant="ghost">Tooltip</Button>
              </Tooltip>
            </Row>
          </Specimen>
        </div>
      </Section>

      {/* ----------------------------- Vacíos y carga ----------------------------- */}
      <Section id="vacios" title="Estados vacíos y de carga" gap="lg">
        <div className={styles.cards3}>
          <Card padding="none">
            <EmptyState
              icon={<Users />}
              accent={<Plus />}
              title="Aún no hay clientes"
              description="Registra el primer equipo que llegue al taller y aquí verás su estado, cobro y fotos."
              action={
                <Button variant="primary" iconLeft={<UserPlus />}>
                  Nuevo cliente
                </Button>
              }
            />
          </Card>
          <Card padding="none">
            <EmptyState
              tone="expense"
              icon={<Receipt />}
              title="Sin gastos esta semana"
              description="Cuando compres repuestos, regístralos para calcular tu ganancia real."
              secondaryAction={<Button variant="ghost">Ver mes</Button>}
              action={<Button variant="secondary">Registrar gasto</Button>}
            />
          </Card>
          <Card padding="md" title="Skeleton" description="Brillo que respeta el movimiento reducido">
            <div className={styles.stack}>
              <div className={styles.miniRow}>
                <Skeleton circle height={32} />
                <div style={{ flex: 1 }}>
                  <Skeleton lines={2} />
                </div>
              </div>
              <Skeleton height={64} radius={10} />
              <Skeleton width="40%" height={10} />
            </div>
          </Card>
        </div>
      </Section>

      {/* ------------------------------- Estructura ------------------------------- */}
      <Section id="estructura" title="Estructura de página" description="PageHeader + Toolbar + contenido. Espaciado vertical entre secciones: 32 px." gap="lg">
        <Card>
          <PageHeader
            back={{ href: '#/clientes', label: 'Clientes' }}
            title="Ana Sofía López"
            meta={<StatusBadge status="reparando" />}
            subtitle={
              <>
                #000128 · Apple iPhone 13 · <DateTimeText value={NOW - 2 * H} />
              </>
            }
            leading={<Avatar name="Ana Sofía López" size="lg" />}
            actions={
              <>
                <Button variant="secondary" iconLeft={<Pencil />}>
                  Editar
                </Button>
                <Button variant="primary" iconLeft={<Save />}>
                  Marcar listo
                </Button>
              </>
            }
          />
          <Toolbar>
            <SegmentedControl
              size="sm"
              aria-label="Periodo"
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'week', label: 'Semana' },
                { value: 'month', label: 'Mes' },
              ]}
            />
            <ToolbarSpacer />
            <Button size="sm" variant="ghost" iconLeft={<Download />}>
              Exportar CSV
            </Button>
          </Toolbar>
        </Card>
      </Section>

      {/* --------------------------------- Capas --------------------------------- */}
      <Sheet
        open={sheet}
        onClose={() => !saving && setSheet(false)}
        dismissible={!saving}
        icon={<UserPlus />}
        title="Nuevo cliente"
        description="Datos del cliente, su equipo y el servicio."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSheet(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="galeria-form" loading={saving} iconLeft={<Save />}>
              Guardar cliente
            </Button>
          </>
        }
      >
        <form
          id="galeria-form"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <FormSection title="Cliente">
            <FormGrid>
              <Input label="Nombre" required value={name} onValueChange={setName} data-autofocus />
              <Input label="Teléfono" type="tel" inputMode="tel" value={phone} onValueChange={setPhone} placeholder="55 1234 5678" />
            </FormGrid>
          </FormSection>
          <FormSection title="Equipo">
            <FormGrid>
              <Combobox label="Marca" value={brand} onChange={setBrand} options={DEVICE_BRANDS} />
              <Input label="Modelo" placeholder="Galaxy A54" />
              <Textarea label="Falla" containerClassName="span-all" value={notes} onValueChange={setNotes} minRows={2} />
            </FormGrid>
          </FormSection>
          <FormSection title="Cobro">
            <FormGrid>
              <MoneyInput label="Cobro total" value={cobro} onChange={setCobro} />
              <MoneyInput label="Abonado" value={abono} onChange={setAbono} max={cobro} />
              <DateTimeInput label="Fecha y hora" value={when} onChange={setWhen} containerClassName="span-all" />
            </FormGrid>
          </FormSection>
        </form>
      </Sheet>

      <Sheet open={sheetLg} onClose={() => setSheetLg(false)} size="lg" title="Detalle del repuesto" description="Pantalla OLED iPhone 12 · SKU PAN-IP12-OLED">
        <div className={styles.stack}>
          <div className={styles.kpis2}>
            <KpiCard label="Stock" icon={<Package />} value={3} tone="brand" />
            <KpiCard label="Valor" icon={<Wallet />} value={555000} format={money} tone="income" />
          </div>
          <ProgressBar label="Stock vs. mínimo" valueLabel="3 de 5" value={3} max={5} tone="warning" />
          <EmptyState size="sm" icon={<Package />} title="Sin movimientos" description="Las entradas, usos y ajustes aparecerán aquí con fecha y hora." />
        </div>
      </Sheet>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        icon={<Smartphone />}
        title="Equipo listo para entregar"
        description="Se notificará al cliente por WhatsApp con el recibo y el saldo pendiente."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(false)}>
              Ahora no
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setDialog(false);
                toast.success('Recibo listo para enviar');
              }}
            >
              Preparar recibo
            </Button>
          </>
        }
      >
        <div className={styles.dialogBody}>
          <span>Saldo pendiente</span>
          <MoneyText cents={189000} tone="pending" weight="semibold" size="lg" />
        </div>
      </Dialog>
    </div>
  );
}

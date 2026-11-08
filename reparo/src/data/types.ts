/* ==========================================================================
   Reparo — Contrato de datos (fuente única de verdad)
   --------------------------------------------------------------------------
   Reglas:
   - Todo el dinero se guarda en CENTAVOS enteros (sufijo `Cents`). Nunca floats.
   - Toda fecha es epoch en milisegundos (number). Se muestra SIEMPRE fecha y hora.
   - Borrado lógico: `deletedAt` != null → está en la papelera (restaurable).
   - Cada creación/edición/eliminación/restauración genera un AuditEntry en la
     MISMA transacción (registro inmutable de actividad).
   ========================================================================== */

export type ID = string;
/** Epoch en milisegundos. */
export type Timestamp = number;

export interface BaseRecord {
  id: ID;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** null = activo. Número = fecha en que se envió a la papelera. */
  deletedAt: Timestamp | null;
  /** Dispositivo que hizo el último cambio (para sincronización). */
  deviceId: string;
  /** Revisión incremental local (1 al crear, +1 por cada edición). */
  rev: number;
}

/* ------------------------------ Clientes -------------------------------- */

export type RepairStatus =
  | 'recibido'
  | 'diagnostico'
  | 'reparando'
  | 'listo'
  | 'entregado'
  | 'cancelado';

export type PaymentMethod = 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';

/** Derivado de cobroCents vs pagadoCents. */
export type PaymentStatus = 'pendiente' | 'parcial' | 'pagado';

/**
 * Un "cliente" es el registro de un servicio técnico: la persona, su equipo,
 * el trabajo realizado y cuánto se le cobró.
 */
export type UnlockType = 'ninguno' | 'patron' | 'pin' | 'contrasena';

export interface Client extends BaseRecord {
  /** Folio consecutivo del servicio (lo asigna la capa de datos: 1, 2, 3…). Se muestra como "#000123". */
  folio: number;
  nombre: string;
  telefono: string;
  email: string;
  /** Marca del equipo: Apple, Samsung, Xiaomi, Motorola... */
  marca: string;
  modelo: string;
  /** IMEI o número de serie (opcional). */
  imei: string;
  /** Tipo de servicio (p. ej. "Cambio de pantalla"). Ver SERVICE_TYPES. */
  servicio: string;
  /** Descripción libre de la falla / diagnóstico. */
  falla: string;
  estado: RepairStatus;
  /** Precio total del servicio, en centavos. */
  cobroCents: number;
  /** Cuánto ha pagado ya el cliente, en centavos (0..cobroCents). */
  pagadoCents: number;
  metodoPago: PaymentMethod;
  /** Fecha y hora del servicio (cuenta para los reportes). */
  fecha: Timestamp;
  /** Fecha y hora de entrega del equipo, si ya se entregó. */
  fechaEntrega: Timestamp | null;
  /** Días de garantía ofrecidos (0 = sin garantía). */
  garantiaDias: number;
  /** Tipo de bloqueo de pantalla del equipo. */
  desbloqueoTipo: UnlockType;
  /**
   * Patrón de desbloqueo: secuencia de puntos de una cuadrícula 3×3,
   * numerados 0..8 de izquierda a derecha y de arriba abajo. [] si no aplica.
   */
  desbloqueoPatron: number[];
  /** PIN o contraseña (texto) si desbloqueoTipo es 'pin' | 'contrasena'. */
  desbloqueoCodigo: string;
  /** Cantidad de fotos de evidencia guardadas (denormalizado para listas). */
  numFotos: number;
  notas: string;
}

/** Campos que el usuario captura al crear/editar un cliente (folio y numFotos los gestiona la capa de datos). */
export type ClientInput = Omit<Client, keyof BaseRecord | 'folio' | 'numFotos'>;

/* -------------------------- Evidencia fotográfica ------------------------- */

export type PhotoKind = 'ingreso' | 'reparacion' | 'entrega';

export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  ingreso: 'Al recibir',
  reparacion: 'Durante la reparación',
  entrega: 'Al entregar',
};

/** Foto de evidencia del estado del equipo (guardada como Blob en IndexedDB, offline). */
export interface ClientPhoto {
  id: ID;
  clientId: ID;
  kind: PhotoKind;
  /** Imagen comprimida (JPEG/WebP, lado mayor ≤ 1600 px). */
  blob: Blob;
  /** Miniatura (lado mayor ≤ 360 px). */
  thumb: Blob;
  width: number;
  height: number;
  caption: string;
  /** Fecha y hora en que se tomó/agregó. */
  ts: Timestamp;
  deviceId: string;
}

/* ------------------------------- Gastos --------------------------------- */

export type ExpenseCategory =
  | 'pantallas'
  | 'baterias'
  | 'puertos'
  | 'camaras'
  | 'placas'
  | 'carcasas'
  | 'herramientas'
  | 'accesorios'
  | 'otros';

export interface Expense extends BaseRecord {
  /** Nombre del repuesto o concepto (p. ej. "Pantalla OLED iPhone 12"). */
  concepto: string;
  categoria: ExpenseCategory;
  proveedor: string;
  cantidad: number;
  costoUnitarioCents: number;
  /** Siempre = cantidad * costoUnitarioCents (lo calcula la capa de datos). */
  totalCents: number;
  /** Cliente/servicio al que se asocia este repuesto (opcional). */
  clienteId: ID | null;
  /** Artículo de inventario que se repuso con esta compra (opcional). */
  inventarioId: ID | null;
  metodoPago: PaymentMethod;
  /** Fecha y hora de la compra (cuenta para los reportes). */
  fecha: Timestamp;
  notas: string;
}

export type ExpenseInput = Omit<Expense, keyof BaseRecord | 'totalCents'>;


/* ------------------------------ Inventario ------------------------------ */

/**
 * Repuesto en existencia. Regla contable: COMPRAR/REPONER stock puede generar
 * un Expense (gasto) vinculado vía `inventarioId`; USAR una pieza NO genera
 * gasto (ya se contó al comprarla), sólo descuenta stock y puede vincularse a
 * un cliente para conocer el costo de piezas de ese servicio.
 */
export interface InventoryItem extends BaseRecord {
  /** "Pantalla OLED iPhone 12". */
  nombre: string;
  categoria: ExpenseCategory;
  /** Compatibilidad (opcional): marca y modelo(s). */
  marca: string;
  modelo: string;
  /** Código interno / SKU (opcional). */
  sku: string;
  proveedor: string;
  /** Unidades disponibles (entero >= 0). */
  stock: number;
  /** Umbral: con stock <= stockMinimo el artículo pasa a "Por pedir". */
  stockMinimo: number;
  /** Cantidad sugerida a pedir al reponer. */
  cantidadPedido: number;
  /** Costo de compra por unidad (centavos). */
  costoUnitarioCents: number;
  /** Precio sugerido al cliente por unidad instalada (centavos, 0 = n/d). */
  precioVentaCents: number;
  /** Cajón / estante / caja. */
  ubicacion: string;
  /** Marcado manualmente para volver a pedir aunque haya stock. */
  marcadoReorden: boolean;
  /** Fecha en que se hizo el pedido al proveedor (null = no pedido aún). */
  pedidoAt: Timestamp | null;
  notas: string;
}

export type InventoryItemInput = Omit<InventoryItem, keyof BaseRecord>;

/** Estado derivado para la UI. */
export type StockStatus = 'ok' | 'bajo' | 'agotado' | 'pedido';

export type InventoryMovementType =
  | 'entrada'   // compra / reposición (+)
  | 'uso'       // pieza utilizada en una reparación (−)
  | 'ajuste'    // corrección manual de conteo (±)
  | 'merma';    // pieza dañada / defectuosa (−)

export interface InventoryMovement {
  id: ID;
  itemId: ID;
  type: InventoryMovementType;
  /** Con signo: +3 entrada, −1 uso. */
  cantidad: number;
  stockAntes: number;
  stockDespues: number;
  /** Costo unitario al momento del movimiento (centavos). */
  costoUnitarioCents: number;
  /** Cliente/servicio en el que se usó (para 'uso'). */
  clienteId: ID | null;
  /** Gasto generado (para 'entrada' con registro de gasto). */
  gastoId: ID | null;
  nota: string;
  /** Fecha y hora del movimiento. */
  ts: Timestamp;
  deviceId: string;
}

/* ---------------------------- Notificaciones ---------------------------- */

export type NotificationKind =
  | 'stock_bajo'        // un repuesto llegó al mínimo o se agotó
  | 'listo_sin_entregar'// equipo listo hace N días y no se ha entregado
  | 'pago_pendiente'    // servicio entregado con saldo por cobrar
  | 'garantia'          // garantía por vencer
  | 'resumen'           // resumen diario / semanal de ganancias
  | 'respaldo'          // recordatorio de copia de seguridad
  | 'meta'              // meta mensual alcanzada
  | 'sistema';

export interface AppNotification {
  id: ID;
  ts: Timestamp;
  kind: NotificationKind;
  title: string;
  body: string;
  /** Ruta hash a la que lleva al tocarla, p. ej. "#/inventario?id=..". */
  href: string;
  entityId: ID | null;
  readAt: Timestamp | null;
  /** Clave de deduplicación (evita repetir la misma alerta). */
  dedupeKey: string;
}

/* ------------------------- Registro de actividad ------------------------- */

export type AuditAction =
  | 'crear'
  | 'editar'
  | 'eliminar'      // enviado a la papelera (restaurable)
  | 'restaurar'
  | 'purgar'        // eliminado definitivamente
  | 'movimiento'    // movimiento de inventario (entrada/uso/ajuste/merma)
  | 'importar'
  | 'exportar'
  | 'ajustes'
  | 'sistema';

export type EntityType = 'cliente' | 'gasto' | 'inventario' | 'ajustes' | 'sistema';
// Las fotos se auditan como entity 'cliente' (action 'editar', summary "Agregó 2 fotos de evidencia").

export interface FieldChange {
  /** Clave técnica del campo (p. ej. "cobroCents"). */
  field: string;
  /** Etiqueta legible en español (p. ej. "Monto cobrado"). */
  label: string;
  from: unknown;
  to: unknown;
  /** Valor anterior ya formateado para mostrar (dinero, fechas, enums...). */
  fromText: string;
  /** Valor nuevo ya formateado para mostrar. */
  toText: string;
}

export interface AuditEntry {
  id: ID;
  /** Fecha y hora exacta del evento. */
  ts: Timestamp;
  action: AuditAction;
  entity: EntityType;
  entityId: ID | null;
  /** Título legible: "Ana López · iPhone 13" o "Pantalla OLED iPhone 12". */
  title: string;
  /** Frase corta: "Editó 2 campos", "Registró cliente", etc. */
  summary: string;
  changes: FieldChange[];
  /** Copia del registro tras el evento (o antes, si se eliminó). */
  snapshot: Client | Expense | InventoryItem | Record<string, unknown> | null;
  deviceId: string;
}

/* ------------------------------- Ajustes -------------------------------- */

export type ThemePreference = 'dark' | 'light' | 'system';

export interface Settings {
  id: 'settings';
  businessName: string;
  ownerName: string;
  /* Datos que aparecen en el recibo */
  businessPhone: string;
  businessAddress: string;
  /** Texto al pie del recibo (garantía, horario, agradecimiento). */
  receiptFooter: string;
  /** Código de país para WhatsApp sin "+": "52" México, "57" Colombia, "54" Argentina… */
  phoneCountryCode: string;
  /** Código ISO 4217: MXN, USD, COP, ARS, CLP, PEN, EUR, GTQ, BOB, DOP... */
  currency: string;
  /** Locale BCP-47 para formatos: es-MX, es-CO, es-AR, es-ES... */
  locale: string;
  /** 1 = lunes (por defecto), 0 = domingo. */
  weekStartsOn: 0 | 1;
  theme: ThemePreference;
  /** true cuando terminó el onboarding inicial. */
  onboarded: boolean;
  /** Meta mensual de ganancia en centavos (0 = sin meta). */
  monthlyGoalCents: number;
  /** URL del servidor de sincronización opcional ("" = desactivado). */
  syncUrl: string;
  syncEnabled: boolean;
  /* Notificaciones */
  notificationsEnabled: boolean;
  notifyLowStock: boolean;
  notifyReadyPickup: boolean;
  /** Días que un equipo puede estar "listo" antes de recordar entregarlo. */
  readyPickupDays: number;
  notifyPendingPayment: boolean;
  notifyDailySummary: boolean;
  /** Hora local (0-23) del resumen diario. */
  dailySummaryHour: number;
  notifyBackupReminder: boolean;
  /** true si el dispositivo está suscrito a Web Push vía el servidor. */
  pushSubscribed: boolean;
  lastSyncAt: Timestamp | null;
  lastBackupAt: Timestamp | null;
  updatedAt: Timestamp;
}

/* ------------------------------ Reportes -------------------------------- */

export type PeriodKind = 'week' | 'month';

export interface DateRange {
  /** Inclusivo. */
  start: Timestamp;
  /** Exclusivo. */
  end: Timestamp;
}

export interface Period extends DateRange {
  kind: PeriodKind;
  /** Etiqueta: "Semana del 2 al 8 de nov. 2026" / "Noviembre 2026". */
  label: string;
  /** Etiqueta corta: "2–8 nov" / "nov 2026". */
  shortLabel: string;
}

export interface Summary {
  range: DateRange;
  /** Lo efectivamente cobrado (suma de pagadoCents de servicios en el rango). */
  cobradoCents: number;
  /** Valor total de los servicios del rango (suma de cobroCents). */
  facturadoCents: number;
  /** Pendiente por cobrar (facturado - cobrado) de servicios del rango. */
  porCobrarCents: number;
  /** Total gastado en repuestos/otros en el rango. */
  gastadoCents: number;
  /** cobrado - gastado. */
  gananciaCents: number;
  /** ganancia / cobrado (0..1). null si cobrado = 0. */
  margen: number | null;
  /** Servicios registrados (no cancelados). */
  servicios: number;
  /** Servicios entregados en el rango. */
  entregados: number;
  /** Ticket promedio = facturado / servicios. */
  ticketPromedioCents: number;
  /** Número de gastos registrados. */
  numGastos: number;
}

export interface SeriesPoint {
  /** Inicio del bucket (día, semana o mes). */
  start: Timestamp;
  end: Timestamp;
  /** Etiqueta corta del eje: "lun", "3 nov", "nov". */
  label: string;
  cobradoCents: number;
  gastadoCents: number;
  gananciaCents: number;
  servicios: number;
}

/* ------------------------------ Constantes ------------------------------ */

export const REPAIR_STATUSES: readonly RepairStatus[] = [
  'recibido',
  'diagnostico',
  'reparando',
  'listo',
  'entregado',
  'cancelado',
] as const;

export const REPAIR_STATUS_LABEL: Record<RepairStatus, string> = {
  recibido: 'Recibido',
  diagnostico: 'En diagnóstico',
  reparando: 'En reparación',
  listo: 'Listo para entregar',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  otro: 'Otro',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pendiente: 'Pendiente',
  parcial: 'Abono parcial',
  pagado: 'Pagado',
};

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'pantallas',
  'baterias',
  'puertos',
  'camaras',
  'placas',
  'carcasas',
  'herramientas',
  'accesorios',
  'otros',
] as const;

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  pantallas: 'Pantallas',
  baterias: 'Baterías',
  puertos: 'Puertos de carga',
  camaras: 'Cámaras',
  placas: 'Placas y chips',
  carcasas: 'Carcasas y tapas',
  herramientas: 'Herramientas',
  accesorios: 'Accesorios',
  otros: 'Otros',
};

export const SERVICE_TYPES: readonly string[] = [
  'Cambio de pantalla',
  'Cambio de batería',
  'Puerto de carga',
  'Cámara',
  'Tapa trasera',
  'Equipo mojado',
  'Altavoz / micrófono',
  'Botones',
  'Software / desbloqueo',
  'Reparación de placa',
  'Diagnóstico',
  'Otro',
] as const;

export const DEVICE_BRANDS: readonly string[] = [
  'Apple',
  'Samsung',
  'Xiaomi',
  'Motorola',
  'Huawei',
  'Honor',
  'Oppo',
  'Realme',
  'Vivo',
  'Google',
  'OnePlus',
  'Nokia',
  'ZTE',
  'Otro',
] as const;

export const CURRENCIES: readonly { code: string; locale: string; label: string }[] = [
  { code: 'MXN', locale: 'es-MX', label: 'Peso mexicano (MXN)' },
  { code: 'USD', locale: 'es-US', label: 'Dólar estadounidense (USD)' },
  { code: 'COP', locale: 'es-CO', label: 'Peso colombiano (COP)' },
  { code: 'ARS', locale: 'es-AR', label: 'Peso argentino (ARS)' },
  { code: 'CLP', locale: 'es-CL', label: 'Peso chileno (CLP)' },
  { code: 'PEN', locale: 'es-PE', label: 'Sol peruano (PEN)' },
  { code: 'BOB', locale: 'es-BO', label: 'Boliviano (BOB)' },
  { code: 'GTQ', locale: 'es-GT', label: 'Quetzal (GTQ)' },
  { code: 'DOP', locale: 'es-DO', label: 'Peso dominicano (DOP)' },
  { code: 'UYU', locale: 'es-UY', label: 'Peso uruguayo (UYU)' },
  { code: 'PYG', locale: 'es-PY', label: 'Guaraní (PYG)' },
  { code: 'CRC', locale: 'es-CR', label: 'Colón costarricense (CRC)' },
  { code: 'HNL', locale: 'es-HN', label: 'Lempira (HNL)' },
  { code: 'NIO', locale: 'es-NI', label: 'Córdoba (NIO)' },
  { code: 'VES', locale: 'es-VE', label: 'Bolívar (VES)' },
  { code: 'EUR', locale: 'es-ES', label: 'Euro (EUR)' },
] as const;

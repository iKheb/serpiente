/* Etiquetas en español complementarias a las de types.ts. */
import type {
  AuditAction,
  EntityType,
  InventoryMovementType,
  NotificationKind,
  Settings,
  StockStatus,
  ThemePreference,
  UnlockType,
} from './types';

export const UNLOCK_TYPES: readonly UnlockType[] = ['ninguno', 'patron', 'pin', 'contrasena'] as const;

export const UNLOCK_TYPE_LABEL: Record<UnlockType, string> = {
  ninguno: 'Sin bloqueo',
  patron: 'Patrón',
  pin: 'PIN',
  contrasena: 'Contraseña',
};

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  ok: 'En stock',
  bajo: 'Stock bajo',
  agotado: 'Agotado',
  pedido: 'Pedido',
};

export const MOVEMENT_TYPE_LABEL: Record<InventoryMovementType, string> = {
  entrada: 'Entrada',
  uso: 'Uso en reparación',
  ajuste: 'Ajuste de conteo',
  merma: 'Merma',
};

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  crear: 'Alta',
  editar: 'Edición',
  eliminar: 'Enviado a la papelera',
  restaurar: 'Restaurado',
  purgar: 'Eliminado definitivamente',
  movimiento: 'Movimiento de inventario',
  importar: 'Importación',
  exportar: 'Exportación',
  ajustes: 'Ajustes',
  sistema: 'Sistema',
};

export const ENTITY_LABEL: Record<EntityType, string> = {
  cliente: 'Cliente',
  gasto: 'Gasto',
  inventario: 'Inventario',
  ajustes: 'Ajustes',
  sistema: 'Sistema',
};

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  stock_bajo: 'Stock bajo',
  listo_sin_entregar: 'Listo sin entregar',
  pago_pendiente: 'Saldo pendiente',
  garantia: 'Garantía',
  resumen: 'Resumen',
  respaldo: 'Respaldo',
  meta: 'Meta mensual',
  sistema: 'Sistema',
};

export const THEME_LABEL: Record<ThemePreference, string> = {
  dark: 'Oscuro',
  light: 'Claro',
  system: 'Automático',
};

/** Etiquetas de campos por entidad (auditoría, formularios, CSV). */
export const FIELD_LABELS: Record<'cliente' | 'gasto' | 'inventario', Record<string, string>> = {
  cliente: {
    folio: 'Folio',
    nombre: 'Nombre',
    telefono: 'Teléfono',
    email: 'Correo',
    marca: 'Marca',
    modelo: 'Modelo',
    imei: 'IMEI / serie',
    servicio: 'Servicio',
    falla: 'Falla / diagnóstico',
    estado: 'Estado',
    cobroCents: 'Total del servicio',
    pagadoCents: 'Abonado',
    metodoPago: 'Método de pago',
    fecha: 'Fecha de recepción',
    fechaEntrega: 'Fecha de entrega',
    garantiaDias: 'Garantía',
    desbloqueoTipo: 'Tipo de bloqueo',
    desbloqueoPatron: 'Patrón de desbloqueo',
    desbloqueoCodigo: 'PIN / contraseña',
    numFotos: 'Fotos de evidencia',
    notas: 'Notas',
  },
  gasto: {
    concepto: 'Concepto',
    categoria: 'Categoría',
    proveedor: 'Proveedor',
    cantidad: 'Cantidad',
    costoUnitarioCents: 'Costo unitario',
    totalCents: 'Total',
    clienteId: 'Cliente',
    inventarioId: 'Artículo de inventario',
    metodoPago: 'Método de pago',
    fecha: 'Fecha de compra',
    notas: 'Notas',
  },
  inventario: {
    nombre: 'Nombre',
    categoria: 'Categoría',
    marca: 'Marca',
    modelo: 'Modelo compatible',
    sku: 'SKU / código',
    proveedor: 'Proveedor',
    stock: 'Stock',
    stockMinimo: 'Stock mínimo',
    cantidadPedido: 'Cantidad a pedir',
    costoUnitarioCents: 'Costo unitario',
    precioVentaCents: 'Precio de venta',
    ubicacion: 'Ubicación',
    marcadoReorden: 'Marcado para pedir',
    pedidoAt: 'Pedido al proveedor',
    notas: 'Notas',
  },
};

/** Etiquetas de los ajustes (auditoría). */
export const SETTINGS_FIELD_LABELS: Record<Exclude<keyof Settings, 'id' | 'updatedAt'>, string> = {
  businessName: 'Nombre del negocio',
  ownerName: 'Responsable',
  businessPhone: 'Teléfono del negocio',
  businessAddress: 'Dirección del negocio',
  receiptFooter: 'Pie del recibo',
  phoneCountryCode: 'Código de país (WhatsApp)',
  currency: 'Moneda',
  locale: 'Formato regional',
  weekStartsOn: 'Inicio de semana',
  theme: 'Tema',
  onboarded: 'Configuración inicial completada',
  monthlyGoalCents: 'Meta mensual de ganancia',
  syncUrl: 'Servidor de sincronización',
  syncEnabled: 'Sincronización',
  notificationsEnabled: 'Notificaciones',
  notifyLowStock: 'Avisar stock bajo',
  notifyReadyPickup: 'Avisar equipos listos sin entregar',
  readyPickupDays: 'Días para recordar la entrega',
  notifyPendingPayment: 'Avisar saldos pendientes',
  notifyDailySummary: 'Resumen diario',
  dailySummaryHour: 'Hora del resumen diario',
  notifyBackupReminder: 'Recordatorio de respaldo',
  pushSubscribed: 'Notificaciones push',
  lastSyncAt: 'Última sincronización',
  lastBackupAt: 'Último respaldo',
};

/** Etiquetas de los campos de una foto de evidencia. */
export const PHOTO_FIELD_LABELS: Record<string, string> = {
  caption: 'Descripción de la foto',
  kind: 'Momento de la foto',
};

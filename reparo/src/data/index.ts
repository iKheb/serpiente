/* API pública de la capa de datos: `import { … } from '@/data'`. */
import { db } from './db';
import { seedDemoData } from './demo';
import { wipeAllData } from './backup';
import { updateSettings } from './settings';
import { runNotificationChecks } from './notifications';

export * from './types';

// Base de datos y sistema
export { db, getDeviceId, dbReady, ensureSettings, readSettings, recomputeFolioSequence, type MetaRow, type ReparoDB } from './db';
export { newId } from './ids';
export { defaultSettings, DEFAULT_RECEIPT_FOOTER } from './defaults';
export { getCachedSettings, subscribeSettings } from './settings-cache';
export { ValidationError, NotFoundError, BackupError } from './errors';

// Formato
export {
  formatMoney,
  parseMoneyToCents,
  formatDateTime,
  formatDate,
  formatTime,
  formatRelative,
  formatDayHeading,
  formatDayMonth,
  formatFolio,
  formatNumber,
  formatPercent,
  formatIsoLocal,
  currencySymbol,
  currencyFractionDigits,
  centsToInput,
  dayKey,
  monthKey,
  startOfDay,
  calendarDayDiff,
  MINUS,
  type MoneyFormatOptions,
} from './format';

// Periodos
export {
  getPeriod,
  shiftPeriod,
  isCurrentPeriod,
  dayRange,
  lastDaysRange,
  previousRange,
  buildBuckets,
  type SeriesBucket,
  type Bucket,
} from './periods';

// Derivados y búsqueda
export {
  paymentStatus,
  saldoCents,
  stockStatus,
  needsReorder,
  normalizeText,
  matchesQuery,
  deviceLabel,
  deviceFullName,
  clientTitle,
  warrantyExpiresAt,
  maskedUnlock,
} from './derive';

// Formularios
export {
  emptyClientInput,
  emptyExpenseInput,
  emptyInventoryInput,
  clientInputSchema,
  expenseInputSchema,
  inventoryItemInputSchema,
  validateClientInput,
  validateExpenseInput,
  validateInventoryInput,
} from './schemas';
export {
  FIELD_LABELS,
  SETTINGS_FIELD_LABELS,
  UNLOCK_TYPES,
  UNLOCK_TYPE_LABEL,
  STOCK_STATUS_LABEL,
  MOVEMENT_TYPE_LABEL,
  AUDIT_ACTION_LABEL,
  ENTITY_LABEL,
  NOTIFICATION_KIND_LABEL,
  THEME_LABEL,
} from './labels';
export { formatFieldValue, diffFields } from './audit';

// Mutaciones
export { createClient, updateClient, deleteClient, restoreClient, purgeClient } from './clients';
export { createExpense, updateExpense, deleteExpense, restoreExpense, purgeExpense } from './expenses';
export {
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  restoreInventoryItem,
  purgeInventoryItem,
  consumeInventory,
  restockInventory,
  adjustInventory,
  registerWaste,
  markOrdered,
  setReorderFlag,
} from './inventory';
export { updateSettings } from './settings';
export { addClientPhotos, deleteClientPhoto, updateClientPhoto } from './photos';

// Notificaciones
export {
  runNotificationChecks,
  onNotificationCreated,
  addNotification,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications,
  type NotificationDraft,
} from './notifications';

// Hooks
export {
  useSettings,
  useClients,
  useClient,
  useExpenses,
  useExpense,
  useInventory,
  useInventoryItem,
  useMovements,
  useAudit,
  useNotifications,
  useUnreadCount,
  useTrash,
  useSummary,
  useSeries,
  usePeriodHistory,
  useCategoryBreakdown,
  useServiceBreakdown,
  useStatusCounts,
  useClientFinancials,
  useCustomerDirectory,
  useInventoryStats,
  useClientPhotos,
  usePhotoURL,
  useFormatters,
  type Formatters,
} from './hooks';

// Reportes puros
export {
  computeSummary,
  computeSeries,
  computeCategoryBreakdown,
  computeServiceBreakdown,
  computeStatusCounts,
  computeClientFinancials,
  computeCustomerDirectory,
  computeInventoryStats,
  percentChange,
  type CategoryBreakdownRow,
  type ServiceBreakdownRow,
  type ClientFinancials,
  type DirectoryEntry,
  type InventoryStats,
} from './reports';

// Recibo
export { buildReceiptText, normalizePhoneForWhatsApp, whatsappUrl } from './receipt';

// Respaldo, demo y sistema
export {
  exportBackup,
  importBackup,
  exportCSV,
  downloadBlob,
  backupFilename,
  wipeAllData,
  requestPersistentStorage,
  getStorageEstimate,
  type ImportResult,
  type CsvKind,
  type BackupFile,
} from './backup';
export { seedDemoData } from './demo';

/* ------------------------- Global para pruebas -------------------------- */

export interface ReparoGlobal {
  db: typeof db;
  seedDemoData: typeof seedDemoData;
  wipeAllData: typeof wipeAllData;
  updateSettings: typeof updateSettings;
  runNotificationChecks: typeof runNotificationChecks;
}

declare global {
  interface Window {
    __reparo?: ReparoGlobal;
  }
}

if (typeof window !== 'undefined') {
  window.__reparo = { db, seedDemoData, wipeAllData, updateSettings, runNotificationChecks };
}

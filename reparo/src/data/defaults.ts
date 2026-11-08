import type { Settings } from './types';

export const DEFAULT_RECEIPT_FOOTER = 'Gracias por tu preferencia. Garantía válida presentando este recibo.';

/** Ajustes por defecto de una instalación nueva. */
export function defaultSettings(now: number = Date.now()): Settings {
  return {
    id: 'settings',
    businessName: 'Mi Servicio Técnico',
    ownerName: '',
    businessPhone: '',
    businessAddress: '',
    receiptFooter: DEFAULT_RECEIPT_FOOTER,
    phoneCountryCode: '52',
    currency: 'MXN',
    locale: 'es-MX',
    weekStartsOn: 1,
    theme: 'dark',
    onboarded: false,
    monthlyGoalCents: 0,
    syncUrl: '',
    syncEnabled: false,
    notificationsEnabled: true,
    notifyLowStock: true,
    notifyReadyPickup: true,
    readyPickupDays: 3,
    notifyPendingPayment: true,
    notifyDailySummary: true,
    dailySummaryHour: 20,
    notifyBackupReminder: true,
    pushSubscribed: false,
    lastSyncAt: null,
    lastBackupAt: null,
    updatedAt: now,
  };
}

/** Completa con valores por defecto los campos que falten (ajustes de versiones anteriores). */
export function withSettingsDefaults(s: Partial<Settings> | null | undefined): Settings {
  const base = defaultSettings(s?.updatedAt ?? 0);
  if (!s) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(s)) {
    if (v !== undefined) out[k] = v;
  }
  out.id = 'settings';
  return out as unknown as Settings;
}

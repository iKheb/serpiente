/* Mutación de ajustes. Se audita como 'ajustes' salvo cambios técnicos/de preferencia
   (lastSyncAt, lastBackupAt, pushSubscribed, theme). */
import type { Settings } from './types';
import { db, dbReady } from './db';
import { defaultSettings, withSettingsDefaults } from './defaults';
import { ValidationError } from './errors';
import { SETTINGS_UNAUDITED, SUMMARY, diffFields, writeAudit } from './audit';
import { setCachedSettings } from './settings-cache';
import { stripUndefined } from './util';

const TEXT_LIMITS: Partial<Record<keyof Settings, number>> = {
  businessName: 120,
  ownerName: 120,
  businessPhone: 40,
  businessAddress: 240,
  receiptFooter: 600,
  syncUrl: 500,
};

function sanitizePatch(patch: Partial<Omit<Settings, 'id'>>): Partial<Settings> {
  const out = stripUndefined(patch) as Partial<Settings> & Record<string, unknown>;
  delete (out as Record<string, unknown>).id;
  const errors: Record<string, string> = {};

  for (const [k, max] of Object.entries(TEXT_LIMITS) as [keyof Settings, number][]) {
    if (k in out) {
      const v = String(out[k] ?? '').trim();
      if (v.length > max) errors[k] = 'El texto es demasiado largo';
      (out as Record<string, unknown>)[k] = v;
    }
  }
  if ('businessName' in out && !out.businessName) errors.businessName = 'El nombre del negocio es obligatorio';
  if ('currency' in out) {
    const c = String(out.currency ?? '').trim().toUpperCase();
    let ok = /^[A-Z]{3}$/.test(c);
    if (ok) {
      try {
        new Intl.NumberFormat('es', { style: 'currency', currency: c });
      } catch {
        ok = false;
      }
    }
    if (!ok) errors.currency = 'La moneda no es válida';
    out.currency = c;
  }
  if ('locale' in out) {
    const l = String(out.locale ?? '').trim();
    try {
      if (!l) throw new Error('vacío');
      new Intl.NumberFormat(l);
    } catch {
      errors.locale = 'El formato regional no es válido';
    }
    out.locale = l;
  }
  if ('phoneCountryCode' in out) {
    const cc = String(out.phoneCountryCode ?? '').replace(/\D/g, '');
    if (!cc || cc.length > 4) errors.phoneCountryCode = 'El código de país no es válido';
    out.phoneCountryCode = cc;
  }
  if ('weekStartsOn' in out && out.weekStartsOn !== 0 && out.weekStartsOn !== 1) {
    errors.weekStartsOn = 'La semana sólo puede empezar en lunes o domingo';
  }
  if ('theme' in out && !['dark', 'light', 'system'].includes(String(out.theme))) errors.theme = 'Tema no válido';
  if ('monthlyGoalCents' in out) {
    const g = Number(out.monthlyGoalCents);
    if (!Number.isFinite(g) || g < 0) errors.monthlyGoalCents = 'La meta no puede ser negativa';
    else out.monthlyGoalCents = Math.round(g);
  }
  if ('readyPickupDays' in out) {
    const d = Number(out.readyPickupDays);
    if (!Number.isInteger(d) || d < 1 || d > 365) errors.readyPickupDays = 'Elige entre 1 y 365 días';
  }
  if ('dailySummaryHour' in out) {
    const h = Number(out.dailySummaryHour);
    if (!Number.isInteger(h) || h < 0 || h > 23) errors.dailySummaryHour = 'Elige una hora entre 0 y 23';
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

/** Actualiza los ajustes y la caché de formato. Audita sólo los cambios relevantes. */
export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  await dbReady();
  const clean = sanitizePatch(patch);
  const next = await db.transaction('rw', [db.settings, db.audit], async () => {
    const stored = await db.settings.get('settings');
    const current = stored ? withSettingsDefaults(stored) : defaultSettings();
    const candidate: Settings = { ...current, ...clean, id: 'settings' };
    const allChanges = diffFields(
      'ajustes',
      current as unknown as Record<string, unknown>,
      candidate as unknown as Record<string, unknown>,
    );
    if (allChanges.length === 0 && stored) return current;
    const now = Date.now();
    const saved: Settings = { ...candidate, updatedAt: now };
    await db.settings.put(saved);
    const audited = allChanges.filter((c) => !SETTINGS_UNAUDITED.includes(c.field as keyof Settings));
    if (audited.length) {
      await writeAudit({
        action: 'ajustes',
        entity: 'ajustes',
        entityId: 'settings',
        title: 'Ajustes',
        summary: SUMMARY.ajustes,
        changes: audited,
        snapshot: { ...saved } as unknown as Record<string, unknown>,
        ts: now,
      });
    }
    return saved;
  });
  setCachedSettings(next);
  return next;
}

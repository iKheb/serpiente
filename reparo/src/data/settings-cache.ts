/* Caché síncrona de los ajustes a nivel de módulo.
   Los formateadores (formatMoney, getPeriod…) la usan para conocer la moneda,
   el locale y el inicio de semana sin tener que ser async. Se mantiene al día
   con una suscripción liveQuery iniciada al importar y con updateSettings. */
import { liveQuery } from 'dexie';
import type { Settings } from './types';
import { db } from './db';
import { defaultSettings, withSettingsDefaults } from './defaults';

let cached: Settings = defaultSettings(0);
const listeners = new Set<() => void>();

export function getCachedSettings(): Settings {
  return cached;
}

export function setCachedSettings(next: Settings): void {
  if (next === cached) return;
  cached = next;
  for (const l of [...listeners]) {
    try {
      l();
    } catch (err) {
      console.error('[reparo] listener de ajustes falló', err);
    }
  }
}

/** Suscripción a cambios de la caché (compatible con useSyncExternalStore). */
export function subscribeSettings(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

if (typeof indexedDB !== 'undefined') {
  liveQuery(() => db.settings.get('settings')).subscribe({
    next: (s) => {
      if (s) setCachedSettings(withSettingsDefaults(s));
    },
    error: (err) => console.error('[reparo] no se pudieron leer los ajustes', err),
  });
}

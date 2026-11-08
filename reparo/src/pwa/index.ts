// STUB con el contrato público de la capa PWA (lo reemplaza el subagente PWA,
// manteniendo estas firmas).
import { useSyncExternalStore } from 'react';

/** Capa global (montada UNA vez por el Shell): actualizaciones, offline, instalación, puente de notificaciones. */
export function PwaLayer(): null {
  return null;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/** true si hay conexión a internet. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/* ==========================================================================
   Capa PWA de Reparo — API pública (`import { … } from '@/pwa'`).
   · <PwaLayer />: montar UNA vez en el Shell.
   · Hooks para Ajustes / Shell: conexión, instalación, permisos,
     notificaciones de prueba, actualización y Web Push.
   ========================================================================== */
import { useStore } from './store';
import { applyUpdate as applySwUpdate, swStore, type SwStatus } from './register';

export { PwaLayer } from './PwaLayer';
export { useOnlineStatus } from './online';
export { useInstallPrompt, promptInstall, IOS_INSTALL_HINT } from './install';
export {
  useNotificationPermission,
  requestNotificationPermission,
  getNotificationPermission,
  showSystemNotification,
  sendTestNotification,
  notificationsSupported,
  type SystemNotificationInput,
} from './notifications';
export { usePushSubscription, pushUnavailableReason, refreshPushState } from './push';
export { checkForUpdates, getServiceWorkerVersion, clearAppCaches, onPushReceived, type SwStatus } from './register';

/** Versión nueva disponible y acción para aplicarla (activa el SW nuevo y recarga una vez). */
export function useSwUpdate(): { updateReady: boolean; applyUpdate(): void } {
  const s = useStore(swStore);
  return { updateReady: s.updateReady, applyUpdate: applyUpdateNow };
}

function applyUpdateNow(): void {
  void applySwUpdate();
}

/**
 * Estado del modo sin conexión para mostrar en Ajustes.
 * `offlineCapable` = un service worker controla la página (la app abre sin internet).
 */
export function usePwaStatus(): { swStatus: SwStatus; offlineCapable: boolean; version: string | null } {
  const s = useStore(swStore);
  const controlled = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;
  return { swStatus: s.status, offlineCapable: controlled, version: s.version };
}

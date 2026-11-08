/* ==========================================================================
   Notificaciones del sistema (locales): permiso, mostrar y probar.
   Usa registration.showNotification (persistentes, con acciones; obligatorio
   en Android) y cae a `new Notification()` cuando no hay service worker
   (p. ej. abriendo la app desde file:// en escritorio).
   ========================================================================== */
import { navigate } from '@/app/router';
import { createStore, useStore } from './store';
import { assetUrl, BADGE_PATH, hasServiceWorker, ICON_PATH, isBrowser, isHttp } from './env';

export type PermissionState = NotificationPermission | 'unsupported';

export const notificationsSupported: boolean = isBrowser && 'Notification' in window;

function readPermission(): PermissionState {
  return notificationsSupported ? Notification.permission : 'unsupported';
}

export const permissionStore = createStore<PermissionState>(readPermission());

function syncPermission() {
  permissionStore.set(readPermission());
}

if (notificationsSupported) {
  // El usuario puede cambiar el permiso desde el navegador en cualquier momento.
  navigator.permissions
    ?.query({ name: 'notifications' as PermissionName })
    .then((status) => {
      status.addEventListener('change', syncPermission);
    })
    .catch(() => {});
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncPermission();
  });
}

/** Permiso actual (sin React). */
export function getNotificationPermission(): PermissionState {
  return readPermission();
}

/** Pide permiso de notificaciones. Llamar desde un gesto del usuario (clic). */
export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!notificationsSupported) return 'unsupported';
  if (Notification.permission !== 'default') {
    syncPermission();
    return Notification.permission;
  }
  try {
    const result = await new Promise<NotificationPermission>((resolve) => {
      // Safari antiguo usa callback; el resto devuelve una promesa.
      const maybe = Notification.requestPermission((p) => resolve(p));
      if (maybe && typeof maybe.then === 'function') maybe.then(resolve, () => resolve(Notification.permission));
    });
    syncPermission();
    return result;
  } catch {
    syncPermission();
    return readPermission();
  }
}

export function useNotificationPermission(): {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  request(): Promise<NotificationPermission | 'unsupported'>;
} {
  const permission = useStore(permissionStore);
  return { supported: notificationsSupported, permission, request: requestNotificationPermission };
}

/* ------------------------------ Mostrar ----------------------------------- */

type Action = { action: string; title: string };

/** Mismas acciones (en español) que usa el service worker para los push. */
const ACTIONS: Record<string, Action[]> = {
  stock_bajo: [
    { action: 'open', title: 'Ver repuesto' },
    { action: 'pedir', title: 'Lista por pedir' },
  ],
  listo_sin_entregar: [
    { action: 'open', title: 'Ver equipo' },
    { action: 'dismiss', title: 'Más tarde' },
  ],
  pago_pendiente: [
    { action: 'open', title: 'Ver saldo' },
    { action: 'dismiss', title: 'Más tarde' },
  ],
  garantia: [
    { action: 'open', title: 'Ver servicio' },
    { action: 'dismiss', title: 'Más tarde' },
  ],
  resumen: [
    { action: 'open', title: 'Ver resumen' },
    { action: 'reportes', title: 'Reportes' },
  ],
  respaldo: [
    { action: 'open', title: 'Respaldar ahora' },
    { action: 'dismiss', title: 'Más tarde' },
  ],
  meta: [{ action: 'reportes', title: 'Ver reportes' }],
};

/** Opciones extendidas (lib.dom no incluye todas las que soportan los navegadores). */
type RichNotificationOptions = NotificationOptions & {
  actions?: Action[];
  renotify?: boolean;
  vibrate?: number[];
  timestamp?: number;
};

export interface SystemNotificationInput {
  title: string;
  body: string;
  /** Ruta hash ("#/inventario?filtro=pedir") o URL externa (https://wa.me/…). */
  href?: string;
  /** Misma etiqueta = reemplaza la notificación anterior (deduplicación). */
  tag?: string;
  /** NotificationKind: añade acciones contextuales (sólo con service worker). */
  kind?: string;
  silent?: boolean;
}

async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!hasServiceWorker() || !isHttp()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.active ? reg : null;
  } catch {
    return null;
  }
}

function openHref(href: string) {
  if (href.startsWith('#')) {
    navigate(href);
    return;
  }
  try {
    const url = new URL(href, document.baseURI);
    if (url.origin === location.origin && url.hash) navigate(url.hash);
    else window.open(url.href, '_blank', 'noopener');
  } catch {
    /* href inválido */
  }
}

/**
 * Muestra una notificación del sistema. Devuelve false si no hay soporte o
 * permiso (no pide permiso: usa `requestNotificationPermission` antes).
 */
export async function showSystemNotification(n: SystemNotificationInput): Promise<boolean> {
  if (!notificationsSupported || Notification.permission !== 'granted') return false;
  const href = n.href || '#/panel';
  const kind = n.kind || 'sistema';
  const base: RichNotificationOptions = {
    body: n.body,
    icon: assetUrl(ICON_PATH),
    badge: assetUrl(BADGE_PATH),
    lang: 'es',
    dir: 'ltr',
    data: { href, kind },
    timestamp: Date.now(),
  };
  if (n.tag) base.tag = n.tag;
  if (n.silent) base.silent = true;

  const reg = await activeRegistration();
  if (reg) {
    const rich: RichNotificationOptions = { ...base, vibrate: [90, 50, 90] };
    if (n.tag) rich.renotify = true;
    const maxActions = (Notification as unknown as { maxActions?: number }).maxActions ?? 0;
    const actions = ACTIONS[kind];
    if (actions && maxActions > 0) rich.actions = actions.slice(0, maxActions);
    try {
      await reg.showNotification(n.title, rich);
      return true;
    } catch {
      try {
        await reg.showNotification(n.title, base);
        return true;
      } catch {
        /* sigue al fallback */
      }
    }
  }

  try {
    const notif = new Notification(n.title, base);
    notif.onclick = (e) => {
      e.preventDefault();
      try {
        window.focus();
      } catch {
        /* noop */
      }
      openHref(href);
      notif.close();
    };
    return true;
  } catch {
    // Android Chrome prohíbe el constructor sin service worker.
    return false;
  }
}

/** Notificación de prueba (pide permiso si aún no se ha decidido). */
export async function sendTestNotification(): Promise<boolean> {
  if (!notificationsSupported) return false;
  if (Notification.permission === 'default') {
    const p = await requestNotificationPermission();
    if (p !== 'granted') return false;
  }
  return showSystemNotification({
    title: '¡Notificaciones activadas!',
    body: 'Te avisaremos de stock bajo, equipos listos y tu resumen diario.',
    href: '#/ajustes',
    tag: 'reparo-prueba',
    kind: 'sistema',
  });
}

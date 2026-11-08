/* ==========================================================================
   Web Push (cliente) contra el servidor opcional de Reparo.
   Contrato del servidor:
     GET  {server}/api/push/vapid-public-key → { key: string }  (base64url)
     POST {server}/api/push/subscribe        { deviceId, subscription }
     POST {server}/api/push/unsubscribe      { endpoint }
     POST {server}/api/push/test             { deviceId }
   ========================================================================== */
import { useEffect } from 'react';
import { updateSettings } from '@/data';
import { getDeviceId } from '@/data/db';
import { createStore, useStore } from './store';
import { hasServiceWorker, IS_IOS, isBrowser, isHttp, isSecure, safeStorage } from './env';
import { requestNotificationPermission } from './notifications';
import { sendServiceWorkerConfig } from './register';

const SERVER_STORAGE_KEY = 'reparo.pushServer';
const REQUEST_TIMEOUT_MS = 10_000;

interface PushState {
  subscribed: boolean;
  busy: boolean;
  error: string | null;
  /** Ya se consultó la suscripción real del navegador. */
  checked: boolean;
}

export const pushStore = createStore<PushState>({ subscribed: false, busy: false, error: null, checked: false });
const patch = (p: Partial<PushState>) => pushStore.set((s) => ({ ...s, ...p }));

export const pushSupported: boolean =
  isBrowser && hasServiceWorker() && 'PushManager' in window && 'Notification' in window;

class PushError extends Error {}

/* ------------------------------ Mensajes ---------------------------------- */

const MSG = {
  insecure:
    'Las notificaciones push requieren una conexión segura (HTTPS). Abre Reparo desde una dirección https:// (o localhost) en lugar de un archivo o una dirección http://.',
  unsupported: IS_IOS
    ? 'En iPhone y iPad las notificaciones push sólo funcionan con Reparo instalado: en Safari toca Compartir → «Agregar a inicio», abre Reparo desde el ícono y vuelve a intentarlo (requiere iOS 16.4 o superior).'
    : 'Este navegador no es compatible con notificaciones push. Usa Chrome, Edge, Firefox o Samsung Internet actualizados.',
  denied:
    'Las notificaciones están bloqueadas para Reparo. Permítelas en la configuración del navegador (ícono del candado junto a la dirección → Notificaciones → Permitir) y vuelve a intentarlo.',
  dismissed: 'No se concedió el permiso de notificaciones. Toca de nuevo «Activar» y elige «Permitir».',
  noServer:
    'Falta la dirección del servidor de Reparo (por ejemplo https://mi-taller.com). Configúrala en Ajustes → Sincronización.',
  badUrl: 'La dirección del servidor no es válida. Debe verse como https://mi-taller.com',
  mixed:
    'El servidor usa http:// pero Reparo está abierto con https://, y el navegador bloquea esa conexión. Usa la dirección https:// del servidor.',
  offline:
    'Sin conexión a internet. Conéctate para activar las notificaciones push (los avisos locales siguen funcionando sin internet).',
  noSw: 'Reparo aún no terminó de prepararse en este navegador. Recarga la página con internet y vuelve a intentarlo.',
  noKey: 'El servidor no tiene configuradas las claves de notificaciones push (VAPID). Revisa la instalación del servidor.',
  pushService:
    'El servicio de notificaciones del navegador no respondió. Revisa tu conexión e inténtalo de nuevo (en Brave activa «Usar los servicios de Google para mensajería push»).',
  notSubscribed: 'Primero activa las notificaciones push en este dispositivo.',
  unreachable: (host: string) =>
    `No pudimos conectar con el servidor ${host}. Verifica que esté encendido, que la dirección sea correcta y que permita conexiones desde esta app.`,
  timeout: (host: string) => `El servidor ${host} tardó demasiado en responder. Inténtalo de nuevo en unos minutos.`,
  notFound: (host: string) =>
    `El servidor ${host} no tiene habilitadas las notificaciones push (no encontró /api/push). Actualiza el servidor de Reparo.`,
  http: (status: number) => `El servidor respondió con un error (HTTP ${status}). Inténtalo de nuevo en unos minutos.`,
};

/* ------------------------------ Utilidades -------------------------------- */

function savedServer(): string {
  return safeStorage.get(SERVER_STORAGE_KEY) ?? '';
}

/** Normaliza la URL del servidor: añade https:// si falta y quita la barra final. */
function normalizeServer(raw: string): string {
  let value = raw.trim();
  if (!value) value = savedServer();
  if (!value && isHttp()) value = location.origin; // el servidor de Reparo también sirve la app
  if (!value) throw new PushError(MSG.noServer);
  if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PushError(MSG.badUrl);
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (location.protocol === 'https:' && url.protocol === 'http:' && !local) throw new PushError(MSG.mixed);
  return (url.origin + url.pathname).replace(/\/+$/, '');
}

function hostOf(server: string): string {
  try {
    return new URL(server).host;
  } catch {
    return server;
  }
}

async function request<T = unknown>(server: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(server + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? { accept: 'application/json' } : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err) {
    if (!navigator.onLine) throw new PushError(MSG.offline);
    if (err instanceof DOMException && err.name === 'AbortError') throw new PushError(MSG.timeout(hostOf(server)));
    throw new PushError(MSG.unreachable(hostOf(server)));
  } finally {
    window.clearTimeout(timer);
  }
  if (res.status === 404) throw new PushError(MSG.notFound(hostOf(server)));
  if (!res.ok) throw new PushError(MSG.http(res.status));
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  if (x.length !== b.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== b[i]) return false;
  return true;
}

function preflight() {
  if (!isSecure()) throw new PushError(MSG.insecure);
  if (!pushSupported) throw new PushError(MSG.unsupported);
}

async function pushRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new PushError(MSG.noSw);
  if (reg.active) return reg;
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => window.setTimeout(() => r(null), 8000)),
  ]);
  if (!ready) throw new PushError(MSG.noSw);
  return ready;
}

function deviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return '';
  }
}

function messageOf(err: unknown): string {
  if (err instanceof PushError) return err.message;
  if (err instanceof DOMException && err.name === 'NotAllowedError') return MSG.denied;
  return MSG.pushService;
}

/** Motivo (en español) por el que Web Push no está disponible aquí, o null si lo está. */
export function pushUnavailableReason(): string | null {
  if (!isSecure()) return MSG.insecure;
  if (!pushSupported) return MSG.unsupported;
  return null;
}

/* ------------------------------ Acciones ---------------------------------- */

/**
 * Consulta la suscripción real del navegador. Devuelve true/false, o null si
 * no se pudo saber (sin service worker registrado todavía, error del navegador).
 */
export async function refreshPushState(): Promise<boolean | null> {
  if (!pushSupported || !isSecure()) {
    patch({ subscribed: false, checked: true });
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return null;
    const sub = await reg.pushManager.getSubscription();
    patch({ subscribed: !!sub, checked: true });
    return !!sub;
  } catch {
    return null;
  }
}

export async function subscribePush(serverUrl: string): Promise<boolean> {
  if (pushStore.get().busy) return false;
  patch({ busy: true, error: null });
  try {
    preflight();
    const server = normalizeServer(serverUrl);
    // El permiso primero, mientras dura el gesto del usuario (Safari lo exige).
    const permission = await requestNotificationPermission();
    if (permission === 'denied') throw new PushError(MSG.denied);
    if (permission !== 'granted') throw new PushError(MSG.dismissed);
    if (!navigator.onLine) throw new PushError(MSG.offline);

    const reg = await pushRegistration();
    const { key } = await request<{ key?: unknown }>(server, '/api/push/vapid-public-key');
    if (typeof key !== 'string' || key.length < 40) throw new PushError(MSG.noKey);
    let appKey: Uint8Array<ArrayBuffer>;
    try {
      appKey = base64UrlToBytes(key);
    } catch {
      throw new PushError(MSG.noKey);
    }

    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options.applicationServerKey, appKey)) {
      await sub.unsubscribe().catch(() => false);
      sub = null;
    }
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'NotAllowedError') throw new PushError(MSG.denied);
        throw new PushError(MSG.pushService);
      }
    }

    const id = deviceId();
    try {
      await request(server, '/api/push/subscribe', { deviceId: id, subscription: sub.toJSON() });
    } catch (err) {
      // Mantener coherencia: sin registro en el servidor no dejamos una suscripción huérfana.
      await sub.unsubscribe().catch(() => false);
      throw err;
    }

    safeStorage.set(SERVER_STORAGE_KEY, server);
    sendServiceWorkerConfig({ pushServer: server, deviceId: id, vapidKey: key });
    await updateSettings({ pushSubscribed: true });
    patch({ subscribed: true, busy: false, error: null, checked: true });
    return true;
  } catch (err) {
    patch({ busy: false, error: messageOf(err) });
    return false;
  }
}

export async function unsubscribePush(): Promise<void> {
  if (pushStore.get().busy) return;
  patch({ busy: true, error: null });
  try {
    if (pushSupported && isSecure()) {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const server = savedServer();
        if (server) {
          // Mejor esfuerzo: si el servidor no responde, él limpiará la suscripción
          // al recibir "410 Gone" en el próximo envío.
          await request(server, '/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
        }
        await sub.unsubscribe().catch(() => false);
      }
    }
    sendServiceWorkerConfig({ pushServer: null });
    await updateSettings({ pushSubscribed: false });
    patch({ subscribed: false, busy: false, checked: true });
  } catch (err) {
    patch({ busy: false, error: messageOf(err) });
  }
}

/** Pide al servidor que envíe un push de prueba a este dispositivo. */
export async function sendTestPush(): Promise<boolean> {
  if (pushStore.get().busy) return false;
  patch({ busy: true, error: null });
  try {
    preflight();
    if (!(await refreshPushState())) throw new PushError(MSG.notSubscribed);
    const server = normalizeServer(savedServer());
    if (!navigator.onLine) throw new PushError(MSG.offline);
    await request(server, '/api/push/test', { deviceId: deviceId() });
    patch({ busy: false });
    return true;
  } catch (err) {
    patch({ busy: false, error: messageOf(err) });
    return false;
  }
}

export function usePushSubscription(): {
  supported: boolean;
  subscribed: boolean;
  busy: boolean;
  error: string | null;
  subscribe(serverUrl: string): Promise<boolean>;
  unsubscribe(): Promise<void>;
  sendTest(): Promise<boolean>;
} {
  const s = useStore(pushStore);
  useEffect(() => {
    if (!pushStore.get().checked) void refreshPushState();
  }, []);
  return {
    supported: pushSupported && isSecure(),
    subscribed: s.subscribed,
    busy: s.busy,
    error: s.error,
    subscribe: subscribePush,
    unsubscribe: unsubscribePush,
    sendTest: sendTestPush,
  };
}

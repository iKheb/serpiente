/* Detección de entorno para la capa PWA (segura en SSR / pruebas con jsdom). */

export const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

/** true si la app se sirve por http(s) (no desde file://). */
export function isHttp(): boolean {
  return isBrowser && (location.protocol === 'http:' || location.protocol === 'https:');
}

/** Contexto seguro (https o localhost): requisito de service worker y Web Push. */
export function isSecure(): boolean {
  return isBrowser && isHttp() && window.isSecureContext === true;
}

export function hasServiceWorker(): boolean {
  return isBrowser && 'serviceWorker' in navigator;
}

/** iPhone / iPad (incluye iPadOS que se presenta como Mac con pantalla táctil). */
export const IS_IOS: boolean =
  isBrowser &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1));

/** La app corre instalada (ventana propia / pantalla de inicio). */
export function isStandalone(): boolean {
  if (!isBrowser) return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches === true
  );
}

/** URL absoluta de un recurso de /public relativo al documento (sirve en http, https y file://). */
export function assetUrl(path: string): string {
  if (!isBrowser) return path;
  return new URL(path.replace(/^\//, './'), document.baseURI).href;
}

export const ICON_PATH = './icons/icon-192.png';
export const BADGE_PATH = './icons/badge-96.png';

/** Lectura/escritura tolerante de localStorage (modo privado, cuotas, etc.). */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null): void {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* sin almacenamiento disponible */
    }
  },
};

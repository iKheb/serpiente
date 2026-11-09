/**
 * Miniaturas 3D de repuestos — renderizado sin congelar la interfaz.
 *
 * - Cada categoría se pre-renderiza UNA vez por tema y escalón de tamaño
 *   (sprites de 128 / 256 / 512 px) y todos los tamaños CSS reutilizan el sprite.
 * - El render ocurre en un Web Worker con OffscreenCanvas: PMREM, compilación de
 *   shaders y lectura de píxeles (segundos con WebGL por software) quedan fuera
 *   del hilo principal. Sin soporte, se usa el hilo principal en tiempo ocioso.
 * - El escenario (renderer, entorno, luces, materiales, modelos) se reutiliza.
 * - Los sprites se guardan en localStorage: en la siguiente visita aparecen al
 *   instante sin tocar WebGL.
 * - Al pedir una categoría, el resto del mismo tema se prepara en segundo plano.
 */
import type { ExpenseCategory } from '@/data/types';
import type { ThemeName } from './env';
import { scheduleIdle } from './env';
import { tierFor, type ThumbStage, type ThumbTier } from './thumbStage';
import type { ThumbWorkerRequest, ThumbWorkerResponse } from './thumbWorker';
import ThumbWorker from './thumbWorker?worker&inline';

/** Cambia este valor cuando cambien los modelos o la iluminación (invalida la caché persistente). */
const VERSION = 'v1';
const STORE_PREFIX = 'reparo.partThumb.';
const KINDS: ExpenseCategory[] = ['pantallas', 'baterias', 'puertos', 'camaras', 'placas', 'carcasas', 'herramientas', 'accesorios', 'otros'];

type Key = `${ExpenseCategory}|${ThemeName}|${ThumbTier}`;
const keyOf = (kind: ExpenseCategory, theme: ThemeName, tier: ThumbTier): Key => `${kind}|${theme}|${tier}`;

/* ------------------------------------------------------------- Persistencia */

let storageSwept = false;

function storageGet(key: Key): string | null {
  try {
    if (!storageSwept) {
      storageSwept = true;
      // Limpia sprites de versiones anteriores.
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(STORE_PREFIX) && !k.startsWith(`${STORE_PREFIX}${VERSION}.`)) localStorage.removeItem(k);
      }
    }
    return localStorage.getItem(`${STORE_PREFIX}${VERSION}.${key}`);
  } catch {
    return null;
  }
}

function storagePut(key: Key, blob: Blob) {
  if (blob.size > 160_000) return;
  scheduleIdle(() => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        localStorage.setItem(`${STORE_PREFIX}${VERSION}.${key}`, String(reader.result));
      } catch {
        /* cuota llena o almacenamiento bloqueado: sólo caché en memoria */
      }
    };
    reader.readAsDataURL(blob);
  }, 2000);
}

/* ------------------------------------------------------------------ Backends */

interface Backend {
  render(kind: ExpenseCategory, px: number, theme: ThemeName): Promise<Blob>;
  /** ¿Se puede preparar el resto en segundo plano sin afectar la interfaz? */
  readonly offThread: boolean;
}

class UnsupportedError extends Error {}

function workerBackend(): Backend | null {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  let worker: Worker | null = null;
  let seq = 0;
  let idleTimer = 0;
  const pending = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void }>();

  const failAll = (err: Error) => {
    pending.forEach((p) => p.reject(err));
    pending.clear();
  };
  const ensure = () => {
    if (worker) return worker;
    worker = new ThumbWorker({ name: 'reparo-thumbs' });
    worker.onmessage = (ev: MessageEvent<ThumbWorkerResponse>) => {
      const msg = ev.data;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.blob);
      else p.reject(msg.unsupported ? new UnsupportedError(msg.error) : new Error(msg.error));
    };
    worker.onerror = (e) => {
      e.preventDefault();
      worker?.terminate();
      worker = null;
      failAll(new UnsupportedError(e.message || 'worker'));
    };
    return worker;
  };
  return {
    offThread: true,
    render(kind, px, theme) {
      clearTimeout(idleTimer);
      return new Promise<Blob>((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        try {
          ensure().postMessage({ id, kind, px, theme } satisfies ThumbWorkerRequest);
        } catch (e) {
          pending.delete(id);
          reject(new UnsupportedError(String(e)));
        }
      }).finally(() => {
        // Libera el contexto WebGL del worker tras un rato sin trabajo.
        clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => {
          if (pending.size === 0 && worker) {
            worker.terminate();
            worker = null;
          }
        }, 30_000);
      });
    },
  };
}

function mainThreadBackend(): Backend {
  let stage: ThumbStage | null = null;
  let idleTimer = 0;
  return {
    offThread: false,
    async render(kind, px, theme) {
      clearTimeout(idleTimer);
      await new Promise<void>((r) => scheduleIdle(r, 500));
      const { createThumbStage } = await import('./thumbStage');
      if (!stage || stage.isLost()) {
        stage?.dispose();
        stage = createThumbStage(document.createElement('canvas'));
      }
      await stage.draw(kind, px, theme);
      const canvas = stage.canvas as HTMLCanvasElement;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.92));
      idleTimer = window.setTimeout(() => {
        stage?.dispose();
        stage = null;
      }, 20_000);
      if (!blob) throw new Error('toBlob');
      return blob;
    },
  };
}

let backend: Backend | null = null;
function getBackend(): Backend {
  return (backend ??= workerBackend() ?? mainThreadBackend());
}

/* ------------------------------------------------------------------- Cola */

interface Job {
  key: Key;
  kind: ExpenseCategory;
  theme: ThemeName;
  tier: ThumbTier;
  resolve: (url: string) => void;
  reject: (e: unknown) => void;
}

const sprites = new Map<Key, Promise<string>>();
const urgent: Job[] = [];
const background: Job[] = [];
let running = false;

async function pump() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = urgent.shift() ?? background.shift();
      if (!job) break;
      try {
        let blob: Blob;
        try {
          blob = await getBackend().render(job.kind, job.tier, job.theme);
        } catch (e) {
          if (!(e instanceof UnsupportedError) || !backend?.offThread) throw e;
          backend = mainThreadBackend();
          background.length = 0; // sin worker no se prepara nada por adelantado
          blob = await backend.render(job.kind, job.tier, job.theme);
        }
        storagePut(job.key, blob);
        job.resolve(URL.createObjectURL(blob));
      } catch (e) {
        sprites.delete(job.key);
        job.reject(e);
      }
    }
  } finally {
    running = false;
  }
}

function enqueue(kind: ExpenseCategory, theme: ThemeName, tier: ThumbTier, priority: 'urgent' | 'background'): Promise<string> {
  const key = keyOf(kind, theme, tier);
  const hit = sprites.get(key);
  if (hit) {
    // Si estaba en segundo plano y ahora se necesita, adelántalo.
    const i = background.findIndex((j) => j.key === key);
    if (priority === 'urgent' && i >= 0) urgent.push(...background.splice(i, 1));
    return hit;
  }
  const stored = storageGet(key);
  if (stored) {
    const p = Promise.resolve(stored);
    sprites.set(key, p);
    return p;
  }
  const p = new Promise<string>((resolve, reject) => {
    (priority === 'urgent' ? urgent : background).push({ key, kind, theme, tier, resolve, reject });
  });
  sprites.set(key, p);
  void pump();
  return p;
}

const prefetched = new Set<string>();

/**
 * Devuelve la URL (blob: o data:) del sprite de `kind` adecuado para `size` px CSS.
 * El primer pedido de un tema prepara las demás categorías en segundo plano.
 */
export function renderThumb(kind: ExpenseCategory, size: number, theme: ThemeName, dpr: number): Promise<string> {
  const tier = tierFor(size, dpr);
  const p = enqueue(kind, theme, tier, 'urgent');
  const group = `${theme}|${tier}`;
  if (!prefetched.has(group)) {
    prefetched.add(group);
    // Tras el primer render: el resto del "atlas" de este tema y tamaño.
    p.then(
      () => {
        if (!getBackend().offThread) return;
        for (const k of KINDS) enqueue(k, theme, tier, 'background').catch(() => undefined);
      },
      () => undefined,
    );
  }
  return p;
}

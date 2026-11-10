/* ==========================================================================
   Nube (Supabase) — orquestación: estado para la UI, sincronización
   automática y restauración en un dispositivo nuevo.
   ========================================================================== */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { liveQuery } from 'dexie';
import { db, dbReady, recomputeFolioSequence } from '@/data/db';
import { withSettingsDefaults } from '@/data/defaults';
import { setCachedSettings } from '@/data/settings-cache';
import { getCloudAuth, getCloudClient, subscribeCloudAuth, useCloudAuth, cloudSignOut } from './client';
import { getCloudConfig, getCloudConfigState, saveCloudConfig, subscribeCloudConfig, useCloudConfig, validateCloudConfig, type CloudConfig } from './config';
import { CloudError, toCloudError, type CloudErrorKind } from './errors';
import type { PhotoProgress } from './photos';
import { CLOUD_TABLES, hasCloudPending, readLastCloudSyncAt, resetCloudState, runCloudCycle, type CloudSyncResult } from './engine';

/* ------------------------------- Estado ---------------------------------- */

export type CloudState = 'off' | 'idle' | 'syncing' | 'error' | 'offline';

export interface CloudStatus {
  /** Hay un proyecto configurado (del usuario o del build). */
  configured: boolean;
  signedIn: boolean;
  email: string | null;
  state: CloudState;
  lastSyncAt: number | null;
  error: string | null;
  errorKind: CloudErrorKind | null;
  /** Resultado de la última sincronización correcta de esta sesión. */
  lastResult: CloudSyncResult | null;
  /** Progreso de fotos en curso, p. ej. { phase: 'upload', done: 3, total: 10 }. */
  photos: PhotoProgress | null;
  /** Texto listo para mostrar: "Subiendo fotos 3/10" / "Descargando fotos 2/8". */
  photosLabel: string | null;
  /** Aviso sobre fotos (p. ej. falta storage.sql); los datos sí se sincronizan. */
  photoWarning: string | null;
}

interface Internal {
  running: boolean;
  error: string | null;
  errorKind: CloudErrorKind | null;
  lastSyncAt: number | null;
  lastResult: CloudSyncResult | null;
  photos: PhotoProgress | null;
}

let status: Internal = { running: false, error: null, errorKind: null, lastSyncAt: null, lastResult: null, photos: null };
const listeners = new Set<() => void>();

function setStatus(patch: Partial<Internal>): void {
  status = { ...status, ...patch };
  for (const l of [...listeners]) l();
}
const subscribeStatus = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getStatus = () => status;

function subscribeOnline(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}
const getOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

if (typeof indexedDB !== 'undefined') {
  dbReady()
    .then(readLastCloudSyncAt)
    .then((at) => at && !status.lastSyncAt && setStatus({ lastSyncAt: at }))
    .catch(() => undefined);
}

/** Estado de la nube para Ajustes, barra superior, etc. */
export function useCloudStatus(): CloudStatus {
  const cfg = useCloudConfig();
  const auth = useCloudAuth();
  const s = useSyncExternalStore(subscribeStatus, getStatus, getStatus);
  const online = useSyncExternalStore(subscribeOnline, getOnline, () => true);
  // Asegura que el cliente (y la sesión guardada) se carguen al montar la UI.
  useEffect(() => {
    if (cfg.config && !auth.ready) void getCloudClient().catch(() => undefined);
  }, [cfg.config, auth.ready]);
  return useMemo<CloudStatus>(() => {
    const configured = !!cfg.config;
    const signedIn = configured && !!auth.userId;
    const state: CloudState = !signedIn
      ? 'off'
      : s.running
        ? 'syncing'
        : !online || s.errorKind === 'offline'
          ? 'offline'
          : s.error
            ? 'error'
            : 'idle';
    return {
      configured,
      signedIn,
      email: signedIn ? auth.email : null,
      state,
      lastSyncAt: s.lastSyncAt,
      error: state === 'error' ? s.error : null,
      errorKind: state === 'error' ? s.errorKind : null,
      lastResult: s.lastResult,
      photos: signedIn ? s.photos : null,
      photosLabel: signedIn && s.photos ? `${s.photos.phase === 'upload' ? 'Subiendo' : 'Descargando'} fotos ${Math.min(s.photos.done, s.photos.total)}/${s.photos.total}` : null,
      photoWarning: signedIn ? (s.lastResult?.photoError ?? null) : null,
    };
  }, [cfg.config, auth.userId, auth.email, s, online]);
}

/* ----------------------------- Sincronizar ------------------------------- */

async function runOnce(downloadPhotos = true): Promise<CloudSyncResult> {
  const cfg = await getCloudConfig();
  if (!cfg) throw new CloudError('Conecta tu proyecto de Supabase en Ajustes → Nube.', 'config');
  if (!getOnline()) throw new CloudError('Sin conexión a internet. Se sincronizará al volver la conexión.', 'offline');
  const client = await getCloudClient();
  if (!client) throw new CloudError('Conecta tu proyecto de Supabase en Ajustes → Nube.', 'config');
  const { data } = await client.auth.getSession();
  const user = data.session?.user;
  if (!user) throw new CloudError('Inicia sesión para sincronizar.', 'auth');
  try {
    return await runCloudCycle(client, { projectUrl: cfg.url, userId: user.id }, { onProgress: (p) => setStatus({ photos: p }), downloadPhotos });
  } catch (err) {
    throw toCloudError(err, 'No se pudo sincronizar.');
  }
}

let current: Promise<CloudSyncResult> | null = null;
let queued: Promise<CloudSyncResult> | null = null;

/**
 * Sincroniza ahora (baja, aplica y sube). Si ya hay una en curso, encola UNA
 * más para no perder cambios hechos mientras tanto.
 */
export function cloudSyncNow(opts: { downloadPhotos?: boolean } = {}): Promise<CloudSyncResult> {
  if (!current) {
    setStatus({ running: true });
    current = runOnce(opts.downloadPhotos !== false)
      .then((r) => {
        setStatus({ running: false, error: null, errorKind: null, lastSyncAt: Date.now(), lastResult: r, photos: null });
        return r;
      })
      .catch((err: unknown) => {
        const e = toCloudError(err, 'No se pudo sincronizar.');
        setStatus({ running: false, error: e.message, errorKind: e.kind, photos: null });
        throw e;
      })
      .finally(() => {
        current = null;
      });
    return current;
  }
  if (!queued) {
    queued = current
      .catch(() => undefined)
      .then(() => {
        queued = null;
        return cloudSyncNow(opts);
      });
  }
  return queued;
}

/* ------------------------- Restaurar en dispositivo nuevo ---------------- */

/**
 * Primer inicio en un dispositivo nuevo: baja todo de la nube (con sesión ya
 * iniciada), aplica sin auditar, marca el onboarding como terminado y deja la
 * app lista. Las fotos se siguen descargando en segundo plano (ver
 * useCloudStatus().photosLabel). Devuelve cuántos registros llegaron.
 */
export async function restoreFromCloud(): Promise<{ pulled: number; clients: number; expenses: number; inventory: number }> {
  await dbReady();
  // Los datos primero (rápido); las fotos se descargan después en segundo plano.
  const r = await cloudSyncNow({ downloadPhotos: false });
  void cloudSyncNow().catch(() => undefined);
  await recomputeFolioSequence().catch(() => undefined);
  const saved = await db.transaction('rw', db.settings, async () => {
    const s = withSettingsDefaults(await db.settings.get('settings'));
    const next = { ...s, onboarded: true };
    await db.settings.put(next);
    return next;
  });
  setCachedSettings(saved);
  const notDeleted = (x: { deletedAt?: unknown }) => x.deletedAt == null;
  const [clients, expenses, inventory] = await Promise.all([
    db.clients.filter(notDeleted).count(),
    db.expenses.filter(notDeleted).count(),
    db.inventory.filter(notDeleted).count(),
  ]);
  return { pulled: r.pulled, clients, expenses, inventory };
}

/* ------------------------ Conectar / desconectar proyecto ---------------- */

/**
 * Guarda la URL y la clave del proyecto. Si cambia de proyecto, cierra la
 * sesión anterior y reinicia los cursores.
 */
export async function connectCloudProject(input: { url: string; anonKey: string }): Promise<CloudConfig> {
  const before = await getCloudConfig();
  const sameProject = (cfg: CloudConfig) => before && before.url === cfg.url && before.anonKey === cfg.anonKey;
  if (before && getCloudAuth().userId) {
    const v = validateCloudConfig(input).value;
    if (v && !sameProject(v)) await cloudSignOut().catch(() => undefined);
  }
  const cfg = await saveCloudConfig(input);
  if (!sameProject(cfg)) {
    await resetCloudState();
    setStatus({ error: null, errorKind: null, lastSyncAt: null, lastResult: null });
  }
  return cfg;
}

/* --------------------------- Sincronía automática ------------------------ */

const AUTO_INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 2000;

let auto: { refs: number; stop: () => void } | null = null;

function runAuto(): () => void {
  let kickTimer: ReturnType<typeof setTimeout> | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let lastUser: string | null = null;

  const active = () => !!getCloudConfigState().config && !!getCloudAuth().userId;
  const run = () => {
    if (active() && getOnline()) cloudSyncNow().catch(() => undefined);
  };
  const kick = (delay = 0) => {
    clearTimeout(kickTimer);
    kickTimer = setTimeout(run, delay);
  };

  // Al iniciar sesión (o al cargar una sesión guardada) y al cambiar de proyecto.
  const onAuth = () => {
    const u = getCloudAuth().userId;
    if (u && u !== lastUser) kick(300);
    if (!u && lastUser) setStatus({ error: null, errorKind: null });
    lastUser = u;
  };
  const unAuth = subscribeCloudAuth(onAuth);
  const unCfg = subscribeCloudConfig(() => void getCloudClient().catch(() => undefined));
  void getCloudClient()
    .then(onAuth)
    .catch(() => undefined);

  // Cambios locales: la marca más reciente de cada tabla + ajustes, con espera de 2 s.
  let first = true;
  const stamps = () =>
    Promise.all([
      ...CLOUD_TABLES.map((t) =>
        db
          .table(t)
          .orderBy(t === 'movements' || t === 'audit' ? 'ts' : 'updatedAt')
          .last()
          .then((r: { id?: string; ts?: number; updatedAt?: number } | undefined) => `${r?.id ?? ''}@${r?.updatedAt ?? r?.ts ?? 0}`),
      ),
      db.settings.get('settings').then((s) => String(s?.updatedAt ?? 0)),
      db.photos.count(),
      db.meta.get('photoTombstones').then((r) => Object.keys((r?.value as object) ?? {}).length),
      db.clients.count(),
      db.expenses.count(),
      db.inventory.count(),
    ]).then((a) => a.join('|'));
  let lastStamp = '';
  const changesSub = liveQuery(stamps).subscribe({
    next: (v) => {
      if (v === lastStamp) return;
      lastStamp = v;
      if (first) {
        first = false;
        return;
      }
      if (!active()) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        hasCloudPending()
          .then((yes) => yes && run())
          .catch(() => undefined);
      }, DEBOUNCE_MS);
    },
    error: () => undefined,
  });

  const interval = setInterval(run, AUTO_INTERVAL_MS);
  const onOnline = () => kick(1000);
  const onOffline = () => setStatus({});
  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - (status.lastSyncAt ?? 0) > 15_000) kick(400);
  };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    unAuth();
    unCfg();
    changesSub.unsubscribe();
    clearInterval(interval);
    clearTimeout(kickTimer);
    clearTimeout(debounceTimer);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/**
 * Inicia la sincronización automática con la nube (montar UNA vez, p. ej. en
 * el Shell). Sólo actúa con proyecto configurado y sesión iniciada: al iniciar,
 * al iniciar sesión, al volver la conexión o la app, cada 60 s y 2 s después
 * de cada cambio local. Devuelve la función para detenerla.
 */
export function startCloudSync(): () => void {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return () => {};
  if (!auto) auto = { refs: 0, stop: runAuto() };
  auto.refs++;
  let released = false;
  return () => {
    if (released || !auto) return;
    released = true;
    auto.refs--;
    if (auto.refs <= 0) {
      auto.stop();
      auto = null;
    }
  };
}

/** Hook de conveniencia: `useCloudSync()` en el Shell equivale a montar startCloudSync. */
export function useCloudSync(): void {
  useEffect(() => startCloudSync(), []);
}

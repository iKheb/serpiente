/* ==========================================================================
   PwaLayer — montado UNA vez por el Shell.
   · Registra el service worker y ofrece "Actualizar" cuando hay versión nueva.
   · Avisa las transiciones de conexión y cuando la app ya funciona offline.
   · Puentea las notificaciones de la app a notificaciones del sistema.
   · Programa las revisiones (runNotificationChecks) y el periodic sync.
   · Pide almacenamiento persistente tras la primera interacción.
   ========================================================================== */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { CircleCheck, RefreshCw, Sparkles, Wifi, WifiOff, X } from 'lucide-react';
import { onNotificationCreated, runNotificationChecks, updateSettings, useSettings } from '@/data';
import { getDeviceId } from '@/data/db';
import { useOnlineStatus } from './online';
import { applyUpdate, onRunChecksRequest, registerServiceWorker, sendServiceWorkerConfig, swStore } from './register';
import { getNotificationPermission, showSystemNotification } from './notifications';
import { pushStore, refreshPushState } from './push';
import { useStore } from './store';
import styles from './PwaLayer.module.css';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const CHECK_MIN_GAP_MS = 60 * 1000;
const PERIODIC_TAG = 'reparo-checks';
const PERIODIC_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const EASE = [0.16, 1, 0.3, 1] as const;

type NoticeTone = 'offline' | 'online' | 'ready';
interface Notice {
  id: number;
  tone: NoticeTone;
  title: string;
  detail?: string;
}

interface PeriodicSyncManager {
  register(tag: string, options?: { minInterval?: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
}

async function syncPeriodicRegistration(reg: ServiceWorkerRegistration | null, enabled: boolean) {
  const ps = (reg as unknown as { periodicSync?: PeriodicSyncManager } | null)?.periodicSync;
  if (!ps) return;
  try {
    if (!enabled) {
      await ps.unregister(PERIODIC_TAG);
      return;
    }
    // Chrome sólo lo concede a apps instaladas con suficiente uso.
    const perm = await navigator.permissions?.query({ name: 'periodic-background-sync' as PermissionName });
    if (perm && perm.state !== 'granted') return;
    await ps.register(PERIODIC_TAG, { minInterval: PERIODIC_MIN_INTERVAL_MS });
  } catch {
    /* no soportado o sin permiso */
  }
}

function safeDeviceId(): string {
  try {
    return getDeviceId();
  } catch {
    return '';
  }
}

let noticeSeq = 0;

export function PwaLayer() {
  const settings = useSettings();
  const settingsRef = useRef(settings);
  const online = useOnlineStatus();
  const sw = useStore(swStore);
  const reduceMotion = useReducedMotion();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  /* 1. Service worker */
  useEffect(() => {
    registerServiceWorker();
  }, []);

  /* 2. Transiciones de conexión (y aviso si la app arranca sin internet) */
  const prevOnline = useRef<boolean | null>(null);
  useEffect(() => {
    const prev = prevOnline.current;
    prevOnline.current = online;
    if (prev === online) return;
    if (prev === null && online) return; // arranque normal con conexión: nada que decir
    const id = ++noticeSeq;
    setNotice(
      online
        ? { id, tone: 'online', title: 'Conexión restablecida' }
        : { id, tone: 'offline', title: 'Sin conexión', detail: 'tus datos se siguen guardando en este dispositivo' },
    );
  }, [online]);

  /* 3. Primera vez que la app queda disponible sin internet */
  useEffect(() => {
    if (!sw.offlineReady) return;
    setNotice({
      id: ++noticeSeq,
      tone: 'ready',
      title: 'Reparo ya funciona sin internet',
      detail: 'quedó guardado en este dispositivo',
    });
    swStore.set((s) => ({ ...s, offlineReady: false }));
  }, [sw.offlineReady]);

  /* Auto-ocultar avisos */
  useEffect(() => {
    if (!notice) return;
    const ms = notice.tone === 'offline' ? 8000 : notice.tone === 'ready' ? 5000 : 3500;
    const t = window.setTimeout(() => setNotice((n) => (n?.id === notice.id ? null : n)), ms);
    return () => window.clearTimeout(t);
  }, [notice]);

  /* 4. Puente: notificación de la app → notificación del sistema */
  useEffect(
    () =>
      onNotificationCreated((n) => {
        const s = settingsRef.current;
        if (!s?.notificationsEnabled) return;
        if (getNotificationPermission() !== 'granted') return;
        void showSystemNotification({
          title: n.title,
          body: n.body,
          href: n.href,
          tag: n.dedupeKey || n.id,
          kind: n.kind,
        });
      }),
    [],
  );

  /* 5. Revisiones: a los 2 s, cada 15 min, al volver a la app y por periodic sync */
  useEffect(() => {
    let last = 0;
    const run = (force = false) => {
      const now = Date.now();
      if (!force && now - last < CHECK_MIN_GAP_MS) return;
      last = now;
      runNotificationChecks().catch(() => {});
    };
    const first = window.setTimeout(() => run(true), 2000);
    const every = window.setInterval(() => run(true), CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);
    const offSw = onRunChecksRequest(() => run());
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
      document.removeEventListener('visibilitychange', onVisible);
      offSw();
    };
  }, []);

  /* 6. Almacenamiento persistente tras la primera interacción */
  useEffect(() => {
    const storage = navigator.storage;
    if (!storage?.persist) return;
    const remove = () => {
      window.removeEventListener('pointerdown', onFirst);
      window.removeEventListener('keydown', onFirst);
    };
    function onFirst() {
      remove();
      void (async () => {
        try {
          if (!(await storage.persisted?.())) await storage.persist();
        } catch {
          /* el navegador decide */
        }
      })();
    }
    window.addEventListener('pointerdown', onFirst, { passive: true });
    window.addEventListener('keydown', onFirst);
    return remove;
  }, []);

  /* 7. Configuración para el SW + periodic background sync */
  const notifEnabled = settings?.notificationsEnabled;
  const summaryHour = settings?.dailySummaryHour;
  useEffect(() => {
    if (sw.status !== 'ready' || notifEnabled === undefined) return;
    sendServiceWorkerConfig({ notificationsEnabled: notifEnabled, dailySummaryHour: summaryHour, deviceId: safeDeviceId() });
    void syncPeriodicRegistration(sw.registration, notifEnabled);
  }, [sw.status, sw.registration, notifEnabled, summaryHour]);

  /* 8. Coherencia de pushSubscribed (el navegador pudo borrar la suscripción) */
  const pushFlag = settings?.pushSubscribed;
  useEffect(() => {
    if (sw.status !== 'ready' || !pushFlag) return;
    void refreshPushState().then((actual) => {
      if (actual === false && !pushStore.get().busy) updateSettings({ pushSubscribed: false }).catch(() => {});
    });
  }, [sw.status, pushFlag]);

  if (typeof document === 'undefined') return null;

  const showUpdate = sw.updateReady && !updateDismissed;
  const enterY = reduceMotion ? 0 : 14;

  return createPortal(
    <>
      <div className={styles.topLayer} role="status" aria-live="polite">
        <AnimatePresence>
          {notice && (
            <motion.div
              key={notice.id}
              className={styles.pill}
              data-tone={notice.tone}
              initial={{ opacity: 0, y: reduceMotion ? 0 : -12, scale: reduceMotion ? 1 : 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -8, scale: reduceMotion ? 1 : 0.98 }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              <span className={styles.pillIcon} aria-hidden="true">
                {notice.tone === 'offline' ? (
                  <WifiOff size={15} strokeWidth={2.2} />
                ) : notice.tone === 'online' ? (
                  <Wifi size={15} strokeWidth={2.2} />
                ) : (
                  <CircleCheck size={15} strokeWidth={2.2} />
                )}
              </span>
              <span className={styles.pillText}>
                <strong>{notice.title}</strong>
                {notice.detail && <span className={styles.pillDetail}> — {notice.detail}</span>}
              </span>
              <button
                type="button"
                className={styles.pillClose}
                onClick={() => setNotice(null)}
                aria-label="Cerrar aviso"
              >
                <X size={14} strokeWidth={2.2} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={styles.bottomLayer}>
        <AnimatePresence>
          {showUpdate && (
            <motion.section
              key="update"
              className={styles.card}
              role="region"
              aria-label="Actualización disponible"
              aria-live="polite"
              initial={{ opacity: 0, y: enterY, scale: reduceMotion ? 1 : 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : 10, scale: reduceMotion ? 1 : 0.98 }}
              transition={{ duration: 0.32, ease: EASE }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && !sw.updating) setUpdateDismissed(true);
              }}
            >
              <span className={styles.cardGlyph} aria-hidden="true">
                <Sparkles size={18} strokeWidth={2.1} />
              </span>
              <div className={styles.cardBody}>
                <h2 className={styles.cardTitle}>Hay una nueva versión de Reparo</h2>
                <p className={styles.cardText}>Incluye mejoras y correcciones. Tus datos se conservan intactos.</p>
              </div>
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => setUpdateDismissed(true)}
                  disabled={sw.updating}
                >
                  Más tarde
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => void applyUpdate()}
                  disabled={sw.updating}
                  aria-busy={sw.updating}
                >
                  <RefreshCw size={14} strokeWidth={2.3} className={sw.updating ? styles.spin : undefined} aria-hidden="true" />
                  {sw.updating ? 'Actualizando…' : 'Actualizar'}
                </button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </>,
    document.body,
  );
}

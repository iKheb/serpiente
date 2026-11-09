/* Ajustes — navegación por secciones (escritorio) / lista agrupada (móvil). Guardado automático. */
import { type ComponentType, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Bell, ChevronRight, CircleAlert, CircleCheck, Database, Info, RefreshCcw, SlidersHorizontal, Smartphone, Store, type LucideIcon } from 'lucide-react';
import { setQuery, useRoute } from '@/app/router';
import { CURRENCIES, formatTime, useSettings, type Settings } from '@/data';
import { useSyncStatus } from '@/data/sync';
import { useNotificationPermission, useSwUpdate } from '@/pwa';
import { Badge, PageHeader, Skeleton, Spinner, cx, useIsMobile, usePrefersReducedMotion } from '@/ui';
import { useSaveState } from './shared';
import { NegocioSection } from './sections/Negocio';
import { PreferenciasSection } from './sections/Preferencias';
import { NotificacionesSection } from './sections/Notificaciones';
import { SincronizacionSection } from './sections/Sincronizacion';
import { AplicacionSection } from './sections/Aplicacion';
import { DatosSection } from './sections/Datos';
import { AcercaSection } from './sections/Acerca';
import { CloudSettingsSection } from '@/cloud';
import { Cloud } from 'lucide-react';
import styles from './Ajustes.module.css';

type SectionId = 'negocio' | 'preferencias' | 'notificaciones' | 'nube' | 'sincronizacion' | 'aplicacion' | 'datos' | 'acerca';

interface SectionDef {
  id: SectionId;
  label: string;
  description: string;
  icon: LucideIcon;
  group: string;
  render: ComponentType<{ settings: Settings }>;
}

const SECTIONS: SectionDef[] = [
  { id: 'negocio', label: 'Negocio', description: 'Nombre, contacto y recibo', icon: Store, group: 'Tu taller', render: NegocioSection },
  { id: 'preferencias', label: 'Preferencias', description: 'Moneda, semana, tema y meta', icon: SlidersHorizontal, group: 'Tu taller', render: PreferenciasSection },
  { id: 'notificaciones', label: 'Notificaciones', description: 'Avisos de stock, entregas y resumen', icon: Bell, group: 'Avisos y conexión', render: NotificacionesSection },
  { id: 'nube', label: 'Nube', description: 'Mismos datos en tu PC y tu celular', icon: Cloud, group: 'Avisos y conexión', render: () => <CloudSettingsSection /> },
  { id: 'sincronizacion', label: 'Servidor local', description: 'Avanzado: servidor propio en el taller', icon: RefreshCcw, group: 'Avisos y conexión', render: SincronizacionSection },
  { id: 'aplicacion', label: 'Aplicación', description: 'Instalar, actualizar y almacenamiento', icon: Smartphone, group: 'Sistema', render: AplicacionSection },
  { id: 'datos', label: 'Datos y respaldo', description: 'Respaldo, CSV y borrado', icon: Database, group: 'Sistema', render: DatosSection },
  { id: 'acerca', label: 'Acerca de', description: 'Versión e información', icon: Info, group: 'Sistema', render: AcercaSection },
];

const GROUPS = [...new Set(SECTIONS.map((s) => s.group))];

function SaveIndicator() {
  const s = useSaveState();
  return (
    <span className={cx(styles.save, styles[`save-${s.status}`])} role="status" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={s.status}
          className={styles.saveInner}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.16 }}
        >
          {s.status === 'saving' ? (
            <>
              <Spinner size={12} /> Guardando…
            </>
          ) : s.status === 'saved' ? (
            <>
              <CircleCheck /> Guardado{s.at ? ` · ${formatTime(s.at)}` : ''}
            </>
          ) : s.status === 'error' ? (
            <>
              <CircleAlert /> {s.message ?? 'No se guardó'}
            </>
          ) : (
            <>
              <CircleCheck /> Los cambios se guardan solos
            </>
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Resumen de estado por sección (lista móvil y navegación). */
function useSectionMeta(settings: Settings | undefined): Partial<Record<SectionId, ReactNode>> {
  const { permission } = useNotificationPermission();
  const sync = useSyncStatus();
  const { updateReady } = useSwUpdate();
  if (!settings) return {};
  const cur = CURRENCIES.find((c) => c.code === settings.currency);
  return {
    preferencias: cur ? cur.code : settings.currency,
    notificaciones: !settings.notificationsEnabled ? 'Desactivadas' : permission === 'granted' ? 'Activas' : permission === 'denied' ? 'Bloqueadas' : 'Sólo en la app',
    sincronizacion: sync.state === 'disabled' ? 'Desactivada' : sync.state === 'idle' ? 'Al día' : sync.state === 'syncing' ? 'Sincronizando…' : sync.state === 'offline' ? 'Sin conexión' : 'Con error',
    aplicacion: updateReady ? (
      <Badge tone="brand" size="sm" dot>
        Actualización
      </Badge>
    ) : undefined,
    datos:
      !settings.lastBackupAt || Date.now() - settings.lastBackupAt > 7 * 864e5 ? (
        <Badge tone="warning" size="sm" dot>
          Respaldar
        </Badge>
      ) : undefined,
  };
}

function LoadingState() {
  return (
    <div className={styles.layout} aria-busy="true">
      <div className={styles.nav}>
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} height={34} radius={8} />
        ))}
      </div>
      <div className={styles.stack}>
        <Skeleton height={20} width={180} />
        <Skeleton height={220} radius={14} />
        <Skeleton height={160} radius={14} />
      </div>
    </div>
  );
}

export default function AjustesPage() {
  const settings = useSettings();
  const route = useRoute();
  const mobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  const meta = useSectionMeta(settings);
  const param = route.query.get('seccion') as SectionId | null;
  const requested = SECTIONS.find((s) => s.id === param) ?? null;
  const current = requested ?? (mobile ? null : SECTIONS[0]);

  const go = (id: SectionId | null) => setQuery({ seccion: id });

  if (!settings) {
    return (
      <>
        <PageHeader title="Ajustes" subtitle="Configura tu negocio, avisos y respaldos." />
        <LoadingState />
      </>
    );
  }

  // Móvil sin sección elegida: lista agrupada.
  if (mobile && !current) {
    return (
      <>
        <PageHeader title="Ajustes" subtitle="Configura tu negocio, avisos y respaldos." meta={<SaveIndicator />} />
        <div className={styles.mList}>
          {GROUPS.map((g) => (
            <section key={g} className={styles.mGroup} aria-label={g}>
              <h2 className={styles.mGroupTitle}>{g}</h2>
              <ul className={styles.mCard}>
                {SECTIONS.filter((s) => s.group === g).map((s) => {
                  const Icon = s.icon;
                  const m = meta[s.id];
                  return (
                    <li key={s.id}>
                      <button type="button" className={styles.mRow} onClick={() => go(s.id)}>
                        <span className={styles.mIcon} data-section={s.id}>
                          <Icon aria-hidden />
                        </span>
                        <span className={styles.mText}>
                          <span className={styles.mLabel}>{s.label}</span>
                          <span className={styles.mDesc}>{s.description}</span>
                        </span>
                        {m && <span className={styles.mMeta}>{m}</span>}
                        <ChevronRight className={styles.mChevron} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </>
    );
  }

  const section = current ?? SECTIONS[0];
  const Body = section.render;

  return (
    <>
      <PageHeader
        title={mobile ? section.label : 'Ajustes'}
        subtitle={mobile ? section.description : 'Configura tu negocio, avisos y respaldos.'}
        back={mobile ? { href: '#/ajustes', label: 'Ajustes' } : undefined}
        meta={mobile ? <SaveIndicator /> : undefined}
        actions={mobile ? undefined : <SaveIndicator />}
      />
      <div className={styles.layout}>
        {!mobile && (
          <nav className={styles.nav} aria-label="Secciones de ajustes">
            {GROUPS.map((g) => (
              <div key={g} className={styles.navGroup}>
                <span className={styles.navGroupTitle}>{g}</span>
                {SECTIONS.filter((s) => s.group === g).map((s) => {
                  const Icon = s.icon;
                  const active = s.id === section.id;
                  const m = meta[s.id];
                  return (
                    <a
                      key={s.id}
                      href={`#/ajustes?seccion=${s.id}`}
                      className={cx(styles.navItem, active && styles.navActive)}
                      aria-current={active ? 'page' : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        go(s.id);
                      }}
                    >
                      {active && <motion.span layoutId="ajustes-nav" className={styles.navPill} transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
                      <Icon aria-hidden className={styles.navIcon} />
                      <span className={styles.navLabel}>{s.label}</span>
                      {m && typeof m !== 'string' && <span className={styles.navMeta} title="Requiere atención"><span className={styles.navDot} /></span>}
                    </a>
                  );
                })}
              </div>
            ))}
          </nav>
        )}
        <div className={styles.content}>
          {!mobile && (
            <div className={styles.contentHead}>
              <h2 className={styles.contentTitle}>{section.label}</h2>
              <p className={styles.contentDesc}>{section.description}</p>
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: reduced ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <Body settings={settings} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

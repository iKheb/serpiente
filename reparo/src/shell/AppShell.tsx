import { lazy, Suspense, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { LucideProvider } from 'lucide-react';
import { motion } from 'motion/react';
import { navigate, type Route } from '@/app/router';
import { useSettings } from '@/data';
import { PwaLayer } from '@/pwa';
import { Toaster, focusSlashTarget, readLocal, useHotkey, useIsMobile, useLocalState, usePrefersReducedMotion } from '@/ui';
import { CommandPalette } from './CommandPalette';
import { MobileHeader, TabBar } from './MobileNav';
import { NAV_ITEMS, QUICK_ACTIONS } from './nav';
import { openCommandPalette, toggleCommandPalette } from './palette';
import { Sidebar } from './Sidebar';
import { Splash } from './Splash';
import { toggleTheme, useApplyTheme } from './theme';
import { Topbar } from './Topbar';
import styles from './AppShell.module.css';

const Onboarding = lazy(() => import('@/pages/onboarding/Onboarding'));

export { openCommandPalette } from './palette';

const SIDEBAR_KEY = 'reparo:sidebar-collapsed';
const defaultCollapsed = () => readLocal<boolean | null>(SIDEBAR_KEY, null) ?? (typeof window !== 'undefined' && window.innerWidth < 1200);

/** Atajos globales (no se disparan al escribir ni con un modal abierto). */
function GlobalShortcuts({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  useHotkey('k', () => toggleCommandPalette(), { mod: true, allowInInputs: true });
  useHotkey('/', () => {
    if (!focusSlashTarget()) openCommandPalette();
  });
  useHotkey('c', () => navigate(QUICK_ACTIONS[0].href));
  useHotkey('g', () => navigate(QUICK_ACTIONS[1].href));
  useHotkey('i', () => navigate(QUICK_ACTIONS[2].href));
  useHotkey('u', () => navigate(QUICK_ACTIONS[3].href));
  useHotkey('t', () => toggleTheme());
  useHotkey('[', onToggleSidebar);
  for (const n of NAV_ITEMS) {
    // NAV_ITEMS es constante: el número de hooks no cambia entre renders.
    useHotkey(n.key, () => navigate(n.href));
  }
  return null;
}

/** Fondo ambiental: degradados radiales de marca + ruido muy sutil. */
function Ambient() {
  return (
    <div className={styles.ambient} aria-hidden>
      <span className={styles.glowA} />
      <span className={styles.glowB} />
      <span className={styles.noise} />
    </div>
  );
}

export function AppShell({ route, children }: { route: Route; children: ReactNode }) {
  const settings = useSettings();
  useApplyTheme(settings?.theme);
  const mobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  const [collapsed, setCollapsed] = useLocalState<boolean>(SIDEBAR_KEY, defaultCollapsed());
  const toggleSidebar = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);
  const firstRoute = useRef(true);

  // Al cambiar de sección, vuelve arriba.
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
  }, [route.name]);

  let body: ReactNode;
  if (!settings) {
    body = <Splash />;
  } else if (settings.onboarded === false) {
    body = (
      <Suspense fallback={<Splash />}>
        <Onboarding />
      </Suspense>
    );
  } else {
    body = (
      <div className={styles.shell} data-collapsed={!mobile && collapsed ? 'true' : undefined}>
        <a href="#contenido" className={styles.skip}>
          Saltar al contenido
        </a>
        <Ambient />
        {!mobile && <Sidebar route={route} collapsed={collapsed} settings={settings} />}
        <div className={styles.main}>
          {mobile ? <MobileHeader route={route} /> : <Topbar route={route} collapsed={collapsed} onToggleSidebar={toggleSidebar} />}
          <main id="contenido" className={styles.content} tabIndex={-1}>
            <motion.div
              key={route.name}
              className={styles.container}
              initial={{ opacity: 0, y: reduced ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0.12 : 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.div>
          </main>
        </div>
        {mobile && <TabBar route={route} settings={settings} />}
        <GlobalShortcuts onToggleSidebar={toggleSidebar} />
        <CommandPalette />
      </div>
    );
  }

  return (
    <LucideProvider strokeWidth={1.75}>
      {body}
      <Toaster />
      <PwaLayer />
    </LucideProvider>
  );
}

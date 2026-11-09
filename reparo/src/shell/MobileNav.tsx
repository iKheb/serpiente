import { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronRight, LayoutDashboard, Menu, Monitor, Moon, Package, Plus, Search, Sun, Users } from 'lucide-react';
import { navigate, type Route } from '@/app/router';
import { updateSettings } from '@/data';
import type { Settings, ThemePreference } from '@/data/types';
import { useOnlineStatus } from '@/pwa';
import { Avatar, IconButton, SegmentedControl, Sheet, cx } from '@/ui';
import { BrandMark } from './BrandMark';
import { LiveClock } from './LiveClock';
import { NotificationsButton } from './Notifications';
import { NAV_ITEMS, QUICK_ACTIONS, ROUTE_TITLE } from './nav';
import { openCommandPalette } from './palette';
import { useBreadcrumb } from './useBreadcrumb';
import { useNavBadges } from './useNavBadges';
import styles from './MobileNav.module.css';

export function MobileHeader({ route }: { route: Route }) {
  const crumbs = useBreadcrumb(route);
  const detail = crumbs.length > 1;
  return (
    <header className={styles.header}>
      <a href="#/panel" className={styles.mark} aria-label="Reparo · Panel">
        <BrandMark size={28} />
      </a>
      <div className={styles.titleBlock}>
        {detail && (
          <a href={crumbs[0].href} className={styles.parent}>
            {crumbs[0].label}
          </a>
        )}
        <h1 className={styles.title}>{detail ? crumbs[1].label : ROUTE_TITLE[route.name]}</h1>
      </div>
      <LiveClock variant="stacked" className={styles.clock} />
      <div className={styles.actions}>
        <IconButton icon={<Search />} label="Buscar" onClick={openCommandPalette} tooltip={false} />
        <NotificationsButton mobile />
      </div>
    </header>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: 'dark', label: 'Oscuro', icon: <Moon /> },
  { value: 'light', label: 'Claro', icon: <Sun /> },
  { value: 'system', label: 'Sistema', icon: <Monitor /> },
];

export function TabBar({ route, settings }: { route: Route; settings: Settings }) {
  const [quick, setQuick] = useState(false);
  const [more, setMore] = useState(false);
  const badges = useNavBadges();
  const online = useOnlineStatus();
  const moreRoutes = NAV_ITEMS.filter((n) => ['gastos', 'reportes', 'actividad', 'ajustes'].includes(n.route));
  const inMore = moreRoutes.some((n) => n.route === route.name);

  const tabs = [
    { key: 'panel', label: 'Panel', icon: LayoutDashboard, href: '#/panel', active: route.name === 'panel' },
    { key: 'clientes', label: 'Clientes', icon: Users, href: '#/clientes', active: route.name === 'clientes', badge: badges.clientes },
    { key: 'plus' },
    { key: 'inventario', label: 'Inventario', icon: Package, href: '#/inventario', active: route.name === 'inventario', badge: badges.inventario },
    { key: 'mas', label: 'Más', icon: Menu, active: inMore || more },
  ] as const;

  const go = (href: string) => {
    setQuick(false);
    setMore(false);
    navigate(href);
  };

  return (
    <>
      <nav className={styles.tabbar} aria-label="Navegación principal">
        {tabs.map((t) => {
          if (t.key === 'plus') {
            return (
              <div key="plus" className={styles.plusSlot}>
                <button type="button" className={styles.plus} aria-label="Acciones rápidas" aria-haspopup="dialog" aria-expanded={quick} onClick={() => setQuick(true)}>
                  <Plus aria-hidden />
                </button>
              </div>
            );
          }
          const Icon = t.icon;
          const content = (
            <>
              {t.active && <motion.span layoutId="tab-active" className={styles.tabPill} transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
              <span className={styles.tabIcon}>
                <Icon aria-hidden />
                {'badge' in t && t.badge && (
                  <span className={cx(styles.tabBadge, styles[`b-${t.badge.tone}`])}>{t.badge.count > 99 ? '99+' : t.badge.count}</span>
                )}
              </span>
              <span className={styles.tabLabel}>{t.label}</span>
            </>
          );
          if ('href' in t) {
            return (
              <a key={t.key} href={t.href} className={cx(styles.tab, t.active && styles.tabActive)} aria-current={t.active ? 'page' : undefined}>
                {content}
              </a>
            );
          }
          return (
            <button key={t.key} type="button" className={cx(styles.tab, t.active && styles.tabActive)} aria-haspopup="dialog" aria-expanded={more} onClick={() => setMore(true)}>
              {content}
            </button>
          );
        })}
      </nav>

      <Sheet open={quick} onClose={() => setQuick(false)} title="Acciones rápidas" description="¿Qué quieres registrar?">
        <div className={styles.quickGrid}>
          {QUICK_ACTIONS.map((a) => (
            <button key={a.id} type="button" className={cx(styles.quick, styles[`q-${a.tone}`])} onClick={() => go(a.href)}>
              <span className={styles.quickIcon}>
                <a.icon aria-hidden />
              </span>
              <span className={styles.quickLabel}>{a.label}</span>
              <span className={styles.quickDesc}>{a.description}</span>
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={more} onClose={() => setMore(false)} title="Más" description={settings.businessName || 'Reparo'}>
        <ul className={styles.moreList}>
          {moreRoutes.map((n) => (
            <li key={n.route}>
              <button type="button" className={cx(styles.moreItem, route.name === n.route && styles.moreActive)} onClick={() => go(n.href)}>
                <span className={styles.moreIcon}>
                  <n.icon aria-hidden />
                </span>
                <span className={styles.moreText}>
                  <span className={styles.moreLabel}>{n.label}</span>
                  <span className={styles.moreDesc}>{n.description}</span>
                </span>
                <ChevronRight className={styles.moreChev} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <div className={styles.themeRow}>
          <span className={styles.themeLabel}>Apariencia</span>
          <SegmentedControl
            aria-label="Tema"
            fullWidth
            value={settings.theme}
            onChange={(v) => void updateSettings({ theme: v })}
            options={THEME_OPTIONS}
          />
        </div>
        <div className={styles.moreFooter}>
          <Avatar name={settings.ownerName || 'Dueño'} size="md" />
          <div className={styles.moreOwner}>
            <span className={styles.moreOwnerName}>{settings.ownerName || 'Dueño'}</span>
            <span className={cx(styles.conn, !online && styles.connOff)}>
              <span className={styles.connDot} aria-hidden />
              {online ? 'En línea' : 'Sin conexión · datos guardados en este equipo'}
            </span>
          </div>
        </div>
      </Sheet>
    </>
  );
}

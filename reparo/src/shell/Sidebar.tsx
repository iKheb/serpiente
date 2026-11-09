import { motion } from 'motion/react';
import type { Route } from '@/app/router';
import { useOnlineStatus } from '@/pwa';
import type { Settings } from '@/data/types';
import { Avatar, Tooltip, cx } from '@/ui';
import { BrandMark } from './BrandMark';
import { NAV_ITEMS, type NavItem } from './nav';
import { useNavBadges, type NavBadge } from './useNavBadges';
import styles from './Sidebar.module.css';

function NavLink({ item, active, collapsed, badge }: { item: NavItem; active: boolean; collapsed: boolean; badge?: NavBadge }) {
  const Icon = item.icon;
  const link = (
    <a href={item.href} className={cx(styles.item, active && styles.active)} aria-current={active ? 'page' : undefined} aria-label={collapsed ? item.label : undefined}>
      {active && <motion.span layoutId="sidebar-active" className={styles.activeBg} transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
      <span className={styles.iconWrap}>
        <Icon className={styles.icon} aria-hidden />
        {collapsed && badge && <span className={cx(styles.miniBadge, styles[`b-${badge.tone}`])} aria-hidden />}
      </span>
      {!collapsed && <span className={styles.label}>{item.label}</span>}
      {!collapsed && badge && (
        <span className={cx(styles.count, styles[`b-${badge.tone}`])} title={badge.label}>
          {badge.count > 99 ? '99+' : badge.count}
          <span className="sr-only"> · {badge.label}</span>
        </span>
      )}
    </a>
  );
  if (!collapsed) return link;
  return (
    <Tooltip content={badge ? `${item.label} · ${badge.label}` : item.label} side="right" shortcut={item.key}>
      {link}
    </Tooltip>
  );
}

export function Sidebar({ route, collapsed, settings }: { route: Route; collapsed: boolean; settings: Settings }) {
  const online = useOnlineStatus();
  const badges = useNavBadges();
  const groups: { id: NavItem['group']; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'analisis', label: 'Análisis' },
  ];
  const owner = settings.ownerName?.trim() || 'Dueño';
  const business = settings.businessName?.trim() || 'Mi taller';
  const status = online ? 'En línea' : 'Sin conexión · datos guardados en este equipo';

  return (
    <aside className={cx(styles.sidebar, collapsed && styles.collapsed)} aria-label="Barra lateral">
      <a href="#/panel" className={styles.brand} aria-label={`Reparo · ${business}`}>
        <BrandMark size={30} className={styles.mark} />
        {!collapsed && (
          <span className={styles.brandText}>
            <span className={styles.wordmark}>Reparo</span>
            <span className={styles.business}>{business}</span>
          </span>
        )}
      </a>

      <nav className={styles.nav} aria-label="Principal">
        {groups.map((g) => (
          <div key={g.id} className={styles.group}>
            {!collapsed ? <div className={styles.groupLabel}>{g.label}</div> : <div className={styles.groupRule} aria-hidden />}
            <ul>
              {NAV_ITEMS.filter((n) => n.group === g.id).map((n) => (
                <li key={n.route}>
                  <NavLink item={n} active={route.name === n.route} collapsed={collapsed} badge={badges[n.route]} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={styles.bottom}>
        <ul>
          {NAV_ITEMS.filter((n) => n.group === 'sistema').map((n) => (
            <li key={n.route}>
              <NavLink item={n} active={route.name === n.route} collapsed={collapsed} />
            </li>
          ))}
        </ul>

        <div className={styles.footer}>
          {collapsed ? (
            <Tooltip content={status} side="right">
              <span className={styles.statusCollapsed} tabIndex={0} role="status" aria-label={status}>
                <span className={cx(styles.statusDot, online ? styles.online : styles.offline)} />
              </span>
            </Tooltip>
          ) : (
            <div className={cx(styles.status, !online && styles.statusOffline)} role="status">
              <span className={cx(styles.statusDot, online ? styles.online : styles.offline)} aria-hidden />
              <span className={styles.statusText}>
                {online ? (
                  'En línea'
                ) : (
                  <>
                    Sin conexión <span className={styles.statusSub}>· datos guardados en este equipo</span>
                  </>
                )}
              </span>
            </div>
          )}
          <a href="#/ajustes" className={styles.owner} aria-label={`${owner} · ${business} · Ajustes`}>
            <Avatar name={owner} size="sm" />
            {!collapsed && (
              <span className={styles.ownerText}>
                <span className={styles.ownerName}>{owner}</span>
                <span className={styles.ownerRole}>Dueño · {business}</span>
              </span>
            )}
          </a>
        </div>
      </div>
    </aside>
  );
}

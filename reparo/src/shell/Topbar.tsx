import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, Plus, Search } from 'lucide-react';
import type { Route } from '@/app/router';
import { Button, DropdownMenu, IconButton, KbdGroup, MOD_KEY_LABEL } from '@/ui';
import { LiveClock } from './LiveClock';
import { NotificationsButton } from './Notifications';
import { NAV_ITEMS, QUICK_ACTIONS } from './nav';
import { openCommandPalette } from './palette';
import { useBreadcrumb } from './useBreadcrumb';
import styles from './Topbar.module.css';

export function Topbar({ route, collapsed, onToggleSidebar }: { route: Route; collapsed: boolean; onToggleSidebar: () => void }) {
  const crumbs = useBreadcrumb(route);
  const nav = NAV_ITEMS.find((n) => n.route === route.name);
  const Icon = nav?.icon;
  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <IconButton
          icon={collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          label={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
          shortcut="["
          size="sm"
          onClick={onToggleSidebar}
        />
        <span className={styles.sep} aria-hidden />
        <nav aria-label="Ruta de navegación" className={styles.crumbs}>
          <ol>
            {crumbs.map((c, i) => (
              <li key={i}>
                {i > 0 && <ChevronRight className={styles.chev} aria-hidden />}
                {c.href ? (
                  <a href={c.href} className={styles.crumbLink}>
                    {i === 0 && Icon && <Icon className={styles.crumbIcon} aria-hidden />}
                    {c.label}
                  </a>
                ) : (
                  <span className={styles.crumbCurrent} aria-current="page">
                    {i === 0 && Icon && <Icon className={styles.crumbIcon} aria-hidden />}
                    <span className={styles.crumbText}>{c.label}</span>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <button type="button" className={styles.search} onClick={openCommandPalette} aria-label="Buscar (abre la paleta de comandos)">
        <Search className={styles.searchIcon} aria-hidden />
        <span className={styles.searchText}>Buscar clientes, folios, repuestos…</span>
        <KbdGroup keys={[MOD_KEY_LABEL, 'K']} size="sm" />
      </button>

      <div className={styles.right}>
        <LiveClock className={styles.clock} />
        <NotificationsButton mobile={false} />
        <DropdownMenu
          align="end"
          width={260}
          label="Crear"
          items={[
            { type: 'label', label: 'Crear' },
            ...QUICK_ACTIONS.map((a) => ({
              label: a.label,
              icon: <a.icon />,
              shortcut: [a.key],
              href: a.href,
            })),
          ]}
          trigger={
            <Button variant="primary" size="sm" iconLeft={<Plus />} iconRight={<ChevronDown />} className={styles.newBtn}>
              Nuevo
            </Button>
          }
        />
      </div>
    </header>
  );
}

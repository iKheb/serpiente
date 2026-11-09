import { useMemo, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  ChartColumn,
  CircleDollarSign,
  DatabaseBackup,
  Info,
  PackageMinus,
  ShieldCheck,
  Smartphone,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { navigate } from '@/app/router';
import { markAllNotificationsRead, markNotificationRead, useNotifications, useUnreadCount } from '@/data';
import type { AppNotification, NotificationKind } from '@/data/types';
import { Button, DateTimeText, EmptyState, FloatingPanel, IconButton, SegmentedControl, Sheet, Skeleton, cx } from '@/ui';
import styles from './Notifications.module.css';

const KIND: Record<NotificationKind, { icon: LucideIcon; tone: string; label: string }> = {
  stock_bajo: { icon: PackageMinus, tone: 'warning', label: 'Inventario' },
  listo_sin_entregar: { icon: Smartphone, tone: 'success', label: 'Equipo listo' },
  pago_pendiente: { icon: CircleDollarSign, tone: 'pending', label: 'Por cobrar' },
  garantia: { icon: ShieldCheck, tone: 'info', label: 'Garantía' },
  resumen: { icon: ChartColumn, tone: 'brand', label: 'Resumen' },
  respaldo: { icon: DatabaseBackup, tone: 'info', label: 'Respaldo' },
  meta: { icon: Target, tone: 'profit', label: 'Meta' },
  sistema: { icon: Info, tone: 'neutral', label: 'Sistema' },
};

function NotificationItem({ n, onOpen }: { n: AppNotification; onOpen: (n: AppNotification) => void }) {
  const k = KIND[n.kind] ?? KIND.sistema;
  const Icon = k.icon;
  const unread = n.readAt == null;
  return (
    <li>
      <button type="button" className={cx(styles.item, unread && styles.unread)} onClick={() => onOpen(n)}>
        <span className={cx(styles.kindIcon, styles[`t-${k.tone}`])} aria-hidden>
          <Icon />
        </span>
        <span className={styles.itemBody}>
          <span className={styles.itemTitle}>{n.title}</span>
          {n.body && <span className={styles.itemText}>{n.body}</span>}
          <span className={styles.itemMeta}>
            <span className={styles.kindLabel}>{k.label}</span>
            <span aria-hidden>·</span>
            <DateTimeText value={n.ts} variant="relative-datetime" />
          </span>
        </span>
        {unread && <span className={styles.unreadDot} aria-label="Sin leer" />}
      </button>
    </li>
  );
}

function NotificationList({ onNavigate }: { onNavigate: () => void }) {
  const [filter, setFilter] = useState<'todas' | 'sinleer'>('todas');
  const all = useNotifications({ limit: 60 });
  const unread = useUnreadCount();
  const list = useMemo(() => (filter === 'sinleer' ? all?.filter((n) => n.readAt == null) : all), [all, filter]);

  const open = (n: AppNotification) => {
    if (n.readAt == null) void markNotificationRead(n.id);
    onNavigate();
    if (n.href) navigate(n.href);
  };

  return (
    <div className={styles.panelInner}>
      <div className={styles.toolbar}>
        <SegmentedControl
          size="sm"
          aria-label="Filtrar notificaciones"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'todas', label: 'Todas' },
            { value: 'sinleer', label: unread ? `Sin leer · ${unread}` : 'Sin leer' },
          ]}
        />
        <Button size="sm" variant="ghost" iconLeft={<CheckCheck />} disabled={!unread} onClick={() => void markAllNotificationsRead()}>
          Marcar todas como leídas
        </Button>
      </div>
      <div className={styles.scroll}>
        {list === undefined ? (
          <div className={styles.loading}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.skRow}>
                <Skeleton width={32} height={32} radius={9} />
                <div className={styles.skText}>
                  <Skeleton width="60%" height={11} />
                  <Skeleton width="90%" height={10} />
                </div>
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<Bell />}
            accent={<CheckCheck />}
            tone="success"
            title={filter === 'sinleer' && (all?.length ?? 0) > 0 ? 'Todo leído' : 'Todo al día'}
            description="Te avisaremos cuando un repuesto se agote, un equipo lleve días listo o haya cobros pendientes."
          />
        ) : (
          <ul className={styles.list}>
            {list.map((n) => (
              <NotificationItem key={n.id} n={n} onOpen={open} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Campana con contador y panel de notificaciones (popover en escritorio, hoja en móvil). */
export function NotificationsButton({ mobile }: { mobile: boolean }) {
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const label = unread ? `Notificaciones (${unread} sin leer)` : 'Notificaciones';
  return (
    <>
      <IconButton
        ref={anchorRef}
        icon={<Bell />}
        label={label}
        badge={unread}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cx(styles.bell, open && styles.bellOpen)}
        tooltip={!open}
        onClick={() => setOpen((o) => !o)}
      />
      {mobile ? (
        <Sheet open={open} onClose={() => setOpen(false)} title="Notificaciones" description={unread ? `${unread} sin leer` : 'Estás al día'} flush>
          <NotificationList onNavigate={() => setOpen(false)} />
        </Sheet>
      ) : (
        <FloatingPanel
          open={open}
          onClose={() => {
            setOpen(false);
            anchorRef.current?.focus();
          }}
          onOutside={() => setOpen(false)}
          anchorRef={anchorRef}
          align="end"
          width={420}
          offset={10}
          role="dialog"
          aria-label="Notificaciones"
          className={styles.popover}
        >
          <div className={styles.header}>
            <h2 className={styles.title}>Notificaciones</h2>
            {unread > 0 && <span className={styles.count}>{unread}</span>}
          </div>
          <NotificationList onNavigate={() => setOpen(false)} />
        </FloatingPanel>
      )}
    </>
  );
}

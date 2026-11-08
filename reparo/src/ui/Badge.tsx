import type { ReactNode } from 'react';
import type { RepairStatus } from '@/data/types';
import { REPAIR_STATUS_LABEL } from '@/data/types';
import { cx } from './utils';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'brand' | 'income' | 'expense' | 'profit' | 'pending' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps {
  tone?: BadgeTone;
  /** Punto de color a la izquierda. */
  dot?: boolean;
  /** Punto pulsante (estado "en curso"). */
  pulse?: boolean;
  icon?: ReactNode;
  size?: 'sm' | 'md';
  /** Variante sólida (más contraste) para conteos. */
  solid?: boolean;
  children?: ReactNode;
  className?: string;
  title?: string;
}

/** Etiqueta compacta de estado/categoría con tono semántico. */
export function Badge({ tone = 'neutral', dot, pulse, icon, size = 'md', solid, children, className, title }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], styles[size], solid && styles.solid, className)} title={title}>
      {dot && <span className={cx(styles.dot, pulse && styles.pulse)} aria-hidden />}
      {icon && <span className={styles.icon} aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}

const STATUS_CLASS: Record<RepairStatus, string> = {
  recibido: styles.sRecibido,
  diagnostico: styles.sDiagnostico,
  reparando: styles.sReparando,
  listo: styles.sListo,
  entregado: styles.sEntregado,
  cancelado: styles.sCancelado,
};

export interface StatusBadgeProps {
  status: RepairStatus;
  size?: 'sm' | 'md';
  /** Etiqueta corta ("Diagnóstico" en lugar de "En diagnóstico"). */
  short?: boolean;
  className?: string;
}

const SHORT_LABEL: Record<RepairStatus, string> = {
  recibido: 'Recibido',
  diagnostico: 'Diagnóstico',
  reparando: 'Reparando',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

/** Estado de reparación con su color (--status-*). */
export function StatusBadge({ status, size = 'md', short, className }: StatusBadgeProps) {
  const active = status === 'reparando' || status === 'diagnostico';
  return (
    <span className={cx(styles.badge, styles.status, STATUS_CLASS[status], styles[size], className)} title={REPAIR_STATUS_LABEL[status]}>
      <span className={cx(styles.dot, active && styles.pulse)} aria-hidden />
      {short ? SHORT_LABEL[status] : REPAIR_STATUS_LABEL[status]}
    </span>
  );
}

import type { ReactNode } from 'react';
import { cx } from './utils';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  /** Ícono principal (lucide), p. ej. <Users />. */
  icon: ReactNode;
  /** Ícono pequeño satélite (p. ej. <Plus /> o <Search />). */
  accent?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Acción principal (Button). */
  action?: ReactNode;
  secondaryAction?: ReactNode;
  tone?: 'brand' | 'income' | 'expense' | 'pending' | 'success' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Estado vacío ilustrado: ícono compuesto con anillos, título, descripción y acción. */
export function EmptyState({ icon, accent, title, description, action, secondaryAction, tone = 'brand', size = 'md', className }: EmptyStateProps) {
  return (
    <div className={cx(styles.empty, styles[size], styles[tone], className)}>
      <div className={styles.art} aria-hidden>
        <span className={styles.grid} />
        <span className={styles.ring3} />
        <span className={styles.ring2} />
        <span className={styles.ring1} />
        <span className={styles.tile}>
          <span className={styles.tileIcon}>{icon}</span>
        </span>
        {accent && <span className={styles.accent}>{accent}</span>}
        <span className={styles.spark1} />
        <span className={styles.spark2} />
      </div>
      <div className={styles.text}>
        <h3 className={styles.title}>{title}</h3>
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {(action || secondaryAction) && (
        <div className={styles.actions}>
          {secondaryAction}
          {action}
        </div>
      )}
    </div>
  );
}

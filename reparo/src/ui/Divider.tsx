import type { ReactNode } from 'react';
import { cx } from './utils';
import styles from './Divider.module.css';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  /** Texto centrado sobre la línea. */
  label?: ReactNode;
  className?: string;
  /** Margen vertical (horizontal) u horizontal (vertical) en px. */
  spacing?: number;
}

export function Divider({ orientation = 'horizontal', label, className, spacing }: DividerProps) {
  if (orientation === 'vertical') {
    return <span role="separator" aria-orientation="vertical" className={cx(styles.vertical, className)} style={spacing != null ? { marginInline: spacing } : undefined} />;
  }
  if (label) {
    return (
      <div role="separator" className={cx(styles.labeled, className)} style={spacing != null ? { marginBlock: spacing } : undefined}>
        <span>{label}</span>
      </div>
    );
  }
  return <hr className={cx(styles.horizontal, className)} style={spacing != null ? { marginBlock: spacing } : undefined} />;
}

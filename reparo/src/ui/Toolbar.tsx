import type { ReactNode } from 'react';
import { cx } from './utils';
import styles from './Toolbar.module.css';

export interface ToolbarProps {
  children: ReactNode;
  /** Se queda fija bajo la barra superior al hacer scroll. */
  sticky?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** Fila de controles (buscador, filtros, orden, acciones). Usa <ToolbarSpacer /> para empujar a la derecha. */
export function Toolbar({ children, sticky, className, 'aria-label': ariaLabel }: ToolbarProps) {
  return (
    <div role="toolbar" aria-label={ariaLabel} className={cx(styles.toolbar, sticky && styles.sticky, className)}>
      {children}
    </div>
  );
}

export function ToolbarSpacer() {
  return <span className={styles.spacer} aria-hidden />;
}

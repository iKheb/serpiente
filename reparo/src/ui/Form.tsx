import type { CSSProperties, ReactNode } from 'react';
import { cx } from './utils';
import styles from './Form.module.css';

export interface FormGridProps {
  children: ReactNode;
  /** Columnas en pantallas ≥ 520 px (en móvil siempre 1). Por defecto 2. */
  columns?: 1 | 2 | 3;
  className?: string;
}

/**
 * Rejilla de campos para formularios en Sheet. Un hijo con
 * `style={{ gridColumn: '1 / -1' }}` (o className "span-all") ocupa toda la fila.
 */
export function FormGrid({ children, columns = 2, className }: FormGridProps) {
  return <div className={cx(styles.grid, styles[`c${columns}`], className)}>{children}</div>;
}

export interface FormSectionProps {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Ancla (p. ej. para un índice de secciones). */
  id?: string;
}

/** Grupo con título dentro de un formulario (separado por línea del anterior). */
export function FormSection({ title, description, children, className, style, id }: FormSectionProps) {
  return (
    <div id={id} role="group" aria-label={typeof title === 'string' ? title : undefined} className={cx(styles.section, className)} style={style}>
      {title && <div className={styles.legend}>{title}</div>}
      {description && <p className={styles.description}>{description}</p>}
      <div className={styles.body}>{children}</div>
    </div>
  );
}

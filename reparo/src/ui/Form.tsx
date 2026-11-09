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
}

/** Grupo con título dentro de un formulario (separado por línea del anterior). */
export function FormSection({ title, description, children, className, style }: FormSectionProps) {
  return (
    <fieldset className={cx(styles.section, className)} style={style}>
      {title && <legend className={styles.legend}>{title}</legend>}
      {description && <p className={styles.description}>{description}</p>}
      <div className={styles.body}>{children}</div>
    </fieldset>
  );
}

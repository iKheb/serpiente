import type { ReactNode } from 'react';
import { cx } from './utils';
import styles from './Section.module.css';

export interface SectionProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Ícono a la izquierda del título. */
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
  /** Espacio entre encabezado y contenido. */
  gap?: 'sm' | 'md' | 'lg';
}

/** Bloque de página con título h2, descripción y acciones. Separación vertical estándar. */
export function Section({ title, description, actions, icon, children, className, id, gap = 'md' }: SectionProps) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={title ? headingId : undefined} className={cx(styles.section, styles[gap], className)}>
      {(title || actions) && (
        <div className={styles.head}>
          <div className={styles.text}>
            {title && (
              <h2 id={headingId} className={styles.title}>
                {icon && <span className={styles.icon}>{icon}</span>}
                {title}
              </h2>
            )}
            {description && <p className={styles.description}>{description}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

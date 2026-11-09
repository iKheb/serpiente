import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx } from './utils';
import styles from './PageHeader.module.css';

export interface Crumb {
  label: string;
  /** Ruta hash; el último normalmente sin href. */
  href?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Botones a la derecha (en móvil pasan debajo). */
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Enlace "volver" (móvil y detalle). */
  back?: { href: string; label: string };
  /** Contenido junto al título (badges, estado…). */
  meta?: ReactNode;
  /** Ícono/avatar a la izquierda del título. */
  leading?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** Encabezado de página: breadcrumbs, título con tracking negativo, subtítulo y acciones. */
export function PageHeader({ title, subtitle, actions, breadcrumbs, back, meta, leading, className, children }: PageHeaderProps) {
  return (
    <header className={cx(styles.header, className)}>
      {(breadcrumbs?.length || back) && (
        <nav aria-label="Ruta de navegación" className={styles.crumbs}>
          {back && (
            <a href={back.href} className={styles.back}>
              <ChevronLeft aria-hidden />
              {back.label}
            </a>
          )}
          {!back && breadcrumbs && (
            <ol>
              {breadcrumbs.map((c, i) => (
                <li key={i}>
                  {i > 0 && <ChevronRight className={styles.crumbSep} aria-hidden />}
                  {c.href && i < breadcrumbs.length - 1 ? (
                    <a href={c.href}>{c.label}</a>
                  ) : (
                    <span aria-current={i === breadcrumbs.length - 1 ? 'page' : undefined}>{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </nav>
      )}
      <div className={styles.row}>
        <div className={styles.titleBlock}>
          {leading && <div className={styles.leading}>{leading}</div>}
          <div className={styles.titleText}>
            <div className={styles.titleLine}>
              <h1 className={styles.title}>{title}</h1>
              {meta && <div className={styles.meta}>{meta}</div>}
            </div>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {children}
    </header>
  );
}

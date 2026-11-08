import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from './utils';
import styles from './Card.module.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  /** Ícono junto al título. */
  icon?: ReactNode;
  /** Acciones a la derecha del encabezado. */
  actions?: ReactNode;
  /** Pie de la tarjeta (separado por un borde). */
  footer?: ReactNode;
  variant?: 'default' | 'glass' | 'outline' | 'inset';
  /** Hover elevado + borde luminoso; usar con onClick o href. */
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Si se pasa, la tarjeta es un enlace (ruta hash). */
  href?: string;
  /** Sin el brillo superior de 1px. */
  flat?: boolean;
  as?: 'div' | 'section' | 'article' | 'li';
}

/** Tarjeta base: superficie con borde 1px, brillo superior y encabezado opcional. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { title, description, icon, actions, footer, variant = 'default', interactive, padding = 'md', href, flat, as = 'div', className, children, onClick, ...rest },
  ref,
) {
  const cls = cx(
    styles.card,
    styles[variant],
    styles[`pad-${padding}`],
    (interactive || href || onClick) && styles.interactive,
    flat && styles.flat,
    className,
  );
  const header = (title || actions || description) && (
    <div className={styles.header}>
      <div className={styles.headText}>
        {title && (
          <h3 className={styles.title}>
            {icon && <span className={styles.icon}>{icon}</span>}
            {title}
          </h3>
        )}
        {description && <p className={styles.description}>{description}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
  const body = (
    <>
      {header}
      {children}
      {footer && <div className={styles.footer}>{footer}</div>}
    </>
  );
  if (href) {
    return (
      <a href={href} className={cls} onClick={onClick as unknown as React.MouseEventHandler<HTMLAnchorElement>} {...(rest as HTMLAttributes<HTMLAnchorElement>)}>
        {body}
      </a>
    );
  }
  const Tag = as as 'div';
  return (
    <Tag
      ref={ref as never}
      className={cls}
      onClick={onClick}
      role={onClick && !rest.role ? 'button' : rest.role}
      tabIndex={onClick && rest.tabIndex === undefined ? 0 : rest.tabIndex}
      onKeyDown={
        onClick
          ? (e: React.KeyboardEvent<HTMLDivElement>) => {
              rest.onKeyDown?.(e);
              if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                e.preventDefault();
                (e.currentTarget as HTMLElement).click();
              }
            }
          : rest.onKeyDown
      }
      {...rest}
    >
      {body}
    </Tag>
  );
});

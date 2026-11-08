import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Spinner } from './Spinner';
import { Tooltip } from './Tooltip';
import { cx } from './utils';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger' | 'danger-ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: styles.primary,
  secondary: styles.secondary,
  ghost: styles.ghost,
  subtle: styles.subtle,
  danger: styles.danger,
  'danger-ghost': styles.dangerGhost,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, iconLeft, iconRight, fullWidth, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(styles.button, styles[size], variantClass[variant], fullWidth && styles.fullWidth, loading && styles.loading, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {iconLeft && <span className={styles.icon} aria-hidden>{iconLeft}</span>}
      {children != null && children !== false && <span className={styles.label}>{children}</span>}
      {iconRight && <span className={styles.icon} aria-hidden>{iconRight}</span>}
      {loading && (
        <span className={styles.spinner}>
          <Spinner size={size === 'lg' ? 18 : size === 'sm' ? 13 : 15} />
        </span>
      )}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Ícono (lucide) a mostrar. */
  icon: ReactNode;
  /** Obligatorio: nombre accesible y texto del tooltip. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Muestra el tooltip con la etiqueta (por defecto true). */
  tooltip?: boolean;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  /** Atajo mostrado en el tooltip. */
  shortcut?: string | string[];
  /** Contador en esquina (p. ej. notificaciones sin leer). 0 lo oculta. */
  badge?: number;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', loading, tooltip = true, tooltipSide = 'bottom', shortcut, badge, className, disabled, type = 'button', ...rest },
  ref,
) {
  const btn = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={cx(styles.button, styles[size], styles.iconOnly, variantClass[variant], loading && styles.loading, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <span className={styles.icon} aria-hidden>
        {icon}
      </span>
      {loading && (
        <span className={styles.spinner}>
          <Spinner size={14} />
        </span>
      )}
      {badge != null && badge > 0 && (
        <span className={styles.badgeDot} aria-hidden>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
  if (!tooltip) return btn;
  return (
    <Tooltip content={label} side={tooltipSide} shortcut={shortcut}>
      {btn}
    </Tooltip>
  );
});

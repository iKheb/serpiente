import { cx } from './utils';
import styles from './Spinner.module.css';

export interface SpinnerProps {
  /** Diámetro en px (por defecto 16). */
  size?: number;
  className?: string;
  /** Texto para lectores de pantalla. */
  label?: string;
}

export function Spinner({ size = 16, className, label = 'Cargando' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cx(styles.spinner, className)}
      style={{ width: size, height: size, borderWidth: size >= 24 ? 2 : 1.75 }}
    />
  );
}

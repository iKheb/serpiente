import { useId, type ReactNode } from 'react';
import { cx } from './utils';
import styles from './Switch.module.css';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
  id?: string;
  className?: string;
  'aria-label'?: string;
}

/** Interruptor (role="switch"). Con `label` se renderiza como fila clicable. */
export function Switch({ checked, onChange, label, description, disabled, size = 'md', id: idProp, className, 'aria-label': ariaLabel }: SwitchProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const control = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel}
      aria-labelledby={label ? `${id}-label` : undefined}
      aria-describedby={description ? `${id}-desc` : undefined}
      disabled={disabled}
      className={cx(styles.track, styles[size], checked && styles.on, !label && className)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.thumb} />
    </button>
  );
  if (!label) return control;
  return (
    <div className={cx(styles.row, disabled && styles.disabled, className)}>
      <label htmlFor={id} className={styles.text}>
        <span id={`${id}-label`} className={styles.label}>
          {label}
        </span>
        {description && (
          <span id={`${id}-desc`} className={styles.description}>
            {description}
          </span>
        )}
      </label>
      {control}
    </div>
  );
}

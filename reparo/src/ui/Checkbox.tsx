import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import { cx } from './utils';
import styles from './Checkbox.module.css';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  indeterminate?: boolean;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

/** Casilla de verificación con estado indeterminado. */
export function Checkbox({ checked, onChange, indeterminate, label, description, disabled, id: idProp, className, 'aria-label': ariaLabel }: CheckboxProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <label className={cx(styles.root, disabled && styles.disabled, className)} htmlFor={id}>
      <span className={styles.boxWrap}>
        <input
          ref={ref}
          id={id}
          type="checkbox"
          className={styles.input}
          checked={checked}
          disabled={disabled}
          aria-label={label ? undefined : ariaLabel}
          aria-describedby={description ? `${id}-desc` : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className={cx(styles.box, (checked || indeterminate) && styles.checked)} aria-hidden>
          {indeterminate ? <Minus /> : <Check />}
        </span>
      </span>
      {(label || description) && (
        <span className={styles.text}>
          {label && <span className={styles.label}>{label}</span>}
          {description && (
            <span id={`${id}-desc`} className={styles.description}>
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
}

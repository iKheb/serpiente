import { useEffect, useId, useState, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Field, fieldStyles as fs } from './Field';
import { clamp, cx } from './utils';
import styles from './NumberStepper.module.css';

export interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** Unidad mostrada tras el número (p. ej. "uds", "días"). */
  unit?: string;
  size?: 'sm' | 'md' | 'lg';
  id?: string;
  containerClassName?: string;
  /** Ocupa todo el ancho disponible. */
  fullWidth?: boolean;
}

/** Entero con botones − / +, flechas del teclado y edición directa. */
export function NumberStepper({ value, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, step = 1, label, hint, error, optional, required, disabled, unit, size = 'md', id: idProp, containerClassName, fullWidth }: NumberStepperProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  const set = (n: number) => {
    const v = clamp(Math.round(n), min, max);
    setText(String(v));
    if (v !== value) onChange(v);
  };

  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required} htmlFor={id} hintId={hintId} errorId={errorId} className={containerClassName}>
      <div className={cx(fs.control, fs[size], styles.stepper, fullWidth && styles.full, error ? fs.invalid : undefined, disabled && fs.disabled)}>
        <button type="button" className={styles.btn} aria-label="Disminuir" tabIndex={-1} disabled={disabled || value <= min} onClick={() => set(value - step)}>
          <Minus />
        </button>
        <div className={styles.center}>
          <input
            id={id}
            type="text"
            inputMode="numeric"
            role="spinbutton"
            aria-valuemin={min}
            aria-valuemax={max === Number.MAX_SAFE_INTEGER ? undefined : max}
            aria-valuenow={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={cx(errorId, hintId) || undefined}
            disabled={disabled}
            className={cx(fs.input, fs.numeric, styles.input)}
            value={text}
            size={Math.max(2, text.length + 1)}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d-]/g, '');
              setText(raw);
              const n = parseInt(raw, 10);
              if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
            }}
            onBlur={() => {
              const n = parseInt(text, 10);
              set(Number.isFinite(n) ? n : min);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                set(value + (e.shiftKey ? step * 10 : step));
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                set(value - (e.shiftKey ? step * 10 : step));
              } else if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          {unit && <span className={styles.unit}>{unit}</span>}
        </div>
        <button type="button" className={styles.btn} aria-label="Aumentar" tabIndex={-1} disabled={disabled || value >= max} onClick={() => set(value + step)}>
          <Plus />
        </button>
      </div>
    </Field>
  );
}

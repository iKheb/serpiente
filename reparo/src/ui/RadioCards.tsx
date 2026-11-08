import { useId, useRef, type ReactNode } from 'react';
import { cx } from './utils';
import styles from './RadioCards.module.css';

export interface RadioCardOption<V extends string = string> {
  value: V;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface RadioCardsProps<V extends string = string> {
  value: V | null;
  onChange: (value: V) => void;
  options: readonly RadioCardOption<V>[];
  /** Columnas en escritorio (por defecto auto-ajuste). */
  columns?: 1 | 2 | 3 | 4;
  label?: ReactNode;
  'aria-label'?: string;
  className?: string;
  size?: 'sm' | 'md';
}

/** Opciones en tarjetas seleccionables (radiogroup con flechas). */
export function RadioCards<V extends string = string>({ value, onChange, options, columns, label, className, size = 'md', 'aria-label': ariaLabel }: RadioCardsProps<V>) {
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
    let pos = enabled.indexOf(idx);
    pos = (pos + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length;
    const next = enabled[pos];
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className={cx(styles.wrap, className)}>
      {label && (
        <span id={`${id}-label`} className={styles.groupLabel}>
          {label}
        </span>
      )}
      <div
        role="radiogroup"
        aria-labelledby={label ? `${id}-label` : undefined}
        aria-label={label ? undefined : ariaLabel}
        className={cx(styles.grid, size === 'sm' && styles.sm)}
        style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
        onKeyDown={onKeyDown}
      >
        {options.map((o, i) => {
          const checked = o.value === value;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked || (idx === -1 && i === 0) ? 0 : -1}
              disabled={o.disabled}
              className={cx(styles.card, checked && styles.checked)}
              onClick={() => onChange(o.value)}
            >
              {o.icon && <span className={styles.icon}>{o.icon}</span>}
              <span className={styles.body}>
                <span className={styles.label}>{o.label}</span>
                {o.description && <span className={styles.description}>{o.description}</span>}
              </span>
              <span className={styles.radio} aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}

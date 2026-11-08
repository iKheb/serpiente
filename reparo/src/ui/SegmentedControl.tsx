import { useId, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cx } from './utils';
import styles from './SegmentedControl.module.css';

export interface SegmentOption<V extends string = string> {
  value: V;
  label: ReactNode;
  icon?: ReactNode;
  /** Etiqueta accesible si `label` no es texto. */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<V extends string = string> {
  value: V;
  onChange: (value: V) => void;
  options: readonly SegmentOption<V>[];
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  'aria-label'?: string;
  className?: string;
}

/** Control segmentado con pastilla animada (radiogroup, flechas para cambiar). */
export function SegmentedControl<V extends string = string>({ value, onChange, options, size = 'md', fullWidth, className, 'aria-label': ariaLabel }: SegmentedControlProps<V>) {
  const layoutId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
    let pos = enabled.indexOf(idx);
    if (e.key === 'Home') pos = 0;
    else if (e.key === 'End') pos = enabled.length - 1;
    else pos = (pos + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + enabled.length) % enabled.length;
    const next = enabled[pos];
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx(styles.root, styles[size], fullWidth && styles.full, className)} onKeyDown={onKeyDown}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            tabIndex={active || (idx === -1 && i === 0) ? 0 : -1}
            disabled={o.disabled}
            className={cx(styles.item, active && styles.active)}
            onClick={() => onChange(o.value)}
          >
            {active && <motion.span layoutId={layoutId} className={styles.pill} transition={{ type: 'spring', bounce: 0.18, duration: 0.38 }} />}
            {o.icon && <span className={styles.icon}>{o.icon}</span>}
            {o.label != null && o.label !== '' && <span className={styles.label}>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import { usePrefersReducedMotion } from './hooks';
import { clamp, cx } from './utils';
import styles from './ProgressBar.module.css';

export interface ProgressBarProps {
  /** Valor 0..max (por defecto max = 1). */
  value: number;
  max?: number;
  tone?: 'brand' | 'income' | 'expense' | 'profit' | 'pending' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'xs' | 'sm' | 'md';
  label?: ReactNode;
  /** Texto a la derecha de la etiqueta (p. ej. "62 %" o "$3,200 / $5,000"). */
  valueLabel?: ReactNode;
  className?: string;
  'aria-label'?: string;
}

/** Barra de progreso animada con tono semántico. */
export function ProgressBar({ value, max = 1, tone = 'brand', size = 'sm', label, valueLabel, className, 'aria-label': ariaLabel }: ProgressBarProps) {
  const reduced = usePrefersReducedMotion();
  const pct = max > 0 ? clamp(value / max, 0, 1) : 0;
  return (
    <div className={cx(styles.wrap, className)}>
      {(label || valueLabel) && (
        <div className={styles.head}>
          {label && <span className={styles.label}>{label}</span>}
          {valueLabel && <span className={styles.value}>{valueLabel}</span>}
        </div>
      )}
      <div
        className={cx(styles.track, styles[size], styles[tone])}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
      >
        <motion.div
          className={styles.fill}
          initial={reduced ? false : { scaleX: 0 }}
          animate={{ scaleX: pct }}
          transition={{ duration: reduced ? 0 : 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </div>
  );
}

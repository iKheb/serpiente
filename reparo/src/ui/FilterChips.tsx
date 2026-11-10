import { useEffect, useRef, type ReactNode } from 'react';
import { cx } from './utils';
import styles from './FilterChips.module.css';

export interface FilterChipOption<V extends string = string> {
  value: V;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
  /** Color del punto (variable CSS, p. ej. 'var(--status-listo)'). */
  dotColor?: string;
}

type Single<V extends string> = { multiple?: false; value: V; onChange: (value: V) => void };
type Multi<V extends string> = { multiple: true; value: V[]; onChange: (value: V[]) => void };

export type FilterChipsProps<V extends string = string> = (Single<V> | Multi<V>) & {
  options: readonly FilterChipOption<V>[];
  'aria-label'?: string;
  className?: string;
  size?: 'sm' | 'md';
};

/** Chips de filtro desplazables (selección única o múltiple) con conteos. */
export function FilterChips<V extends string = string>(props: FilterChipsProps<V>) {
  const { options, className, size = 'md', 'aria-label': ariaLabel } = props;
  const isOn = (v: V) => (props.multiple ? props.value.includes(v) : props.value === v);
  const toggle = (v: V) => {
    if (props.multiple) {
      const set = new Set(props.value);
      if (set.has(v)) set.delete(v);
      else set.add(v);
      props.onChange(options.map((o) => o.value).filter((x) => set.has(x)));
    } else props.onChange(v);
  };
  // Fila desplazable: el chip activo (p. ej. al llegar con ?estado=) siempre queda a la vista.
  const ref = useRef<HTMLDivElement>(null);
  const activeKey = props.multiple ? props.value[0] : props.value;
  useEffect(() => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const on = el.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!on) return;
    const left = on.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    if (left < el.scrollLeft || left + on.offsetWidth > el.scrollLeft + el.clientWidth - 48) el.scrollLeft = Math.max(0, left - 8);
  }, [activeKey]);
  return (
    <div ref={ref} role="group" aria-label={ariaLabel} className={cx(styles.chips, size === 'sm' && styles.sm, className)}>
      {options.map((o) => {
        const on = isOn(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on} className={cx(styles.chip, on && styles.on)} onClick={() => toggle(o.value)}>
            {o.dotColor && <span className={styles.dot} style={{ background: o.dotColor }} aria-hidden />}
            {o.icon && <span className={styles.icon}>{o.icon}</span>}
            <span>{o.label}</span>
            {o.count != null && <span className={styles.count}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

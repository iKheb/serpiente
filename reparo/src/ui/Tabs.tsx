import { useId, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cx } from './utils';
import styles from './Tabs.module.css';

export interface TabItem<V extends string = string> {
  value: V;
  label: ReactNode;
  icon?: ReactNode;
  /** Conteo opcional junto a la etiqueta. */
  count?: number;
  disabled?: boolean;
}

export interface TabsProps<V extends string = string> {
  value: V;
  onChange: (value: V) => void;
  items: readonly TabItem<V>[];
  'aria-label'?: string;
  className?: string;
  /** Prefijo de ids para enlazar paneles: `${idPrefix}-panel-${value}`. */
  idPrefix?: string;
}

/** Pestañas con subrayado animado. Usa `tabPanelProps` en el contenido. */
export function Tabs<V extends string = string>({ value, onChange, items, className, idPrefix, 'aria-label': ariaLabel }: TabsProps<V>) {
  const auto = useId();
  const prefix = idPrefix ?? auto;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = items.findIndex((t) => t.value === value);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const enabled = items.map((t, i) => (t.disabled ? -1 : i)).filter((i) => i >= 0);
    let pos = enabled.indexOf(idx);
    if (e.key === 'Home') pos = 0;
    else if (e.key === 'End') pos = enabled.length - 1;
    else pos = (pos + (e.key === 'ArrowLeft' ? -1 : 1) + enabled.length) % enabled.length;
    const next = enabled[pos];
    onChange(items[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className={cx(styles.list, className)} onKeyDown={onKeyDown}>
      {items.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${prefix}-tab-${t.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${prefix}-panel-${t.value}`}
            tabIndex={active ? 0 : -1}
            disabled={t.disabled}
            className={cx(styles.tab, active && styles.active)}
            onClick={() => onChange(t.value)}
          >
            {t.icon && <span className={styles.icon}>{t.icon}</span>}
            <span>{t.label}</span>
            {t.count != null && <span className={styles.count}>{t.count}</span>}
            {active && <motion.span layoutId={`${prefix}-ink`} className={styles.ink} transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }} />}
          </button>
        );
      })}
    </div>
  );
}

/** Props para el panel asociado a una pestaña. */
export function tabPanelProps(idPrefix: string, value: string) {
  return { id: `${idPrefix}-panel-${value}`, role: 'tabpanel' as const, 'aria-labelledby': `${idPrefix}-tab-${value}`, tabIndex: 0 };
}

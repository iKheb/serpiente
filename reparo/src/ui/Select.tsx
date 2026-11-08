import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Field, fieldStyles as fs } from './Field';
import { FloatingPanel, popoverStyles as ps } from './Popover';
import { cx, fold } from './utils';
import styles from './Select.module.css';

export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Contenido a la derecha (conteo, atajo…). */
  meta?: ReactNode;
}

export interface SelectProps<V extends string = string> {
  value: V | null | undefined;
  onChange: (value: V) => void;
  options: readonly SelectOption<V>[];
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  optional?: boolean;
  required?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  id?: string;
  containerClassName?: string;
  /** Ancho del disparador (por defecto 100 %). */
  width?: number | string;
  /** Ícono fijo a la izquierda del valor. */
  icon?: ReactNode;
  'aria-label'?: string;
}

/** Selector con listbox propio: teclado (↑ ↓ Inicio Fin, escribir para saltar), ARIA combobox. */
export function Select<V extends string = string>({
  value,
  onChange,
  options,
  label,
  hint,
  error,
  placeholder = 'Selecciona…',
  optional,
  required,
  disabled,
  size = 'md',
  id: idProp,
  containerClassName,
  width,
  icon,
  'aria-label': ariaLabel,
}: SelectProps<V>) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listId = `${id}-listbox`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typeahead = useRef({ text: '', at: 0 });
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const firstEnabled = (from: number, dir: 1 | -1) => {
    for (let i = from, n = 0; n < options.length; i += dir, n++) {
      const k = (i + options.length) % options.length;
      if (!options[k].disabled) return k;
    }
    return -1;
  };

  const openList = (at?: number) => {
    if (disabled) return;
    setOpen(true);
    setActive(at ?? (selectedIndex >= 0 ? selectedIndex : firstEnabled(0, 1)));
  };
  const close = (focus = true) => {
    setOpen(false);
    if (focus) triggerRef.current?.focus();
  };
  const choose = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    close();
  };

  useEffect(() => {
    if (!open || active < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const k = e.key;
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') {
        e.preventDefault();
        openList(k === 'ArrowUp' && selectedIndex < 0 ? firstEnabled(options.length - 1, -1) : undefined);
        return;
      }
    } else {
      if (k === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => firstEnabled(a + 1, 1));
        return;
      }
      if (k === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => firstEnabled(a - 1, -1));
        return;
      }
      if (k === 'Home') {
        e.preventDefault();
        setActive(firstEnabled(0, 1));
        return;
      }
      if (k === 'End') {
        e.preventDefault();
        setActive(firstEnabled(options.length - 1, -1));
        return;
      }
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        choose(active);
        return;
      }
      if (k === 'Tab') {
        setOpen(false);
        return;
      }
    }
    if (k.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      const t = typeahead.current;
      t.text = now - t.at > 700 ? k : t.text + k;
      t.at = now;
      const q = fold(t.text);
      const start = Math.max(open ? active : selectedIndex, 0);
      // Una sola letra busca a partir de la siguiente opción; varias, desde la actual.
      const offset = t.text.length > 1 ? 0 : 1;
      for (let n = 0; n < options.length; n++) {
        const j = (start + offset + n) % options.length;
        const o = options[j];
        if (!o.disabled && fold(o.label).startsWith(q)) {
          if (open) setActive(j);
          else onChange(o.value);
          break;
        }
      }
    }
  };

  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const labelId = label ? `${id}-label` : undefined;

  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required} labelAs="span" labelId={labelId} hintId={hintId} errorId={errorId} className={containerClassName}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-opt-${active}` : undefined}
        aria-labelledby={labelId ? `${labelId} ${id}` : undefined}
        aria-label={ariaLabel}
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(errorId, hintId) || undefined}
        disabled={disabled}
        className={cx(fs.control, fs[size], styles.trigger, error ? fs.invalid : undefined, disabled && fs.disabled, open && styles.open)}
        style={{ width }}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
      >
        {(icon || selected?.icon) && <span className={fs.adornment}>{selected?.icon ?? icon}</span>}
        <span className={cx(styles.value, !selected && styles.placeholder)}>{selected ? selected.label : placeholder}</span>
        <ChevronsUpDown className={styles.chevron} aria-hidden />
      </button>
      <FloatingPanel open={open} onClose={() => close()} onOutside={() => close(false)} anchorRef={triggerRef} matchWidth maxHeight={320}>
        <div ref={listRef} id={listId} role="listbox" aria-labelledby={labelId} className={ps.list} tabIndex={-1}>
          {options.map((o, i) => (
            <div
              key={o.value}
              id={`${id}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              data-active={i === active}
              className={ps.option}
              onPointerMove={() => !o.disabled && active !== i && setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              {o.icon && <span className={ps.optionIcon}>{o.icon}</span>}
              <span className={ps.optionBody}>
                <span className={ps.optionLabel}>{o.label}</span>
                {o.description && <span className={ps.optionDesc}>{o.description}</span>}
              </span>
              {o.meta && <span className={ps.optionMeta}>{o.meta}</span>}
              {o.value === value ? <Check className={ps.check} aria-hidden /> : <span className={styles.checkSpace} aria-hidden />}
            </div>
          ))}
        </div>
      </FloatingPanel>
    </Field>
  );
}

import { forwardRef, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { CornerDownLeft, X } from 'lucide-react';
import { Field, fieldStyles as fs } from './Field';
import { FloatingPanel, popoverStyles as ps } from './Popover';
import { Highlight } from './Highlight';
import { cx, fold, mergeRefs } from './utils';

export interface ComboboxOption {
  /** Texto que se escribe en el campo al elegirla. */
  value: string;
  /** Clave opaca (p. ej. id de cliente) que recibe `onSelect`. */
  id?: string;
  description?: string;
  icon?: ReactNode;
  /** Texto extra para buscar (teléfono, IMEI…), no se muestra. */
  keywords?: string;
  meta?: ReactNode;
}

export interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  /** Sugerencias: cadenas u objetos. */
  options: readonly (string | ComboboxOption)[];
  /** Se llama al elegir una sugerencia (además de onChange). */
  onSelect?: (option: ComboboxOption) => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  optional?: boolean;
  required?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Máximo de sugerencias visibles (por defecto 8). */
  maxResults?: number;
  /** Texto cuando no hay coincidencias (por defecto se ofrece usar el texto libre). */
  emptyText?: string;
  /** Muestra sugerencias al enfocar aunque el campo esté vacío (por defecto true). */
  openOnFocus?: boolean;
  prefix?: ReactNode;
  id?: string;
  name?: string;
  autoFocus?: boolean;
  containerClassName?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  labelAside?: ReactNode;
  onBlur?: () => void;
}

function toOption(o: string | ComboboxOption): ComboboxOption {
  return typeof o === 'string' ? { value: o } : o;
}

/**
 * Texto libre con sugerencias filtradas sin acentos (marca, modelo, cliente,
 * proveedor…). ↑ ↓ para recorrer, Enter para elegir, Escape para cerrar.
 */
export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  {
    value,
    onChange,
    options,
    onSelect,
    label,
    hint,
    error,
    placeholder,
    optional,
    required,
    disabled,
    size = 'md',
    maxResults = 8,
    emptyText,
    openOnFocus = true,
    prefix,
    id: idProp,
    name,
    autoFocus,
    containerClassName,
    inputMode,
    labelAside,
    onBlur,
  },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const listId = `${id}-listbox`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState<string | null>(null); // null = mostrar todas (recién enfocado)

  const all = useMemo(() => options.map(toOption), [options]);
  const results = useMemo(() => {
    const q = fold((query ?? '').trim());
    if (!q) return all.slice(0, maxResults);
    const terms = q.split(/\s+/);
    const scored: { o: ComboboxOption; score: number }[] = [];
    for (const o of all) {
      const hay = fold(`${o.value} ${o.description ?? ''} ${o.keywords ?? ''}`);
      if (!terms.every((t) => hay.includes(t))) continue;
      const v = fold(o.value);
      const score = v === q ? 0 : v.startsWith(q) ? 1 : v.includes(q) ? 2 : 3;
      scored.push({ o, score });
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, maxResults).map((s) => s.o);
  }, [all, query, maxResults]);

  const exact = results.some((o) => fold(o.value) === fold(value.trim()));
  const showPanel = open && !disabled && (results.length > 0 || (!!value.trim() && !exact && !!emptyText) || (!!value.trim() && results.length === 0));

  useEffect(() => {
    if (!showPanel || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, showPanel]);

  const choose = (o: ComboboxOption) => {
    onChange(o.value);
    onSelect?.(o);
    setOpen(false);
    setActive(-1);
    setQuery(null);
  };

  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required} htmlFor={id} hintId={hintId} errorId={errorId} labelAside={labelAside} className={containerClassName}>
      <div ref={controlRef} className={cx(fs.control, fs[size], error ? fs.invalid : undefined, disabled && fs.disabled)}>
        {prefix && <span className={fs.adornment}>{prefix}</span>}
        <input
          ref={mergeRefs(ref, inputRef)}
          id={id}
          name={name}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls={showPanel ? listId : undefined}
          aria-activedescendant={showPanel && active >= 0 ? `${id}-opt-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={cx(errorId, hintId) || undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={autoFocus}
          inputMode={inputMode}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className={fs.input}
          value={value}
          onFocus={() => {
            if (openOnFocus) {
              setQuery(null);
              setOpen(true);
            }
          }}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
            onBlur?.();
          }}
          onChange={(e) => {
            onChange(e.target.value);
            setQuery(e.target.value);
            setOpen(true);
            setActive(e.target.value.trim() ? 0 : -1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (!open) {
                setOpen(true);
                setActive(0);
              } else setActive((a) => (results.length ? (a + 1) % results.length : -1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (results.length ? (a <= 0 ? results.length - 1 : a - 1) : -1));
            } else if (e.key === 'Enter') {
              if (showPanel && active >= 0 && results[active]) {
                e.preventDefault();
                choose(results[active]);
              } else if (showPanel) {
                setOpen(false);
              }
            } else if (e.key === 'Tab') {
              setOpen(false);
            }
          }}
        />
        {value && !disabled && (
          <button
            type="button"
            className={fs.clear}
            aria-label="Limpiar"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange('');
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <X />
          </button>
        )}
      </div>
      <FloatingPanel open={showPanel} onClose={() => setOpen(false)} anchorRef={controlRef} matchWidth maxHeight={300}>
        <div ref={listRef} id={listId} role="listbox" className={ps.list}>
          {results.map((o, i) => (
            <div
              key={(o.id ?? '') + o.value + i}
              id={`${id}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              data-active={i === active}
              className={ps.option}
              onPointerMove={() => active !== i && setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
            >
              {o.icon && <span className={ps.optionIcon}>{o.icon}</span>}
              <span className={ps.optionBody}>
                <span className={ps.optionLabel}>
                  <Highlight text={o.value} query={query ?? ''} className={ps.mark} />
                </span>
                {o.description && (
                  <span className={ps.optionDesc}>
                    <Highlight text={o.description} query={query ?? ''} className={ps.mark} />
                  </span>
                )}
              </span>
              {o.meta && <span className={ps.optionMeta}>{o.meta}</span>}
            </div>
          ))}
          {results.length === 0 && value.trim() && (
            <div className={cx(ps.empty, ps.freeHint)} role="presentation">
              <CornerDownLeft size={14} aria-hidden />
              <span>{emptyText ?? `Se usará «${value.trim()}»`}</span>
            </div>
          )}
        </div>
      </FloatingPanel>
    </Field>
  );
});

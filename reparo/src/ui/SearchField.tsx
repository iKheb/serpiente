import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';
import { fieldStyles as fs } from './Field';
import { Kbd } from './Kbd';
import { registerSlashTarget } from './slashTarget';
import { cx, mergeRefs } from './utils';
import styles from './SearchField.module.css';

export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
  /** Responde al atajo "/" (por defecto true). */
  shortcut?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Ancho completo del contenedor. */
  fullWidth?: boolean;
  /** Etiqueta accesible (por defecto el placeholder). */
  label?: string;
  containerClassName?: string;
}

/** Buscador de página con ícono, botón limpiar y atajo "/". Escape limpia. */
export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, onChange, shortcut = true, size = 'md', fullWidth, placeholder = 'Buscar…', label, className, containerClassName, onKeyDown, onFocus, onBlur, ...rest },
  ref,
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!shortcut || !inputRef.current) return;
    return registerSlashTarget(inputRef.current);
  }, [shortcut]);

  return (
    <div
      className={cx(fs.control, fs[size], styles.search, fullWidth && styles.full, containerClassName)}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }}
    >
      <span className={fs.adornment}>
        <Search />
      </span>
      <input
        ref={mergeRefs(ref, inputRef)}
        type="search"
        role="searchbox"
        aria-label={label ?? placeholder}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        data-ui-escape-local={value ? 'true' : undefined}
        className={cx(fs.input, className)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            e.stopPropagation();
            onChange('');
          } else if (e.key === 'Escape') {
            inputRef.current?.blur();
          }
          onKeyDown?.(e);
        }}
        {...rest}
      />
      {value ? (
        <button
          type="button"
          className={fs.clear}
          aria-label="Limpiar búsqueda"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
        >
          <X />
        </button>
      ) : (
        shortcut &&
        !focused && (
          <span className={styles.hintKey} aria-hidden>
            <Kbd size="sm">/</Kbd>
          </span>
        )
      )}
    </div>
  );
});

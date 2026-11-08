import { forwardRef, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { formatMoney, parseMoneyToCents } from '@/data';
import { Field, fieldStyles as fs } from './Field';
import { cx } from './utils';
import styles from './MoneyInput.module.css';

export interface MoneyInputProps {
  /** Valor en centavos enteros. */
  value: number;
  onChange: (cents: number) => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Código ISO (por defecto la moneda de los ajustes). */
  currency?: string;
  /** Mínimo en centavos (por defecto 0). */
  min?: number;
  /** Máximo en centavos. */
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  id?: string;
  name?: string;
  autoFocus?: boolean;
  containerClassName?: string;
  /** Contenido a la derecha (p. ej. botón "Total"). */
  suffix?: ReactNode;
  labelAside?: ReactNode;
  onBlur?: () => void;
}

/** Extrae el símbolo de moneda del formato actual: "$1,250.00" → "$", "1.250,00 €" → "€". */
function currencySymbol(currency?: string): { symbol: string; after: boolean } {
  const sample = formatMoney(0, currency ? { currency } : undefined);
  const symbol = sample.replace(/[\d.,\s  -]/g, '').trim() || '$';
  const after = /\d/.test(sample.charAt(0)) || sample.trim().indexOf(symbol) > 0;
  return { symbol, after };
}

/** Texto numérico sin símbolo: 125050 → "1,250.50". */
function displayNumber(cents: number, currency?: string): string {
  const s = formatMoney(cents, currency ? { currency } : undefined);
  const { symbol } = currencySymbol(currency);
  return s.replace(symbol, '').replace(/[\s  ]+/g, ' ').trim();
}

/**
 * Campo de dinero. Guarda centavos; mientras se edita acepta "1250.5",
 * "1.250,50" o "1,250.50" y al salir lo formatea con la moneda de los ajustes.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, label, hint, error, optional, required, disabled, placeholder = '0.00', currency, min = 0, max, size = 'md', id: idProp, name, autoFocus, containerClassName, suffix, labelAside, onBlur },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const { symbol, after } = useMemo(() => currencySymbol(currency), [currency]);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => (value ? displayNumber(value, currency) : ''));

  // Sincroniza el texto cuando el valor cambia desde fuera (y no se está editando).
  useEffect(() => {
    if (!focused) setText(value ? displayNumber(value, currency) : '');
  }, [value, currency, focused]);

  const commit = (raw: string) => {
    let cents = raw.trim() ? parseMoneyToCents(raw) : 0;
    if (!Number.isFinite(cents)) cents = 0;
    cents = Math.round(cents);
    if (cents < min) cents = min;
    if (max != null && cents > max) cents = max;
    return cents;
  };

  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required} htmlFor={id} hintId={hintId} errorId={errorId} labelAside={labelAside} className={containerClassName}>
      <div className={cx(fs.control, fs[size], error ? fs.invalid : undefined, disabled && fs.disabled)}>
        {!after && <span className={cx(fs.adornment, styles.symbol)}>{symbol}</span>}
        <input
          ref={ref}
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={cx(errorId, hintId) || undefined}
          className={cx(fs.input, fs.numeric, styles.input)}
          value={text}
          onFocus={(e) => {
            setFocused(true);
            requestAnimationFrame(() => e.target.select());
          }}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.,\s-]/g, '');
            setText(raw);
            onChange(commit(raw));
          }}
          onBlur={() => {
            setFocused(false);
            const cents = commit(text);
            setText(cents ? displayNumber(cents, currency) : '');
            if (cents !== value) onChange(cents);
            onBlur?.();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        {after && <span className={cx(fs.adornment, styles.symbol)}>{symbol}</span>}
        {suffix && <span className={fs.adornment}>{suffix}</span>}
      </div>
    </Field>
  );
});

import { forwardRef, useId, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Field, fieldStyles as fs } from './Field';
import { cx, mergeRefs } from './utils';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  /** Contenido dentro del campo, a la izquierda (ícono o texto). */
  prefix?: ReactNode;
  /** Contenido dentro del campo, a la derecha (ícono, unidad, botón). */
  suffix?: ReactNode;
  /** Muestra un botón para limpiar cuando hay texto. */
  clearable?: boolean;
  onClear?: () => void;
  /** Atajo: recibe directamente el texto. */
  onValueChange?: (value: string) => void;
  size?: 'sm' | 'md' | 'lg';
  /** Clase del contenedor externo (Field). */
  containerClassName?: string;
  /** Clase de la caja del control. */
  controlClassName?: string;
  labelAside?: ReactNode;
  numeric?: boolean;
}

/** Cambia el valor de un input nativo y dispara onChange de React. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    optional,
    prefix,
    suffix,
    clearable,
    onClear,
    onValueChange,
    onChange,
    size = 'md',
    id: idProp,
    className,
    containerClassName,
    controlClassName,
    labelAside,
    numeric,
    disabled,
    required,
    value,
    defaultValue,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const hasValue = value !== undefined ? String(value).length > 0 : undefined;

  const control = (
    <div
      className={cx(fs.control, fs[size], error ? fs.invalid : undefined, disabled && fs.disabled, controlClassName)}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }}
    >
      {prefix && <span className={fs.adornment}>{prefix}</span>}
      <input
        ref={mergeRefs(ref, inputRef)}
        id={id}
        className={cx(fs.input, numeric && fs.numeric, className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(errorId, hintId) || undefined}
        disabled={disabled}
        required={required}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => {
          onChange?.(e);
          onValueChange?.(e.target.value);
        }}
        {...rest}
      />
      {clearable && (hasValue ?? true) && !disabled && (
        <button
          type="button"
          className={fs.clear}
          aria-label="Limpiar"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const el = inputRef.current;
            if (el) setNativeValue(el, '');
            onClear?.();
            el?.focus();
          }}
        >
          <X />
        </button>
      )}
      {suffix && <span className={fs.adornment}>{suffix}</span>}
    </div>
  );

  if (!label && !hint && !error && !labelAside) return <div className={containerClassName}>{control}</div>;
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      required={required}
      htmlFor={id}
      hintId={hintId}
      errorId={errorId}
      labelAside={labelAside}
      className={containerClassName}
    >
      {control}
    </Field>
  );
});

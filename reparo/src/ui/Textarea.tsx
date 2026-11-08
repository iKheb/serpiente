import { forwardRef, useCallback, useEffect, useId, useRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Field, fieldStyles as fs } from './Field';
import { cx, mergeRefs } from './utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  /** Filas mínimas visibles (por defecto 3). */
  minRows?: number;
  /** Filas máximas antes de mostrar scroll (por defecto 12). */
  maxRows?: number;
  /** Muestra el contador de caracteres (requiere maxLength). */
  showCount?: boolean;
  onValueChange?: (value: string) => void;
  containerClassName?: string;
}

/** Área de texto que crece con el contenido. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, optional, minRows = 3, maxRows = 12, showCount, onValueChange, onChange, id: idProp, className, containerClassName, disabled, required, maxLength, value, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const elRef = useRef<HTMLTextAreaElement | null>(null);

  const resize = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 21;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    el.style.height = 'auto';
    const min = minRows * line + pad;
    const max = maxRows * line + pad;
    const h = Math.min(max, Math.max(min, el.scrollHeight));
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [minRows, maxRows]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const len = typeof value === 'string' ? value.length : 0;

  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required} htmlFor={id} hintId={hintId} errorId={errorId} className={containerClassName}>
      <div className={cx(fs.control, error ? fs.invalid : undefined, disabled && fs.disabled)} style={{ alignItems: 'stretch' }}>
        <textarea
          ref={mergeRefs(ref, elRef)}
          id={id}
          rows={minRows}
          className={cx(fs.textarea, className)}
          aria-invalid={error ? true : undefined}
          aria-describedby={cx(errorId, hintId) || undefined}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
          value={value}
          onChange={(e) => {
            onChange?.(e);
            onValueChange?.(e.target.value);
            resize();
          }}
          style={{ paddingBottom: showCount && maxLength ? 22 : undefined }}
          {...rest}
        />
        {showCount && maxLength && (
          <span className={fs.counter} aria-hidden>
            {len}/{maxLength}
          </span>
        )}
      </div>
    </Field>
  );
});

import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { cx } from './utils';
import styles from './Field.module.css';

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Muestra "Opcional" junto a la etiqueta. */
  optional?: boolean;
  /** id del control (para asociar la etiqueta). */
  htmlFor?: string;
  /** Contenido a la derecha de la etiqueta (p. ej. un enlace o contador). */
  labelAside?: ReactNode;
  className?: string;
  children: ReactNode;
  hintId?: string;
  errorId?: string;
  /** Usa <span> en vez de <label> (controles que no son inputs nativos). */
  labelAs?: 'label' | 'span';
  labelId?: string;
}

/** Envoltorio de campo: etiqueta + control + ayuda/error. */
export function Field({ label, hint, error, required, optional, htmlFor, labelAside, className, children, hintId, errorId, labelAs = 'label', labelId }: FieldProps) {
  const LabelTag = labelAs;
  return (
    <div className={cx(styles.field, className)}>
      {(label || labelAside) && (
        <div className={styles.labelRow}>
          {label && (
            <LabelTag className={styles.label} htmlFor={labelAs === 'label' ? htmlFor : undefined} id={labelId}>
              {label}
              {required && <span className={styles.required} aria-hidden>*</span>}
              {optional && <span className={styles.optional}> · Opcional</span>}
            </LabelTag>
          )}
          {labelAside}
        </div>
      )}
      {children}
      {error ? (
        <p className={styles.error} id={errorId} role="alert">
          <CircleAlert />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className={styles.hint} id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export { styles as fieldStyles };

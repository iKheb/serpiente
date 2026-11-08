import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CalendarClock, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from './Button';
import { Calendar } from './Calendar';
import { Field, fieldStyles as fs } from './Field';
import { FloatingPanel } from './Popover';
import { clamp, cx } from './utils';
import styles from './DateTimeInput.module.css';

export interface DateTimeInputProps {
  /** Epoch en ms (o null si está vacío). */
  value: number | null;
  onChange: (ts: number) => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** Muestra y edita la hora (por defecto true). */
  withTime?: boolean;
  /** 1 = lunes (por defecto), 0 = domingo. */
  weekStartsOn?: 0 | 1;
  min?: number;
  max?: number;
  placeholder?: string;
  size?: 'sm' | 'md' | 'lg';
  id?: string;
  containerClassName?: string;
  /** Muestra el botón "Ahora" dentro del campo (por defecto true). */
  nowButton?: boolean;
}

/** Texto del control: "sáb 7 nov 2026 · 14:32". */
export function formatDateTimeLabel(ts: number, withTime = true): string {
  return format(ts, withTime ? 'EEE d MMM yyyy · HH:mm' : 'EEEE d MMM yyyy', { locale: es });
}

function TimeSegment({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  const [text, setText] = useState(String(value).padStart(2, '0'));
  useEffect(() => setText(String(value).padStart(2, '0')), [value]);
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      role="spinbutton"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className={styles.segment}
      value={text}
      maxLength={2}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
        setText(raw);
        const n = parseInt(raw, 10);
        if (Number.isFinite(n) && n <= max) onChange(n);
      }}
      onBlur={() => {
        const n = parseInt(text, 10);
        onChange(Number.isFinite(n) ? clamp(n, 0, max) : value);
        setText(String(Number.isFinite(n) ? clamp(n, 0, max) : value).padStart(2, '0'));
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const d = e.key === 'ArrowUp' ? 1 : -1;
          onChange((value + d + max + 1) % (max + 1));
        }
      }}
    />
  );
}

/**
 * Fecha y hora en un solo control (valor epoch ms). Abre un calendario en
 * español con selector de hora y botón "Ahora".
 */
export function DateTimeInput({
  value,
  onChange,
  label,
  hint,
  error,
  optional,
  required,
  disabled,
  withTime = true,
  weekStartsOn = 1,
  min,
  max,
  placeholder = 'Elegir fecha',
  size = 'md',
  id: idProp,
  containerClassName,
  nowButton = true,
}: DateTimeInputProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const date = value != null ? new Date(value) : null;
  const hours = date?.getHours() ?? new Date().getHours();
  const minutes = date?.getMinutes() ?? new Date().getMinutes();

  const setDay = (d: Date) => {
    const next = new Date(d);
    next.setHours(hours, minutes, 0, 0);
    onChange(next.getTime());
    if (!withTime) close();
  };
  const setTime = (h: number, m: number) => {
    const next = date ? new Date(date) : new Date();
    next.setHours(h, m, 0, 0);
    onChange(next.getTime());
  };
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const now = () => {
    const d = new Date();
    d.setSeconds(0, 0);
    onChange(d.getTime());
  };

  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <Field label={label} hint={hint} error={error} optional={optional} required={required} htmlFor={id} hintId={hintId} errorId={errorId} className={containerClassName}>
      <div ref={controlRef} className={cx(fs.control, fs[size], styles.control, error ? fs.invalid : undefined, disabled && fs.disabled, open && styles.open)}>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          className={styles.trigger}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-invalid={error ? true : undefined}
          aria-describedby={cx(errorId, hintId) || undefined}
          onClick={() => setOpen((o) => !o)}
        >
          <CalendarClock className={styles.icon} aria-hidden />
          {date ? (
            <time dateTime={date.toISOString()} className={styles.value}>
              {formatDateTimeLabel(date.getTime(), withTime)}
            </time>
          ) : (
            <span className={styles.placeholder}>{placeholder}</span>
          )}
          <ChevronDown className={styles.chevron} aria-hidden />
        </button>
        {nowButton && !disabled && (
          <button type="button" className={styles.now} onClick={now}>
            Ahora
          </button>
        )}
      </div>
      <FloatingPanel
        open={open}
        onClose={close}
        onOutside={() => setOpen(false)}
        anchorRef={controlRef}
        width={300}
        role="dialog"
        aria-label="Elegir fecha y hora"
        className={styles.panel}
      >
        <Calendar value={value} onSelect={setDay} weekStartsOn={weekStartsOn} min={min} max={max} autoFocus />
        {withTime && (
          <div className={styles.timeRow}>
            <span className={styles.timeLabel}>Hora</span>
            <div className={styles.time}>
              <TimeSegment label="Hora" value={hours} max={23} onChange={(h) => setTime(h, minutes)} />
              <span className={styles.colon}>:</span>
              <TimeSegment label="Minutos" value={minutes} max={59} onChange={(m) => setTime(hours, m)} />
            </div>
          </div>
        )}
        <div className={styles.footer}>
          <Button size="sm" variant="ghost" onClick={now}>
            Ahora
          </Button>
          <Button size="sm" variant="primary" onClick={close}>
            Listo
          </Button>
        </div>
      </FloatingPanel>
    </Field>
  );
}

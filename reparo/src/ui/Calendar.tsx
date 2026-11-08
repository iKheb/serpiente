import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { cx } from './utils';
import styles from './Calendar.module.css';

export interface CalendarProps {
  /** Día seleccionado (epoch ms) o null. */
  value: number | null;
  onSelect: (day: Date) => void;
  /** 1 = lunes (por defecto), 0 = domingo. */
  weekStartsOn?: 0 | 1;
  min?: number;
  max?: number;
  className?: string;
  autoFocus?: boolean;
}

/** Calendario mensual en español con navegación por teclado. */
export function Calendar({ value, onSelect, weekStartsOn = 1, min, max, className, autoFocus }: CalendarProps) {
  const selected = value != null ? new Date(value) : null;
  const [month, setMonth] = useState(() => startOfMonth(selected ?? new Date()));
  const [focusDay, setFocusDay] = useState<Date>(() => startOfDay(selected ?? new Date()));
  const gridRef = useRef<HTMLDivElement | null>(null);
  const today = new Date();

  const days = useMemo(() => {
    const start = startOfWeek(month, { weekStartsOn });
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [month, weekStartsOn]);

  const weekdays = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn });
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return { short: format(d, 'EEEEEE', { locale: es }), long: format(d, 'EEEE', { locale: es }) };
    });
  }, [weekStartsOn]);

  const disabled = (d: Date) => (min != null && d.getTime() < startOfDay(min).getTime()) || (max != null && d.getTime() > max);

  useEffect(() => {
    if (!autoFocus) return;
    const raf = requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(raf);
  }, [autoFocus]);

  const moveFocus = (d: Date) => {
    setFocusDay(d);
    if (!isSameMonth(d, month)) setMonth(startOfMonth(d));
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true }));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in map) {
      e.preventDefault();
      moveFocus(addDays(focusDay, map[e.key]));
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      moveFocus(addMonths(focusDay, e.key === 'PageUp' ? -1 : 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      moveFocus(startOfWeek(focusDay, { weekStartsOn }));
    } else if (e.key === 'End') {
      e.preventDefault();
      moveFocus(addDays(startOfWeek(focusDay, { weekStartsOn }), 6));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!disabled(focusDay)) onSelect(focusDay);
    }
  };

  const title = format(month, 'LLLL yyyy', { locale: es });

  return (
    <div className={cx(styles.calendar, className)}>
      <div className={styles.header}>
        <span className={styles.title} aria-live="polite">
          {title.charAt(0).toUpperCase() + title.slice(1)}
        </span>
        <div className={styles.navs}>
          <button type="button" className={styles.nav} aria-label="Mes anterior" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft />
          </button>
          <button type="button" className={styles.nav} aria-label="Mes siguiente" onClick={() => setMonth((m) => addMonths(m, 1))}>
            <ChevronRight />
          </button>
        </div>
      </div>
      <div className={styles.weekdays} aria-hidden>
        {weekdays.map((w) => (
          <span key={w.long} title={w.long}>
            {w.short}
          </span>
        ))}
      </div>
      <div ref={gridRef} role="grid" aria-label={title} className={styles.grid} onKeyDown={onKeyDown}>
        {days.map((d) => {
          const out = !isSameMonth(d, month);
          const sel = selected != null && isSameDay(d, selected);
          const isToday = isSameDay(d, today);
          const focus = isSameDay(d, focusDay);
          const dis = disabled(d);
          return (
            <button
              key={d.getTime()}
              type="button"
              role="gridcell"
              tabIndex={focus ? 0 : -1}
              aria-selected={sel}
              aria-current={isToday ? 'date' : undefined}
              aria-label={format(d, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })}
              disabled={dis}
              className={cx(styles.day, out && styles.outside, sel && styles.selected, isToday && styles.today)}
              onClick={() => {
                setFocusDay(d);
                onSelect(d);
              }}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

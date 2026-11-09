import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { fullDateTime, useNow, cx } from '@/ui';
import styles from './LiveClock.module.css';

export interface LiveClockProps {
  /** 'full': "sáb 7 nov 2026 · 14:32" · 'stacked': hora arriba, fecha abajo (móvil). */
  variant?: 'full' | 'stacked';
  className?: string;
}

/** Reloj en vivo con fecha y hora (se actualiza al cambiar el minuto). */
export function LiveClock({ variant = 'full', className }: LiveClockProps) {
  const now = useNow(1000 * 15);
  const d = new Date(now);
  const time = format(d, 'HH:mm');
  const iso = d.toISOString();
  if (variant === 'stacked') {
    return (
      <time dateTime={iso} title={fullDateTime(now)} className={cx(styles.stacked, className)} aria-label={`${format(d, "EEEE d 'de' MMMM, HH:mm", { locale: es })}`}>
        <span className={styles.stackTime}>{time}</span>
        <span className={styles.stackDate}>{format(d, 'EEE d MMM', { locale: es })}</span>
      </time>
    );
  }
  return (
    <time dateTime={iso} title={fullDateTime(now)} className={cx(styles.clock, className)}>
      <span className={styles.date}>{format(d, 'EEE d MMM yyyy', { locale: es })}</span>
      <span className={styles.dot} aria-hidden>
        ·
      </span>
      <span className={styles.time}>
        {time.slice(0, 2)}
        <span className={styles.colon}>:</span>
        {time.slice(3)}
      </span>
    </time>
  );
}

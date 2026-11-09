import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatDate, formatDateTime, formatRelative, formatTime } from '@/data';
import { useNow } from './hooks';
import { cx } from './utils';
import styles from './DateTimeText.module.css';

export type DateTimeVariant = 'datetime' | 'date' | 'time' | 'relative' | 'relative-datetime';

export interface DateTimeTextProps {
  /** Epoch en ms. */
  value: number;
  /**
   * - 'datetime' (por defecto): "7 nov 2026 · 14:32"
   * - 'date': "7 nov 2026" · 'time': "14:32"
   * - 'relative': "hace 5 min" (se actualiza sola)
   * - 'relative-datetime': "hace 5 min · 7 nov 2026 · 14:32"
   */
  variant?: DateTimeVariant;
  className?: string;
  /** Tono atenuado (texto secundario). */
  muted?: boolean;
}

/** Fecha completa para el atributo title: "sábado 7 de noviembre de 2026, 14:32:05". */
export function fullDateTime(ts: number): string {
  return format(ts, "EEEE d 'de' MMMM 'de' yyyy, HH:mm:ss", { locale: es });
}

function Relative({ value }: { value: number }) {
  // Se re-renderiza cada 30 s (todas las instancias comparten un temporizador).
  useNow(30_000);
  return <>{formatRelative(value)}</>;
}

/** Fecha/hora accesible con <time dateTime> y title con la fecha completa. */
export function DateTimeText({ value, variant = 'datetime', className, muted }: DateTimeTextProps) {
  const iso = new Date(value).toISOString();
  let content: React.ReactNode;
  switch (variant) {
    case 'date':
      content = formatDate(value);
      break;
    case 'time':
      content = formatTime(value);
      break;
    case 'relative':
      content = <Relative value={value} />;
      break;
    case 'relative-datetime':
      // Si el texto relativo ya incluye la hora ("ayer · 14:32"), sólo se añade la fecha.
      content = /\d:\d/.test(formatRelative(value)) ? (
        <>
          <Relative value={value} />
          <span className={styles.sep}> · </span>
          <span className={styles.exact}>{formatDate(value)}</span>
        </>
      ) : (
        <>
          <Relative value={value} />
          <span className={styles.sep}> · </span>
          <span className={styles.exact}>{formatDateTime(value)}</span>
        </>
      );
      break;
    default:
      content = formatDateTime(value);
  }
  return (
    <time dateTime={iso} title={fullDateTime(value)} className={cx(styles.time, muted && styles.muted, className)}>
      {content}
    </time>
  );
}

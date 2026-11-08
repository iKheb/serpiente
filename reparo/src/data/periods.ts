/* Periodos (semana / mes) y cubetas para series. Fechas locales, seguras ante cambios de horario. */
import { addDays, addMonths, addWeeks, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import type { DateRange, Period, PeriodKind, Timestamp } from './types';
import { getCachedSettings } from './settings-cache';
import { capitalize, monthLong, monthShort, weekdayShort } from './format';

export type SeriesBucket = 'day' | 'week' | 'month';

function resolveWeekStart(weekStartsOn?: 0 | 1): 0 | 1 {
  if (weekStartsOn === 0 || weekStartsOn === 1) return weekStartsOn;
  return getCachedSettings().weekStartsOn === 0 ? 0 : 1;
}

function weekLabels(start: Date, endExclusive: Date): { label: string; shortLabel: string } {
  const last = addDays(endExclusive, -1);
  const sd = start.getDate();
  const ld = last.getDate();
  const sm = monthShort(start.getMonth());
  const lm = monthShort(last.getMonth());
  const sy = start.getFullYear();
  const ly = last.getFullYear();
  if (sy !== ly) {
    return {
      label: `Semana del ${sd} ${sm} ${sy} al ${ld} ${lm} ${ly}`,
      shortLabel: `${sd} ${sm} – ${ld} ${lm}`,
    };
  }
  if (start.getMonth() !== last.getMonth()) {
    return {
      label: `Semana del ${sd} ${sm} al ${ld} ${lm} ${ly}`,
      shortLabel: `${sd} ${sm} – ${ld} ${lm}`,
    };
  }
  return {
    label: `Semana del ${sd} al ${ld} de ${lm} ${ly}`,
    shortLabel: `${sd}–${ld} ${lm}`,
  };
}

/** Periodo (semana o mes calendario) que contiene `anchor`. */
export function getPeriod(kind: PeriodKind, anchor: Timestamp = Date.now(), weekStartsOn?: 0 | 1): Period {
  if (kind === 'week') {
    const ws = resolveWeekStart(weekStartsOn);
    const start = startOfWeek(new Date(anchor), { weekStartsOn: ws });
    const end = addWeeks(start, 1);
    return { kind, start: start.getTime(), end: end.getTime(), ...weekLabels(start, end) };
  }
  const start = startOfMonth(new Date(anchor));
  const end = addMonths(start, 1);
  return {
    kind,
    start: start.getTime(),
    end: end.getTime(),
    label: `${capitalize(monthLong(start.getMonth()))} ${start.getFullYear()}`,
    shortLabel: `${monthShort(start.getMonth())} ${start.getFullYear()}`,
  };
}

/** Periodo desplazado `delta` unidades (−1 = anterior, +1 = siguiente). */
export function shiftPeriod(p: Period, delta: number, weekStartsOn?: 0 | 1): Period {
  const anchor = p.kind === 'week' ? addWeeks(new Date(p.start), delta) : addMonths(new Date(p.start), delta);
  return getPeriod(p.kind, anchor.getTime(), weekStartsOn);
}

/** true si el periodo contiene `ts` (por defecto, ahora). */
export function isCurrentPeriod(p: DateRange, ts: Timestamp = Date.now()): boolean {
  return ts >= p.start && ts < p.end;
}

/** Rango del día local que contiene `ts`. */
export function dayRange(ts: Timestamp = Date.now()): DateRange {
  const start = startOfDay(new Date(ts));
  return { start: start.getTime(), end: addDays(start, 1).getTime() };
}

/** Últimos `days` días completos incluyendo hoy: [hoy − days + 1, mañana). */
export function lastDaysRange(days: number, anchor: Timestamp = Date.now()): DateRange {
  const today = startOfDay(new Date(anchor));
  return { start: addDays(today, -(Math.max(1, days) - 1)).getTime(), end: addDays(today, 1).getTime() };
}

/** Rango equivalente inmediatamente anterior (misma duración). Para periodos usa shiftPeriod. */
export function previousRange(r: DateRange): DateRange {
  const len = r.end - r.start;
  return { start: r.start - len, end: r.start };
}

export interface Bucket {
  start: Timestamp;
  end: Timestamp;
  label: string;
}

/**
 * Cubetas consecutivas que cubren `range`. Los extremos se recortan al rango.
 * Etiquetas: día → "lun 3" (rangos ≤ 7 días) o "3 nov"; semana → "3 nov"; mes → "nov".
 */
export function buildBuckets(range: DateRange, bucket: SeriesBucket, weekStartsOn?: 0 | 1): Bucket[] {
  const out: Bucket[] = [];
  if (!(range.end > range.start)) return out;
  const ws = resolveWeekStart(weekStartsOn);
  const rangeStart = new Date(range.start);
  let cursor: Date =
    bucket === 'day'
      ? startOfDay(rangeStart)
      : bucket === 'week'
        ? startOfWeek(rangeStart, { weekStartsOn: ws })
        : startOfMonth(rangeStart);
  const totalDays = Math.round((range.end - range.start) / 86_400_000);
  const spansYears = new Date(range.start).getFullYear() !== new Date(range.end - 1).getFullYear();
  let guard = 0;
  while (cursor.getTime() < range.end && guard++ < 2000) {
    const next = bucket === 'day' ? addDays(cursor, 1) : bucket === 'week' ? addWeeks(cursor, 1) : addMonths(cursor, 1);
    let label: string;
    if (bucket === 'day') {
      label =
        totalDays <= 7
          ? `${weekdayShort(cursor.getDay())} ${cursor.getDate()}`
          : `${cursor.getDate()} ${monthShort(cursor.getMonth())}`;
    } else if (bucket === 'week') {
      label = `${cursor.getDate()} ${monthShort(cursor.getMonth())}`;
    } else {
      label = spansYears && cursor.getMonth() === 0
        ? `${monthShort(0)} ${String(cursor.getFullYear()).slice(2)}`
        : monthShort(cursor.getMonth());
    }
    out.push({
      start: Math.max(cursor.getTime(), range.start),
      end: Math.min(next.getTime(), range.end),
      label,
    });
    cursor = next;
  }
  return out;
}

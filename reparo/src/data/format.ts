/* Formato de dinero, fechas y números (en español).
   Usan la moneda/locale de los ajustes en caché cuando no se pasan explícitamente. */
import { getCachedSettings } from './settings-cache';

export interface MoneyFormatOptions {
  /** Notación compacta: "$12.5 k", "$1.3 M". */
  compact?: boolean;
  /** Muestra siempre el signo: "+$1,200.00" / "−$300.00". */
  sign?: boolean;
  currency?: string;
  locale?: string;
  /** Forzar decimales (true) u ocultarlos (false). Por defecto: los de la moneda. */
  decimals?: boolean;
}

/** Signo menos tipográfico (U+2212). */
export const MINUS = '−';

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function monthShort(monthIndex: number): string {
  return MONTHS_SHORT[((monthIndex % 12) + 12) % 12];
}
export function monthLong(monthIndex: number): string {
  return MONTHS_LONG[((monthIndex % 12) + 12) % 12];
}
export function weekdayShort(dayIndex: number): string {
  return WEEKDAYS_SHORT[((dayIndex % 7) + 7) % 7];
}
export function weekdayLong(dayIndex: number): string {
  return WEEKDAYS_LONG[((dayIndex % 7) + 7) % 7];
}
export function capitalize(s: string): string {
  return s ? s.charAt(0).toLocaleUpperCase('es') + s.slice(1) : s;
}

/* -------------------------------- Dinero --------------------------------- */

const nfCache = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = locale + '|' + JSON.stringify(options);
  let nf = nfCache.get(key);
  if (!nf) {
    try {
      nf = new Intl.NumberFormat(locale, options);
    } catch {
      // Locale o moneda inválidos: caemos a es-MX sin moneda.
      const { currency: _c, style: _s, currencyDisplay: _d, ...rest } = options;
      nf = new Intl.NumberFormat('es-MX', rest);
    }
    nfCache.set(key, nf);
  }
  return nf;
}

function isValidCurrency(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat('es', { style: 'currency', currency: code });
    return true;
  } catch {
    return false;
  }
}

/** Decimales que usa la moneda según Intl (CLP, PYG, COP → 0). */
export function currencyFractionDigits(currency?: string, locale?: string): number {
  const s = getCachedSettings();
  const cur = currency ?? s.currency;
  const loc = locale ?? s.locale;
  if (!isValidCurrency(cur)) return 2;
  return numberFormat(loc, { style: 'currency', currency: cur }).resolvedOptions().maximumFractionDigits ?? 2;
}

/** "$1,250.00"; compact → "$12.5 k"; sign → "+$1,200.00" / "−$300.00". */
export function formatMoney(cents: number, o: MoneyFormatOptions = {}): string {
  const s = getCachedSettings();
  const currency = (o.currency ?? s.currency ?? 'MXN').toUpperCase();
  const locale = o.locale ?? s.locale ?? 'es-MX';
  const safeCents = Number.isFinite(cents) ? Math.round(cents) : 0;
  const negative = safeCents < 0;
  const value = Math.abs(safeCents) / 100;
  const validCurrency = isValidCurrency(currency);

  let text: string;
  if (o.compact && value >= 1000) {
    const opts: Intl.NumberFormatOptions = { notation: 'compact', maximumFractionDigits: 1 };
    text = validCurrency
      ? numberFormat(locale, { ...opts, style: 'currency', currency }).format(value)
      : `${numberFormat(locale, opts).format(value)} ${currency}`;
  } else {
    const opts: Intl.NumberFormatOptions = {};
    if (o.compact || o.decimals === false) {
      opts.minimumFractionDigits = 0;
      opts.maximumFractionDigits = 0;
    } else if (o.decimals === true) {
      opts.minimumFractionDigits = 2;
      opts.maximumFractionDigits = 2;
    }
    text = validCurrency
      ? numberFormat(locale, { ...opts, style: 'currency', currency }).format(value)
      : `${numberFormat(locale, {
          minimumFractionDigits: opts.minimumFractionDigits ?? 2,
          maximumFractionDigits: opts.maximumFractionDigits ?? 2,
        }).format(value)} ${currency}`;
  }

  if (negative && safeCents !== 0) return MINUS + text;
  if (o.sign && safeCents > 0) return '+' + text;
  return text;
}

/** Símbolo de la moneda actual ("$", "€", "S/"…). */
export function currencySymbol(currency?: string, locale?: string): string {
  const s = getCachedSettings();
  const cur = (currency ?? s.currency).toUpperCase();
  const loc = locale ?? s.locale;
  if (!isValidCurrency(cur)) return cur;
  const part = numberFormat(loc, { style: 'currency', currency: cur })
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part?.value ?? cur;
}

/**
 * Convierte texto o número capturado a centavos.
 * Acepta "1,250.50", "1.250,50", "1250", "$ 1 250,5", 1250.5 → 125050.
 * Cadena vacía → 0. Texto sin dígitos → NaN (para que el formulario lo marque).
 */
export function parseMoneyToCents(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return NaN;
    return Math.round(Number((input * 100).toFixed(4)));
  }
  const raw = String(input ?? '').trim();
  if (!raw) return 0;
  const negative = /^[\s$€£]*[-−(]/.test(raw) || /^\(.*\)$/.test(raw);
  let s = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return NaN;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let decimalSep: ',' | '.' | null = null;
  if (lastComma >= 0 && lastDot >= 0) {
    decimalSep = lastComma > lastDot ? ',' : '.';
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const occurrences = s.split(sep).length - 1;
    const after = s.length - s.lastIndexOf(sep) - 1;
    // Una sola aparición seguida de 1-2 dígitos (o ninguno) → separador decimal.
    // Seguida de exactamente 3 dígitos o varias apariciones → miles.
    decimalSep = occurrences === 1 && after !== 3 ? sep : null;
  }

  let intPart = s;
  let fracPart = '';
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
  }
  intPart = intPart.replace(/[.,]/g, '');
  fracPart = fracPart.replace(/[.,]/g, '');
  s = (intPart || '0') + '.' + (fracPart || '0');
  const value = Number(s);
  if (!Number.isFinite(value)) return NaN;
  const cents = Math.round(Number((value * 100).toFixed(4)));
  return negative ? -cents : cents;
}

/** Centavos → texto editable sin símbolo ni miles: 125050 → "1250.50" (o "1250" en monedas sin decimales). */
export function centsToInput(cents: number, currency?: string): string {
  if (!Number.isFinite(cents)) return '';
  const digits = currencyFractionDigits(currency);
  const value = cents / 100;
  return digits === 0 ? String(Math.round(value)) : value.toFixed(2);
}

/** Número con separadores del locale: 1250 → "1,250". */
export function formatNumber(n: number, maxFractionDigits = 0): string {
  const loc = getCachedSettings().locale;
  return numberFormat(loc, { maximumFractionDigits: maxFractionDigits }).format(Number.isFinite(n) ? n : 0);
}

/** Proporción → porcentaje: 0.342 → "34 %" (con `digits` decimales). */
export function formatPercent(ratio: number | null | undefined, digits = 0): string {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  const loc = getCachedSettings().locale;
  const text = numberFormat(loc, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(ratio));
  return ratio < 0 ? MINUS + text : text;
}

/* -------------------------------- Fechas --------------------------------- */

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function toDate(ts: number | Date): Date {
  return ts instanceof Date ? ts : new Date(ts);
}

/** "14:32" (24 h). */
export function formatTime(ts: number | Date): string {
  const d = toDate(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "7 nov 2026". */
export function formatDate(ts: number | Date): string {
  const d = toDate(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "7 nov 2026 · 14:32". */
export function formatDateTime(ts: number | Date): string {
  const d = toDate(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return `${formatDate(d)} · ${formatTime(d)}`;
}

/** "7 nov" (sin año). */
export function formatDayMonth(ts: number | Date): string {
  const d = toDate(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function startOfDayTs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Diferencia en días de calendario (a − b). */
export function calendarDayDiff(a: number | Date, b: number | Date): number {
  const da = toDate(a);
  const dbb = toDate(b);
  const utcA = Date.UTC(da.getFullYear(), da.getMonth(), da.getDate());
  const utcB = Date.UTC(dbb.getFullYear(), dbb.getMonth(), dbb.getDate());
  return Math.round((utcA - utcB) / 86_400_000);
}

/** "justo ahora", "hace 5 min", "hace 2 h", "ayer · 14:32" o "7 nov 2026 · 14:32". */
export function formatRelative(ts: number | Date, now: number = Date.now()): string {
  const d = toDate(ts);
  const t = d.getTime();
  if (Number.isNaN(t)) return '—';
  const diff = now - t;
  if (diff < -60_000) return formatDateTime(d);
  if (diff < 60_000) return 'justo ahora';
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`;
  const nowDate = new Date(now);
  const dayDiff = calendarDayDiff(nowDate, d);
  if (dayDiff === 0) return `hace ${Math.floor(diff / 3_600_000)} h`;
  if (dayDiff === 1) return `ayer · ${formatTime(d)}`;
  return formatDateTime(d);
}

/** "Hoy · sábado 7 de noviembre", "Ayer · viernes 6 de noviembre", "Jueves 5 de noviembre" (+ año si no es el actual). */
export function formatDayHeading(ts: number | Date, now: number = Date.now()): string {
  const d = toDate(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const nowDate = new Date(now);
  const base = `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`;
  const withYear = d.getFullYear() !== nowDate.getFullYear() ? `${base} de ${d.getFullYear()}` : base;
  const diff = calendarDayDiff(nowDate, d);
  if (diff === 0) return `Hoy · ${withYear}`;
  if (diff === 1) return `Ayer · ${withYear}`;
  if (diff === -1) return `Mañana · ${withYear}`;
  return capitalize(withYear);
}

/** Clave de día local "yyyy-mm-dd". */
export function dayKey(ts: number | Date): string {
  const d = toDate(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Clave de mes local "yyyy-mm". */
export function monthKey(ts: number | Date): string {
  const d = toDate(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** "yyyy-mm-dd HH:mm" (para CSV). */
export function formatIsoLocal(ts: number | Date | null | undefined): string {
  if (ts == null) return '';
  const d = toDate(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${dayKey(d)} ${formatTime(d)}`;
}

/** Inicio del día local. */
export function startOfDay(ts: number | Date): number {
  return startOfDayTs(toDate(ts));
}

/** "#000123". */
export function formatFolio(folio: number): string {
  if (!Number.isFinite(folio) || folio <= 0) return '#—';
  return '#' + String(Math.trunc(folio)).padStart(6, '0');
}

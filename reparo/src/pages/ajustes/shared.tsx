/* Piezas compartidas de Ajustes: guardado automático, filas y grupos. */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ValidationError, updateSettings, type Settings } from '@/data';
import { cx } from '@/ui';
import styles from './Ajustes.module.css';

/* --------------------------- Estado de guardado --------------------------- */

export type SaveState = { status: 'idle' | 'saving' | 'saved' | 'error'; at: number | null; message: string | null };

let saveState: SaveState = { status: 'idle', at: null, message: null };
const saveListeners = new Set<() => void>();
let inflight = 0;

function setSave(next: SaveState) {
  saveState = next;
  saveListeners.forEach((l) => l());
}

export function useSaveState(): SaveState {
  return useSyncExternalStore(
    (cb) => {
      saveListeners.add(cb);
      return () => saveListeners.delete(cb);
    },
    () => saveState,
    () => saveState,
  );
}

type Patch = Partial<Omit<Settings, 'id'>>;

/**
 * Guarda un cambio de ajustes y actualiza el indicador global.
 * Devuelve los errores por campo (vacío si se guardó).
 */
export async function saveSettings(patch: Patch): Promise<Record<string, string>> {
  inflight++;
  setSave({ status: 'saving', at: saveState.at, message: null });
  try {
    await updateSettings(patch);
    inflight--;
    if (inflight === 0) setSave({ status: 'saved', at: Date.now(), message: null });
    return {};
  } catch (err) {
    inflight--;
    const fields = err instanceof ValidationError ? err.fields : { _: 'No se pudo guardar el cambio.' };
    setSave({ status: 'error', at: saveState.at, message: Object.values(fields)[0] ?? 'No se pudo guardar.' });
    return fields;
  }
}

/* ------------------------- Campo de texto autoguardado -------------------- */

type TextKey = 'businessName' | 'ownerName' | 'businessPhone' | 'businessAddress' | 'receiptFooter' | 'syncUrl';

/**
 * Borrador local de un campo de texto que se guarda solo: 700 ms después de
 * dejar de escribir y al salir del campo. Mientras se edita no lo pisa el valor
 * guardado.
 */
export function useTextSetting(settings: Settings, key: TextKey, delay = 700) {
  const saved = settings[key];
  const [value, setValue] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    if (!dirty.current) setValue(saved);
  }, [saved]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    const v = latest.current;
    if (v.trim() === String(saved ?? '').trim()) {
      dirty.current = false;
      setError(null);
      return;
    }
    const errs = await saveSettings({ [key]: v } as Patch);
    if (errs[key]) setError(errs[key]);
    else {
      setError(null);
      dirty.current = false;
    }
  }, [key, saved]);

  // Guarda lo pendiente al desmontar (cambiar de sección).
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => void flushRef.current(), []);

  const onChange = (v: string) => {
    dirty.current = true;
    setValue(v);
    if (error) setError(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delay);
  };

  return { value, onChange, onBlur: () => void flush(), error };
}

/* ------------------------------- Diseño ----------------------------------- */

export function Group({ title, description, children, aside, className }: { title?: ReactNode; description?: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={cx(styles.group, className)}>
      {(title || aside) && (
        <div className={styles.groupHead}>
          <div>
            {title && <h3 className={styles.groupTitle}>{title}</h3>}
            {description && <p className={styles.groupDesc}>{description}</p>}
          </div>
          {aside}
        </div>
      )}
      <div className={styles.groupBody}>{children}</div>
    </section>
  );
}

/** Fila de ajuste: texto a la izquierda, control a la derecha (apilado en móvil). */
export function Row({ title, description, children, stack, htmlFor, disabled }: { title: ReactNode; description?: ReactNode; children?: ReactNode; stack?: boolean; htmlFor?: string; disabled?: boolean }) {
  const Title = htmlFor ? 'label' : 'div';
  return (
    <div className={cx(styles.row, stack && styles.rowStack, disabled && styles.rowDisabled)}>
      <div className={styles.rowText}>
        <Title className={styles.rowTitle} {...(htmlFor ? { htmlFor } : {})}>
          {title}
        </Title>
        {description && <div className={styles.rowDesc}>{description}</div>}
      </div>
      {children && <div className={styles.rowControl}>{children}</div>}
    </div>
  );
}

/** Aviso en línea con tono. */
export function Callout({ tone = 'info', icon, title, children }: { tone?: 'info' | 'success' | 'warning' | 'danger' | 'brand'; icon?: ReactNode; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cx(styles.callout, styles[`tone-${tone}`])} role={tone === 'danger' ? 'alert' : undefined}>
      {icon && <span className={styles.calloutIcon}>{icon}</span>}
      <div className={styles.calloutText}>
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

/* ------------------------------- Datos ------------------------------------ */

export interface Country {
  iso: string;
  name: string;
  code: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { iso: 'MX', name: 'México', code: '52', flag: '🇲🇽' },
  { iso: 'CO', name: 'Colombia', code: '57', flag: '🇨🇴' },
  { iso: 'AR', name: 'Argentina', code: '54', flag: '🇦🇷' },
  { iso: 'CL', name: 'Chile', code: '56', flag: '🇨🇱' },
  { iso: 'PE', name: 'Perú', code: '51', flag: '🇵🇪' },
  { iso: 'VE', name: 'Venezuela', code: '58', flag: '🇻🇪' },
  { iso: 'EC', name: 'Ecuador', code: '593', flag: '🇪🇨' },
  { iso: 'GT', name: 'Guatemala', code: '502', flag: '🇬🇹' },
  { iso: 'BO', name: 'Bolivia', code: '591', flag: '🇧🇴' },
  { iso: 'DO', name: 'República Dominicana', code: '1', flag: '🇩🇴' },
  { iso: 'HN', name: 'Honduras', code: '504', flag: '🇭🇳' },
  { iso: 'PY', name: 'Paraguay', code: '595', flag: '🇵🇾' },
  { iso: 'SV', name: 'El Salvador', code: '503', flag: '🇸🇻' },
  { iso: 'NI', name: 'Nicaragua', code: '505', flag: '🇳🇮' },
  { iso: 'CR', name: 'Costa Rica', code: '506', flag: '🇨🇷' },
  { iso: 'PA', name: 'Panamá', code: '507', flag: '🇵🇦' },
  { iso: 'UY', name: 'Uruguay', code: '598', flag: '🇺🇾' },
  { iso: 'CU', name: 'Cuba', code: '53', flag: '🇨🇺' },
  { iso: 'PR', name: 'Puerto Rico', code: '1', flag: '🇵🇷' },
  { iso: 'US', name: 'Estados Unidos', code: '1', flag: '🇺🇸' },
  { iso: 'ES', name: 'España', code: '34', flag: '🇪🇸' },
  { iso: 'GQ', name: 'Guinea Ecuatorial', code: '240', flag: '🇬🇶' },
];

export const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.iso, label: `${c.flag}  +${c.code} ${c.name}` }));

const COUNTRY_KEY = 'reparo:ajustes:pais';

/** País elegido (varios comparten el código "1": se recuerda cuál eligió el usuario). */
export function countryFor(code: string): Country | undefined {
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(COUNTRY_KEY);
  } catch {
    /* sin almacenamiento */
  }
  const matches = COUNTRIES.filter((c) => c.code === code);
  return matches.find((c) => c.iso === remembered) ?? matches[0];
}

export function rememberCountry(iso: string) {
  try {
    localStorage.setItem(COUNTRY_KEY, iso);
  } catch {
    /* sin almacenamiento */
  }
}

/** Moneda sugerida por país (se ofrece al elegir país en el onboarding). */
export const COUNTRY_CURRENCY: Record<string, string> = {
  MX: 'MXN', CO: 'COP', AR: 'ARS', CL: 'CLP', PE: 'PEN', VE: 'VES', EC: 'USD', GT: 'GTQ', BO: 'BOB', DO: 'DOP',
  HN: 'HNL', PY: 'PYG', SV: 'USD', NI: 'NIO', CR: 'CRC', PA: 'USD', UY: 'UYU', CU: 'USD', PR: 'USD', US: 'USD', ES: 'EUR', GQ: 'EUR',
};

export function formatBytes(n: number): string {
  if (!n) return '0 MB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

export const APP_VERSION = '1.0.0';

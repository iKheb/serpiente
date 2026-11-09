/* Utilidades locales de la página Actividad: metadatos por acción/entidad,
   agrupación, búsqueda y operaciones de papelera por tipo de entidad. */
import { createElement, useSyncExternalStore } from 'react';
import {
  formatRelative,
  normalizeText,
  purgeClient,
  purgeExpense,
  purgeInventoryItem,
  restoreClient,
  restoreExpense,
  restoreInventoryItem,
  type AuditAction,
  type AuditEntry,
  type EntityType,
} from '@/data';

export type TrashEntity = 'cliente' | 'gasto' | 'inventario';

export type ActionGroup = 'altas' | 'ediciones' | 'eliminaciones' | 'movimientos' | 'sistema';

export const ACTION_GROUPS: readonly ActionGroup[] = ['altas', 'ediciones', 'eliminaciones', 'movimientos', 'sistema'];

export const GROUP_LABEL: Record<ActionGroup, string> = {
  altas: 'Altas',
  ediciones: 'Ediciones',
  eliminaciones: 'Eliminaciones',
  movimientos: 'Movimientos de inventario',
  sistema: 'Sistema',
};

export const GROUP_OF: Record<AuditAction, ActionGroup> = {
  crear: 'altas',
  editar: 'ediciones',
  eliminar: 'eliminaciones',
  restaurar: 'eliminaciones',
  purgar: 'eliminaciones',
  movimiento: 'movimientos',
  importar: 'sistema',
  exportar: 'sistema',
  ajustes: 'sistema',
  sistema: 'sistema',
};

export const AUDIT_ACTIONS = Object.keys(GROUP_OF) as AuditAction[];

export type Tone = 'success' | 'info' | 'danger' | 'danger-strong' | 'pending' | 'neutral';

export const ACTION_TONE: Record<AuditAction, Tone> = {
  crear: 'success',
  editar: 'info',
  eliminar: 'danger',
  restaurar: 'success',
  purgar: 'danger-strong',
  movimiento: 'pending',
  importar: 'neutral',
  exportar: 'neutral',
  ajustes: 'neutral',
  sistema: 'neutral',
};

export type EntityFilter = 'todas' | EntityType;
export const ENTITY_FILTERS: readonly EntityType[] = ['cliente', 'gasto', 'inventario', 'ajustes', 'sistema'];
export const ENTITY_PLURAL: Record<EntityType, string> = {
  cliente: 'Clientes',
  gasto: 'Gastos',
  inventario: 'Inventario',
  ajustes: 'Ajustes',
  sistema: 'Sistema',
};

export type RangeKey = 'hoy' | '7d' | '30d' | 'todo';
export const RANGE_LABEL: Record<RangeKey, string> = { hoy: 'Hoy', '7d': '7 días', '30d': '30 días', todo: 'Todo' };

/** Inicio (inclusivo) del rango relativo a `now`. */
export function rangeStart(r: RangeKey, now: number): number {
  const d = new Date(now);
  const sod = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (r === 'hoy') return sod;
  if (r === '7d') return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6).getTime();
  if (r === '30d') return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 29).getTime();
  return -Infinity;
}

export function isTrashEntity(e: EntityType): e is TrashEntity {
  return e === 'cliente' || e === 'gasto' || e === 'inventario';
}

export function recordHref(entity: EntityType, id: string | null): string | null {
  if (!id) return null;
  if (entity === 'cliente') return `#/clientes/${id}`;
  if (entity === 'gasto') return `#/gastos/${id}`;
  if (entity === 'inventario') return `#/inventario/${id}`;
  if (entity === 'ajustes') return '#/ajustes';
  return null;
}

export async function restoreEntity(entity: TrashEntity, id: string) {
  if (entity === 'cliente') return restoreClient(id);
  if (entity === 'gasto') return restoreExpense(id);
  return restoreInventoryItem(id);
}

export async function purgeEntity(entity: TrashEntity, id: string) {
  if (entity === 'cliente') return purgeClient(id);
  if (entity === 'gasto') return purgeExpense(id);
  return purgeInventoryItem(id);
}

/* ------------------------------ Búsqueda ------------------------------- */

const haystacks = new WeakMap<AuditEntry, string>();

/** Texto normalizado (título, resumen y campos) cacheado por entrada. */
export function haystack(e: AuditEntry): string {
  let h = haystacks.get(e);
  if (h === undefined) {
    const parts = [e.title, e.summary];
    for (const c of e.changes ?? []) parts.push(c.label, c.fromText, c.toText);
    h = normalizeText(parts.join(' \u0001 '));
    haystacks.set(e, h);
  }
  return h;
}

export function matchTokens(q: string): string[] {
  const n = normalizeText(q);
  return n ? n.split(' ') : [];
}

export function entryMatches(e: AuditEntry, tokens: string[]): boolean {
  if (!tokens.length) return true;
  const h = haystack(e);
  return tokens.every((t) => h.includes(t));
}

/* ------------------------------- Formato -------------------------------- */

const p2 = (n: number) => (n < 10 ? '0' + n : String(n));

/** "14:32:05". */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('es-MX')} ${n === 1 ? one : many}`;
}

/* ------------------------------ Reloj local ----------------------------- */

// Temporizador compartido con `subscribe` estable (evita resuscripciones por render).
let minuteNow = Date.now();
const minuteListeners = new Set<() => void>();
let minuteTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleMinute() {
  minuteTimer = setTimeout(() => {
    minuteNow = Date.now();
    minuteListeners.forEach((l) => l());
    scheduleMinute();
  }, 60_000 - (Date.now() % 60_000) + 5);
}
function subscribeMinute(cb: () => void) {
  minuteListeners.add(cb);
  if (!minuteTimer) {
    minuteNow = Date.now();
    scheduleMinute();
  }
  return () => {
    minuteListeners.delete(cb);
    if (!minuteListeners.size && minuteTimer) {
      clearTimeout(minuteTimer);
      minuteTimer = null;
    }
  };
}
const getMinute = () => minuteNow;

/** Hora actual que se actualiza cada minuto (alineada al cambio de minuto). */
export function useMinuteNow(): number {
  return useSyncExternalStore(subscribeMinute, getMinute, getMinute);
}

/** "hace 5 min" / "ayer · 14:32" que se actualiza sola cada minuto. */
export function RelativeTime({ ts, className }: { ts: number; className?: string }) {
  const now = useMinuteNow();
  return createElement('span', { className }, formatRelative(ts, Math.max(now, Date.now() - 1)));
}

import type { ReactNode } from 'react';

export type ToastTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info';

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** Botón de acción (p. ej. { label: 'Deshacer', onClick }). Al pulsarlo se cierra el toast. */
  action?: { label: string; onClick: () => void };
  /** ms visibles (por defecto 4500; 7000 si hay acción). Infinity = hasta cerrarlo. */
  duration?: number;
  /** Reutiliza un id para actualizar un toast existente. */
  id?: string;
  icon?: ReactNode;
}

export interface ToastItem extends ToastOptions {
  id: string;
  createdAt: number;
}

let items: ToastItem[] = [];
const listeners = new Set<() => void>();
let seq = 0;
const emit = () => listeners.forEach((l) => l());

export const toastStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get: () => items,
  dismiss(id?: string) {
    items = id ? items.filter((t) => t.id !== id) : [];
    emit();
  },
};

/**
 * Muestra un toast. Devuelve su id.
 *   toast({ title: 'Cliente guardado', tone: 'success' })
 *   toast({ title: 'Gasto eliminado', action: { label: 'Deshacer', onClick: () => restoreExpense(id) } })
 * Requiere <Toaster /> montado (lo monta el Shell).
 */
export function toast(opts: ToastOptions): string {
  const id = opts.id ?? `t${++seq}`;
  const existing = items.find((t) => t.id === id);
  const item: ToastItem = { ...opts, id, createdAt: existing?.createdAt ?? Date.now() };
  items = existing ? items.map((t) => (t.id === id ? item : t)) : [...items, item].slice(-8);
  emit();
  return id;
}

type Shortcut = (title: ReactNode, opts?: Omit<ToastOptions, 'title' | 'tone'>) => string;
const withTone =
  (tone: ToastTone): Shortcut =>
  (title, opts) =>
    toast({ ...opts, title, tone });

toast.success = withTone('success');
toast.error = withTone('danger');
toast.warning = withTone('warning');
toast.info = withTone('info');
toast.dismiss = (id?: string) => toastStore.dismiss(id);
/** Patrón "Deshacer": toast.undo('Cliente enviado a la papelera', () => restoreClient(id)). */
toast.undo = (title: ReactNode, onUndo: () => void, opts?: Omit<ToastOptions, 'title' | 'action'>) =>
  toast({ tone: 'neutral', duration: 7000, ...opts, title, action: { label: 'Deshacer', onClick: onUndo } });

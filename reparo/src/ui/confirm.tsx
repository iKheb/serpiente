import { useSyncExternalStore, type ReactNode } from 'react';
import { CircleHelp, Trash, TriangleAlert } from 'lucide-react';
import { Button } from './Button';
import { Dialog, type DialogTone } from './Dialog';

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  /** Texto del botón de confirmar (por defecto "Confirmar"). */
  confirmLabel?: string;
  /** Texto del botón de cancelar (por defecto "Cancelar"). */
  cancelLabel?: string;
  /** 'danger' pinta el botón en rojo (eliminar, vaciar…). */
  tone?: 'danger' | 'warning' | 'brand';
  /** Ícono propio (por defecto según el tono). */
  icon?: ReactNode;
}

interface Pending extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
  open: boolean;
}

let queue: Pending[] = [];
const listeners = new Set<() => void>();
let seq = 0;
const emit = () => listeners.forEach((l) => l());

/**
 * Confirmación imperativa. Uso:
 *   if (await confirm({ title: '¿Eliminar cliente?', tone: 'danger', confirmLabel: 'Eliminar' })) …
 * Requiere <Toaster /> montado (lo monta el Shell).
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { ...opts, id: ++seq, resolve, open: true }];
    emit();
  });
}

function settle(id: number, ok: boolean) {
  const item = queue.find((q) => q.id === id);
  if (!item || !item.open) return;
  item.resolve(ok);
  queue = queue.map((q) => (q.id === id ? { ...q, open: false } : q));
  emit();
  setTimeout(() => {
    queue = queue.filter((q) => q.id !== id);
    emit();
  }, 250);
}

const TONE_ICON = { danger: <Trash />, warning: <TriangleAlert />, brand: <CircleHelp /> };

/** Host de confirmaciones (lo renderiza <Toaster />). */
export function ConfirmHost() {
  const items = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => queue,
    () => queue,
  );
  const current = items.find((q) => q.open) ?? null;
  const shown = current ?? items[items.length - 1] ?? null;
  const tone = shown?.tone ?? 'brand';
  return (
    <Dialog
      open={!!current}
      onClose={() => current && settle(current.id, false)}
      role="alertdialog"
      size="sm"
      tone={tone as DialogTone}
      icon={shown ? (shown.icon ?? TONE_ICON[tone]) : null}
      title={shown?.title ?? ''}
      description={shown?.description}
      closeButton={false}
      footer={
        shown && (
          <>
            <Button variant="ghost" onClick={() => current && settle(current.id, false)}>
              {shown.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} data-autofocus onClick={() => current && settle(current.id, true)}>
              {shown.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        )
      }
    />
  );
}

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Renderiza en document.body (capas flotantes, modales, toasts). App sólo cliente. */
export function Portal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

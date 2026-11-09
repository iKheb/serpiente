import { useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { Portal } from './Portal';
import { useFocusTrap } from './focusTrap';
import { usePrefersReducedMotion, useScrollLock } from './hooks';
import { useLayer } from './layers';
import { cx } from './utils';
import styles from './Dialog.module.css';

export type DialogTone = 'brand' | 'danger' | 'warning' | 'success' | 'info' | 'neutral';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Ícono en una baldosa de color (según `tone`). */
  icon?: ReactNode;
  tone?: DialogTone;
  children?: ReactNode;
  footer?: ReactNode;
  /** sm 400 · md 520 (defecto) · lg 680. */
  size?: 'sm' | 'md' | 'lg';
  dismissible?: boolean;
  /** Muestra el botón cerrar (por defecto true salvo en alertas). */
  closeButton?: boolean;
  role?: 'dialog' | 'alertdialog';
  className?: string;
}

/** Diálogo modal centrado con foco atrapado y Escape. */
export function Dialog({ open, onClose, title, description, icon, tone = 'brand', children, footer, size = 'md', dismissible = true, closeButton = true, role = 'dialog', className }: DialogProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const titleId = useId();
  const descId = useId();
  useScrollLock(open);
  useFocusTrap(ref, open);
  useLayer(open, { onEscape: () => dismissible && onClose() });

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <div className={styles.root} data-ui-modal="true">
            <motion.div
              className={styles.overlay}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => dismissible && onClose()}
              aria-hidden
            />
            <motion.div
              ref={ref}
              role={role}
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={description ? descId : undefined}
              tabIndex={-1}
              className={cx(styles.dialog, styles[size], className)}
              initial={{ opacity: 0, scale: reduced ? 1 : 0.96, y: reduced ? 0 : 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: reduced ? 1 : 0.98, y: reduced ? 0 : 4, transition: { duration: 0.12 } }}
              transition={{ type: 'spring', stiffness: 520, damping: 38 }}
            >
              <div className={styles.header}>
                {icon && <span className={cx(styles.icon, styles[tone])}>{icon}</span>}
                <div className={styles.headText}>
                  <h2 id={titleId} className={styles.title}>
                    {title}
                  </h2>
                  {description && (
                    <div id={descId} className={styles.description}>
                      {description}
                    </div>
                  )}
                </div>
                {closeButton && dismissible && (
                  <IconButton className={styles.close} icon={<X />} label="Cerrar" size="sm" onClick={onClose} tooltip={false} />
                )}
              </div>
              {children && <div className={styles.body}>{children}</div>}
              {footer && <div className={styles.footer}>{footer}</div>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

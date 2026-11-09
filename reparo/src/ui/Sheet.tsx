import { useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useDragControls, type PanInfo } from 'motion/react';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { Portal } from './Portal';
import { useFocusTrap } from './focusTrap';
import { useMediaQuery, usePrefersReducedMotion, useScrollLock } from './hooks';
import { useLayer } from './layers';
import { cx } from './utils';
import styles from './Sheet.module.css';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Ícono en el encabezado. */
  icon?: ReactNode;
  children: ReactNode;
  /** Barra inferior fija (acciones del formulario). */
  footer?: ReactNode;
  /** Ancho en escritorio: sm 400 · md 520 (defecto) · lg 640 · xl 820. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** false impide cerrar con Escape/fondo/arrastre (p. ej. mientras se guarda). */
  dismissible?: boolean;
  /** Acciones extra en el encabezado (junto al botón cerrar). */
  headerActions?: ReactNode;
  bodyClassName?: string;
  /** Sin padding en el cuerpo (listas a sangre). */
  flush?: boolean;
  /**
   * 'auto' (defecto): panel lateral desde 640 px, hoja inferior por debajo.
   * 'bottom': siempre hoja inferior (menús de la barra inferior en móvil y tablet).
   */
  placement?: 'auto' | 'bottom';
}

/** Ancho a partir del cual el Sheet es panel lateral (por debajo: hoja inferior). */
export const SHEET_SIDE_QUERY = '(min-width: 640px)';

/**
 * Panel lateral derecho en escritorio; hoja inferior con arrastre para cerrar
 * en móvil. Foco atrapado, Escape y clic en el fondo cierran.
 * Patrón de formulario: <form id="x"> en children y en footer
 * <Button type="submit" form="x" variant="primary">Guardar</Button>.
 */
export function Sheet({ open, onClose, title, description, icon, children, footer, size = 'md', dismissible = true, headerActions, bodyClassName, flush, placement = 'auto' }: SheetProps) {
  const wide = useMediaQuery(SHEET_SIDE_QUERY);
  const side = wide && placement !== 'bottom';
  const reduced = usePrefersReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const drag = useDragControls();
  useScrollLock(open);
  useFocusTrap(panelRef, open);
  useLayer(open, { onEscape: () => dismissible && onClose() });

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (!dismissible) return;
    if (info.offset.y > 120 || info.velocity.y > 650) onClose();
  };

  const variants = side
    ? { hidden: { x: reduced ? 0 : 40, opacity: 0 }, shown: { x: 0, opacity: 1 } }
    : { hidden: { y: reduced ? 0 : '100%', opacity: reduced ? 0 : 1 }, shown: { y: 0, opacity: 1 } };

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
              transition={{ duration: 0.2 }}
              onClick={() => dismissible && onClose()}
              aria-hidden
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={description ? descId : undefined}
              tabIndex={-1}
              className={cx(styles.panel, side ? styles.side : styles.bottom, styles[size])}
              variants={variants}
              initial="hidden"
              animate="shown"
              exit="hidden"
              transition={side ? { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 } : { type: 'spring', stiffness: 380, damping: 38 }}
              drag={!side && dismissible ? 'y' : false}
              dragControls={drag}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.05, bottom: 0.9 }}
              onDragEnd={onDragEnd}
            >
              <div
                className={styles.header}
                onPointerDown={(e) => {
                  if (!side && dismissible && !(e.target as HTMLElement).closest('button, a, input')) drag.start(e);
                }}
              >
                {!side && <span className={styles.handle} aria-hidden />}
                <div className={styles.headRow}>
                  {icon && <span className={styles.icon}>{icon}</span>}
                  <div className={styles.headText}>
                    <h2 id={titleId} className={styles.title}>
                      {title}
                    </h2>
                    {description && (
                      <p id={descId} className={styles.description}>
                        {description}
                      </p>
                    )}
                  </div>
                  <div className={styles.headActions}>
                    {headerActions}
                    {dismissible && <IconButton icon={<X />} label="Cerrar" size="sm" onClick={onClose} tooltip={false} />}
                  </div>
                </div>
              </div>
              <div className={cx(styles.body, flush && styles.flush, bodyClassName)}>{children}</div>
              {footer && <div className={styles.footer}>{footer}</div>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Portal } from './Portal';
import { useFloating, type Align, type Side } from './floating';
import { useLayer } from './layers';
import { cx, getFocusable, mergeRefs } from './utils';
import styles from './Popover.module.css';

export interface FloatingPanelProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  side?: Side;
  align?: Align;
  offset?: number;
  matchWidth?: boolean;
  width?: number | string;
  maxHeight?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  role?: string;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  /** Cerrar al hacer clic fuera (por defecto true). */
  closeOnOutside?: boolean;
  /** Acción al hacer clic fuera (por defecto onClose). */
  onOutside?: () => void;
  panelRef?: Ref<HTMLDivElement>;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

/** Panel flotante anclado (base de Popover, Select, Combobox, menús). */
export function FloatingPanel({
  open,
  onClose,
  anchorRef,
  side = 'bottom',
  align = 'start',
  offset = 6,
  matchWidth,
  width,
  maxHeight,
  className,
  style: extraStyle,
  children,
  role,
  id,
  closeOnOutside = true,
  onOutside,
  panelRef,
  tabIndex,
  onKeyDown,
  ...aria
}: FloatingPanelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { style, origin, side: placed } = useFloating(anchorRef, ref, { open, side, align, offset, matchWidth });
  useLayer(open, {
    onEscape: onClose,
    onOutside: closeOnOutside ? (onOutside ?? onClose) : undefined,
    refs: [ref, anchorRef],
  });
  const dy = placed === 'bottom' ? -4 : placed === 'top' ? 4 : 0;
  const finalMax = Math.min(maxHeight ?? 9999, typeof style.maxHeight === 'number' ? style.maxHeight : 9999);
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={mergeRefs(ref, panelRef)}
            role={role}
            id={id}
            tabIndex={tabIndex}
            onKeyDown={onKeyDown}
            className={cx(styles.panel, className)}
            style={{ ...style, maxHeight: finalMax < 9999 ? finalMax : undefined, width, transformOrigin: origin, ...extraStyle }}
            initial={{ opacity: 0, scale: 0.97, y: dy }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            {...aria}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

export interface PopoverProps {
  /** Elemento que abre/cierra el popover (botón). */
  trigger: ReactElement;
  /** Contenido; si es función recibe `close`. */
  children: ReactNode | ((close: () => void) => ReactNode);
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: Side;
  align?: Align;
  width?: number | string;
  /** Añade padding interno estándar (por defecto true). */
  padded?: boolean;
  className?: string;
  label?: string;
}

/** Popover genérico con foco gestionado, Escape y clic fuera. */
export function Popover({ trigger, children, open: openProp, onOpenChange, side = 'bottom', align = 'start', width, padded = true, className, label }: PopoverProps) {
  const [inner, setInner] = useState(false);
  const open = openProp ?? inner;
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      const el = panelRef.current;
      if (!el) return;
      const auto = el.querySelector<HTMLElement>('[data-autofocus]');
      (auto ?? getFocusable(el)[0] ?? el).focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);
  const setOpen = useCallback(
    (v: boolean) => {
      if (openProp === undefined) setInner(v);
      onOpenChange?.(v);
    },
    [openProp, onOpenChange],
  );
  const close = useCallback(() => {
    setOpen(false);
    anchorRef.current?.focus();
  }, [setOpen]);

  if (!isValidElement(trigger)) return null;
  type AnyProps = Record<string, unknown> & { ref?: Ref<HTMLElement> };
  const tp = trigger.props as AnyProps;
  const triggerEl = cloneElement(trigger as ReactElement<AnyProps>, {
    ref: mergeRefs(tp.ref, anchorRef),
    'aria-expanded': open,
    'aria-haspopup': 'dialog',
    'aria-controls': open ? id : undefined,
    onClick: (e: unknown) => {
      if (typeof tp.onClick === 'function') (tp.onClick as (ev: unknown) => void)(e);
      setOpen(!open);
    },
  });

  return (
    <>
      {triggerEl}
      <FloatingPanel
        open={open}
        onClose={close}
        onOutside={() => setOpen(false)}
        panelRef={panelRef}
        tabIndex={-1}
        anchorRef={anchorRef}
        side={side}
        align={align}
        width={width}
        className={cx(padded && styles.padded, className)}
        role="dialog"
        id={id}
        aria-label={label}
      >
        {typeof children === 'function' ? children(close) : children}
      </FloatingPanel>
    </>
  );
}

export { styles as popoverStyles };

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Portal } from './Portal';
import { useFloating, type Align, type Side } from './floating';
import { mergeRefs } from './utils';
import styles from './Tooltip.module.css';

export interface TooltipProps {
  content: ReactNode;
  /** Un único elemento enfocable (botón, enlace…). */
  children: ReactElement;
  side?: Side;
  align?: Align;
  /** Retraso antes de mostrarse (ms). */
  delay?: number;
  /** Atajo de teclado mostrado a la derecha, p. ej. ['⌘', 'K'] o 'C'. */
  shortcut?: string | string[];
  disabled?: boolean;
}

// Grupo de retraso: si otro tooltip se cerró hace poco, el siguiente aparece al instante.
let lastClosed = 0;

export function Tooltip({ content, children, side = 'top', align = 'center', delay = 380, shortcut, disabled }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLElement | null>(null);
  const floatRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const { style, side: placed } = useFloating(anchorRef, floatRef, { open, side, align, offset: 7 });

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  if (!isValidElement(children)) return <>{children}</>;

  const show = () => {
    if (disabled || !content) return;
    if (timer.current) clearTimeout(timer.current);
    const instant = Date.now() - lastClosed < 400;
    timer.current = setTimeout(() => setOpen(true), instant ? 0 : delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    if (open) lastClosed = Date.now();
    setOpen(false);
  };

  type AnyProps = Record<string, unknown> & { ref?: Ref<HTMLElement> };
  const childProps = children.props as AnyProps;
  const call = (name: string, e: unknown) => {
    const fn = childProps[name];
    if (typeof fn === 'function') (fn as (ev: unknown) => void)(e);
  };

  const trigger = cloneElement(children as ReactElement<AnyProps>, {
    ref: mergeRefs(childProps.ref, anchorRef),
    'aria-describedby': open ? id : (childProps['aria-describedby'] as string | undefined),
    onPointerEnter: (e: PointerEvent) => {
      call('onPointerEnter', e);
      if ((e as unknown as { pointerType: string }).pointerType === 'mouse') show();
    },
    onPointerLeave: (e: PointerEvent) => {
      call('onPointerLeave', e);
      hide();
    },
    onPointerDown: (e: PointerEvent) => {
      call('onPointerDown', e);
      hide();
    },
    onFocus: (e: FocusEvent) => {
      call('onFocus', e);
      // Sólo con foco por teclado (no al hacer clic).
      const t = e.target as HTMLElement | null;
      if (t?.matches?.(':focus-visible')) show();
    },
    onBlur: (e: FocusEvent) => {
      call('onBlur', e);
      hide();
    },
    onKeyDown: (e: KeyboardEvent) => {
      call('onKeyDown', e);
      if (e.key === 'Escape' && open) hide();
    },
  });

  const keys = shortcut ? (Array.isArray(shortcut) ? shortcut : [shortcut]) : null;
  const dy = placed === 'top' ? 3 : placed === 'bottom' ? -3 : 0;
  const dx = placed === 'left' ? 3 : placed === 'right' ? -3 : 0;

  return (
    <>
      {trigger}
      <Portal>
        <AnimatePresence>
          {open && (
            <motion.div
              ref={floatRef}
              id={id}
              role="tooltip"
              className={styles.tooltip}
              style={style}
              initial={{ opacity: 0, y: dy, x: dx, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, x: 0, scale: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            >
              {content}
              {keys && (
                <span className={styles.shortcut} aria-hidden>
                  {keys.map((k) => (
                    <kbd key={k} className={styles.key}>
                      {k}
                    </kbd>
                  ))}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}

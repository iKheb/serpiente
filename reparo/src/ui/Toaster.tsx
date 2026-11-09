import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import { ConfirmHost } from './confirm';
import { usePrefersReducedMotion } from './hooks';
import { toastStore, type ToastItem } from './toast';
import { cx } from './utils';
import styles from './Toaster.module.css';

const ICONS = {
  success: <CircleCheck />,
  danger: <CircleX />,
  warning: <TriangleAlert />,
  info: <Info />,
  neutral: null,
};

const GAP = 10;
const VISIBLE = 3;

function ToastView({
  item,
  index,
  expanded,
  offset,
  frontHeight,
  onHeight,
  paused,
}: {
  item: ToastItem;
  index: number;
  expanded: boolean;
  offset: number;
  frontHeight: number;
  onHeight: (id: string, h: number) => void;
  paused: boolean;
}) {
  const reduced = usePrefersReducedMotion();
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [swipe, setSwipe] = useState(0);
  const tone = item.tone ?? 'neutral';
  const duration = item.duration ?? (item.action ? 7000 : 4500);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    onHeight(item.id, el.offsetHeight);
    const ro = new ResizeObserver(() => onHeight(item.id, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [item.id, onHeight]);

  // Temporizador con pausa (hover / pestaña oculta).
  const remaining = useRef(duration);
  useEffect(() => {
    remaining.current = duration;
  }, [duration, item.createdAt]);
  useEffect(() => {
    if (paused || !Number.isFinite(duration)) return;
    const start = Date.now();
    const t = setTimeout(() => toastStore.dismiss(item.id), remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current -= Date.now() - start;
    };
  }, [paused, duration, item.id]);

  const collapsedBehind = !expanded && index > 0;
  const y = expanded ? -offset : -index * 12;
  const scale = expanded ? 1 : 1 - index * 0.05;
  const hidden = index >= VISIBLE;

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 500) {
      setSwipe(info.offset.x > 0 ? 1 : -1);
      requestAnimationFrame(() => toastStore.dismiss(item.id));
    }
  };

  return (
    <motion.li
      layout={false}
      className={cx(styles.toast, styles[tone])}
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
      style={{ zIndex: 100 - index, height: collapsedBehind && frontHeight ? frontHeight : undefined, pointerEvents: hidden ? 'none' : 'auto' }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: hidden ? 0 : 1, y, scale }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: swipe * 360, y: swipe ? y : y + 16, scale: swipe ? scale : 0.96, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.5}
      onDragEnd={onDragEnd}
    >
      <div ref={innerRef} className={cx(styles.inner, collapsedBehind && styles.dim)}>
        {(item.icon ?? ICONS[tone]) && <span className={styles.icon}>{item.icon ?? ICONS[tone]}</span>}
        <div className={styles.text}>
          <div className={styles.title}>{item.title}</div>
          {item.description && <div className={styles.description}>{item.description}</div>}
        </div>
        {item.action && (
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              item.action?.onClick();
              toastStore.dismiss(item.id);
            }}
          >
            {item.action.label}
          </button>
        )}
        <button type="button" className={styles.close} aria-label="Cerrar notificación" onClick={() => toastStore.dismiss(item.id)}>
          <X />
        </button>
      </div>
    </motion.li>
  );
}

/**
 * Contenedor de toasts apilados (abajo a la derecha; en móvil sobre la barra
 * inferior) y de los diálogos de `confirm()`. Montar una sola vez.
 */
export function Toaster() {
  const items = useSyncExternalStore(toastStore.subscribe, toastStore.get, toastStore.get);
  const [hovered, setHovered] = useState(false);
  const [hiddenTab, setHiddenTab] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});

  useEffect(() => {
    const on = () => setHiddenTab(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  useEffect(() => {
    if (items.length === 0) setHovered(false);
  }, [items.length]);

  const onHeight = useCallback((id: string, h: number) => {
    setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }));
  }, []);

  // Más reciente primero.
  const ordered = [...items].reverse();
  const front = ordered[0];
  const frontHeight = front ? (heights[front.id] ?? 0) : 0;
  let acc = 0;
  const offsets = ordered.map((t) => {
    const o = acc;
    acc += (heights[t.id] ?? 64) + GAP;
    return o;
  });
  const expanded = hovered;
  const stackHeight = expanded ? Math.max(0, acc - GAP) : frontHeight + Math.min(ordered.length - 1, VISIBLE - 1) * 12;

  return (
    <>
      <section aria-label="Notificaciones" className={styles.region} data-ui-ignore-outside>
        <ol
          className={styles.list}
          style={{ height: stackHeight }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onPointerDown={(e) => {
            if (e.pointerType !== 'mouse') setHovered(true);
          }}
        >
          <AnimatePresence initial={false}>
            {ordered.map((t, i) => (
              <ToastView
                key={t.id}
                item={t}
                index={i}
                expanded={expanded}
                offset={offsets[i]}
                frontHeight={frontHeight}
                onHeight={onHeight}
                paused={hovered || hiddenTab}
              />
            ))}
          </AnimatePresence>
        </ol>
      </section>
      <ConfirmHost />
    </>
  );
}

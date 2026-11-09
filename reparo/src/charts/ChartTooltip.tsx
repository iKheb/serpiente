import { Fragment, useLayoutEffect, useRef, type ReactNode } from 'react';
import s from './ChartTooltip.module.css';

export interface TooltipRow {
  key: string;
  label: string;
  value: string;
  /** Token de color de la serie (se muestra como clave de línea). */
  color?: string;
  dashed?: boolean;
  muted?: boolean;
}

export interface ChartTooltipProps {
  open: boolean;
  /** Punto de anclaje en px relativos al contenedor posicionado. */
  anchor: { x: number; y: number } | null;
  /** Tamaño del contenedor (para no salirse). */
  bounds: { width: number; height: number };
  /** Separación horizontal entre el ancla y el tooltip. */
  offset?: number;
  /** `center`: centrado verticalmente en el ancla. `start`: el borde superior cerca del ancla. */
  align?: 'center' | 'start';
  /** `side` (por defecto): a un lado del ancla. `top`: centrado encima (puede salir del contenedor). */
  placement?: 'side' | 'top';
  /** Variante compacta de una sola línea: `título · valor`. */
  compactValue?: string;
  title?: ReactNode;
  rows?: readonly TooltipRow[];
  /** Fila de total al pie (p. ej. barras apiladas). */
  total?: { label: string; value: string };
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * Tooltip flotante: se coloca a la derecha del ancla y se voltea a la izquierda
 * si no cabe; nunca se sale verticalmente. Se desliza suavemente entre puntos.
 */
export function ChartTooltip({
  open,
  anchor,
  bounds,
  offset = 14,
  align = 'center',
  placement = 'side',
  compactValue,
  title,
  rows,
  total,
  footer,
  children,
  className,
}: ChartTooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!open || !anchor) {
      wasOpen.current = false;
      el.dataset.glide = '0';
      return;
    }
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    const pad = 4;
    if (placement === 'top') {
      const left = Math.max(-pad, Math.min(bounds.width - tw + pad, anchor.x - tw / 2));
      const top = anchor.y - offset - th;
      el.dataset.glide = wasOpen.current ? '1' : '0';
      el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
      wasOpen.current = true;
      return;
    }
    let left = anchor.x + offset;
    if (left + tw > bounds.width - pad) left = anchor.x - offset - tw;
    if (left < pad) left = Math.max(pad, Math.min(bounds.width - tw - pad, anchor.x - tw / 2));
    let top = align === 'center' ? anchor.y - th / 2 : anchor.y - 6;
    const maxTop = Math.max(pad, bounds.height - th - pad);
    top = Math.max(-pad * 2, Math.min(maxTop, top));
    el.dataset.glide = wasOpen.current ? '1' : '0';
    el.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
    wasOpen.current = true;
  });

  return (
    <div
      ref={ref}
      className={[s.tooltip, open && anchor ? s.open : '', compactValue != null ? s.compact : '', className].filter(Boolean).join(' ')}
      aria-hidden
      role="presentation"
    >
      {title != null && <div className={s.title}>{title}</div>}
      {compactValue != null && <span className={s.compactValue}>{compactValue}</span>}
      {rows && rows.length > 0 && (
        <div className={s.rows}>
          {rows.map((r) => (
            <Fragment key={r.key}>
              <span
                className={[s.key, r.dashed ? s.keyDashed : ''].join(' ')}
                style={{ backgroundColor: r.color ?? 'var(--text-4)', color: r.color }}
              />
              <span className={s.label} style={r.muted ? { color: 'var(--text-3)' } : undefined}>
                {r.label}
              </span>
              <span className={s.value} style={r.muted ? { color: 'var(--text-3)' } : undefined}>
                {r.value}
              </span>
            </Fragment>
          ))}
        </div>
      )}
      {total && (
        <div className={s.total}>
          <span>{total.label}</span>
          <span className={s.value}>{total.value}</span>
        </div>
      )}
      {children}
      {footer != null && <div className={s.footer}>{footer}</div>}
    </div>
  );
}

import type { CSSProperties } from 'react';
import s from './Legend.module.css';

export interface LegendItem {
  key: string;
  label: string;
  /** Token de color: `var(--income)`. */
  color: string;
  /** Valor opcional a la derecha de la etiqueta. */
  value?: string;
  /** Forma de la muestra: cuadro (barras/áreas), línea, punto o discontinua. */
  marker?: 'square' | 'line' | 'dot' | 'dashed';
}

export interface LegendProps {
  items: readonly LegendItem[];
  /** Claves ocultas (se muestran tachadas). */
  hidden?: ReadonlySet<string>;
  /** Si se pasa, cada elemento es un botón para ocultar/mostrar la serie. */
  onToggle?: (key: string) => void;
  /** Resalta una serie al pasar el cursor. */
  onHover?: (key: string | null) => void;
  activeKey?: string | null;
  align?: 'start' | 'center' | 'end';
  className?: string;
  style?: CSSProperties;
}

/** Leyenda reutilizable: muestra con color + etiqueta (el texto nunca usa el color de la serie). */
export function Legend({ items, hidden, onToggle, onHover, activeKey, align = 'start', className, style }: LegendProps) {
  return (
    <ul className={[s.legend, s[align], className].filter(Boolean).join(' ')} style={style}>
      {items.map((it) => {
        const off = hidden?.has(it.key) ?? false;
        const dim = activeKey != null && activeKey !== it.key;
        const swatch = (
          <span
            aria-hidden
            className={[s.swatch, it.marker && it.marker !== 'square' ? s[`marker_${it.marker}`] : ''].join(' ')}
            style={{ color: it.color, backgroundColor: it.marker === 'dashed' ? undefined : it.color }}
          />
        );
        const content = (
          <>
            {swatch}
            <span className={s.label}>{it.label}</span>
            {it.value != null && <span className={s.value}>{it.value}</span>}
          </>
        );
        return (
          <li key={it.key} onPointerEnter={onHover ? () => onHover(it.key) : undefined} onPointerLeave={onHover ? () => onHover(null) : undefined}>
            {onToggle ? (
              <button
                type="button"
                className={[s.button, off ? s.off : '', dim ? s.dimmed : ''].join(' ')}
                aria-pressed={!off}
                title={off ? `Mostrar ${it.label}` : `Ocultar ${it.label}`}
                onClick={() => onToggle(it.key)}
                onFocus={onHover ? () => onHover(it.key) : undefined}
                onBlur={onHover ? () => onHover(null) : undefined}
              >
                {content}
              </button>
            ) : (
              <span className={[s.item, off ? s.off : '', dim ? s.dimmed : ''].join(' ')}>{content}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

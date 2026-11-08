import { useMemo, useState, type ReactNode } from 'react';
import s from './HBarList.module.css';
import { useReducedMotion } from './lib/hooks';
import { defaultFormatValue, formatPercent as defaultFormatPercent } from './lib/format';
import type { ValueFormatter } from './lib/types';

export interface HBarItem {
  key: string;
  label: string;
  value: number;
  /** Texto secundario (p. ej. "12 servicios"). */
  sublabel?: string;
  icon?: ReactNode;
  /** Color propio (token). Por defecto todas las barras comparten `color`. */
  color?: string;
}

export interface HBarListProps {
  items: readonly HBarItem[];
  /** Máximo de filas; el resto se agrupa en "Otros". Por defecto 6. */
  max?: number;
  otherLabel?: string;
  /** Ordena de mayor a menor. Por defecto `true`. */
  sort?: boolean;
  formatValue?: ValueFormatter;
  formatPercent?: (ratio: number) => string;
  showPercent?: boolean;
  /** Token de color de las barras. Por defecto `var(--chart-1)`. */
  color?: string;
  /** `inline`: barra detrás de la etiqueta (compacto). `stacked`: etiqueta arriba, barra fina abajo. */
  variant?: 'inline' | 'stacked';
  /** Encabezados opcionales: [etiqueta, valor]. */
  header?: readonly [string, string];
  onItemClick?: (item: HBarItem) => void;
  emptyMessage?: string;
  ariaLabel?: string;
  animate?: boolean;
  className?: string;
}

/** Ranking de barras horizontales (categorías de gasto, servicios más vendidos). */
export function HBarList({
  items,
  max = 6,
  otherLabel = 'Otros',
  sort = true,
  formatValue = defaultFormatValue,
  formatPercent = defaultFormatPercent,
  showPercent = true,
  color = 'var(--chart-1)',
  variant = 'inline',
  header,
  onItemClick,
  emptyMessage = 'Sin datos en este periodo',
  ariaLabel,
  animate = true,
  className,
}: HBarListProps) {
  const reduced = useReducedMotion();
  const motionOn = animate && !reduced;
  const [hover, setHover] = useState<string | null>(null);

  const rows = useMemo(() => {
    const clean = items.filter((d) => d.value > 0);
    const sorted = sort ? [...clean].sort((a, b) => b.value - a.value) : clean;
    if (sorted.length <= max) return sorted;
    const head = sorted.slice(0, max - 1);
    const rest = sorted.slice(max - 1);
    return [
      ...head,
      {
        key: '__otros',
        label: otherLabel,
        value: rest.reduce((a, d) => a + d.value, 0),
        sublabel: `${rest.length} más`,
        color: 'var(--chart-8)',
      } as HBarItem,
    ];
  }, [items, sort, max, otherLabel]);

  const total = rows.reduce((a, d) => a + d.value, 0);
  const top = rows.reduce((a, d) => Math.max(a, d.value), 0);

  if (!rows.length) {
    return (
      <div className={[s.empty, className].filter(Boolean).join(' ')} role="status">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={className}>
      {header && (
        <div className={s.head} aria-hidden>
          <span>{header[0]}</span>
          <span>{header[1]}</span>
        </div>
      )}
      <ul className={[s.list, variant === 'stacked' ? s.stacked : ''].join(' ')} aria-label={ariaLabel}>
        {rows.map((d, i) => {
          const share = total ? d.value / total : 0;
          const w = top ? Math.max(0.6, (d.value / top) * 100) : 0;
          const c = d.color ?? color;
          const dim = hover != null && hover !== d.key;
          const delay = motionOn ? { animationDelay: `${i * 60}ms` } : undefined;
          const valueText = formatValue(d.value);
          const a11y = `${d.label}: ${valueText}${showPercent ? `, ${formatPercent(share)}` : ''}`;
          const Tag = onItemClick ? 'button' : 'div';
          const common = {
            onPointerEnter: () => setHover(d.key),
            onPointerLeave: () => setHover(null),
            onClick: onItemClick ? () => onItemClick(d) : undefined,
            'aria-label': onItemClick ? a11y : undefined,
          };
          return (
            <li key={d.key}>
              {variant === 'inline' ? (
                <Tag {...common} className={[s.row, dim ? s.dim : ''].join(' ')} type={onItemClick ? 'button' : undefined}>
                  <span
                    className={[s.fill, motionOn ? s.grow : ''].join(' ')}
                    style={{ width: `${w}%`, background: `color-mix(in srgb, ${c} 17%, transparent)`, ...delay }}
                    aria-hidden
                  />
                  <span className={s.label}>
                    {d.icon && <span className={s.icon}>{d.icon}</span>}
                    <span className={s.labelText}>{d.label}</span>
                    {d.sublabel && <span className={s.sub}>{d.sublabel}</span>}
                  </span>
                  <span className={s.value}>{valueText}</span>
                  {showPercent && <span className={s.pct}>{formatPercent(share)}</span>}
                </Tag>
              ) : (
                <Tag {...common} className={[s.srow, dim ? s.dim : ''].join(' ')} type={onItemClick ? 'button' : undefined}>
                  <span className={s.label}>
                    {d.icon && <span className={s.icon}>{d.icon}</span>}
                    <span className={s.labelText}>{d.label}</span>
                    {d.sublabel && <span className={s.sub}>{d.sublabel}</span>}
                  </span>
                  <span className={s.value}>{valueText}</span>
                  {showPercent ? <span className={s.pct}>{formatPercent(share)}</span> : <span />}
                  <span className={s.track} aria-hidden>
                    <span className={[s.fill, motionOn ? s.grow : ''].join(' ')} style={{ width: `${w}%`, background: c, ...delay }} />
                  </span>
                </Tag>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

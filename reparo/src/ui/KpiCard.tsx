import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';
import { Card } from './Card';
import { Skeleton } from './Skeleton';
import { cx } from './utils';
import styles from './KpiCard.module.css';

export type KpiTone = 'income' | 'expense' | 'profit' | 'pending' | 'brand' | 'neutral';

export interface KpiCardProps {
  label: ReactNode;
  /** Valor numérico (p. ej. centavos). */
  value: number;
  /** Formateador del valor (p. ej. (n) => formatMoney(n)). */
  format?: (n: number) => string;
  tone?: KpiTone;
  icon?: ReactNode;
  /**
   * Variación vs. período anterior como razón (0.124 = +12,4 %). null = sin dato.
   * Si no se pasa pero sí `previous`, se calcula.
   */
  delta?: number | null;
  /** Valor del período anterior (para calcular `delta`). */
  previous?: number;
  /** Invierte la semántica del color (en gastos, subir es malo). */
  invertDelta?: boolean;
  /** Texto tras el delta (por defecto "vs. período anterior"). */
  deltaLabel?: string;
  /** Slot para un sparkline (de @/charts). */
  sparkline?: ReactNode;
  /** Línea secundaria bajo el valor. */
  footer?: ReactNode;
  loading?: boolean;
  onClick?: () => void;
  href?: string;
  className?: string;
}

const pctFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 0 });

/** Formatea una razón como porcentaje con signo: 0.124 → "+12.4 %". */
export function formatDelta(delta: number): string {
  const pct = delta * 100;
  const abs = Math.abs(pct);
  const txt = abs >= 1000 ? '999+' : pctFormat.format(abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10);
  return `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${txt} %`;
}

/** Tarjeta de indicador: etiqueta, valor animado, delta semántico e ícono. */
export function KpiCard({
  label,
  value,
  format,
  tone = 'neutral',
  icon,
  delta: deltaProp,
  previous,
  invertDelta,
  deltaLabel = 'vs. período anterior',
  sparkline,
  footer,
  loading,
  onClick,
  href,
  className,
}: KpiCardProps) {
  const delta =
    deltaProp !== undefined ? deltaProp : previous !== undefined ? (previous === 0 ? (value === 0 ? 0 : null) : (value - previous) / Math.abs(previous)) : undefined;
  const dir = delta == null ? 0 : delta > 0.0005 ? 1 : delta < -0.0005 ? -1 : 0;
  const good = invertDelta ? dir < 0 : dir > 0;
  const deltaTone = dir === 0 ? 'flat' : good ? 'good' : 'bad';
  const DeltaIcon = dir > 0 ? ArrowUpRight : dir < 0 ? ArrowDownRight : Minus;

  return (
    <Card padding="none" className={cx(styles.kpi, styles[tone], className)} onClick={onClick} href={href} interactive={!!(onClick || href)}>
      <div className={styles.glow} aria-hidden />
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.labelRow}>
            {icon && <span className={styles.icon}>{icon}</span>}
            <span className={styles.label}>{label}</span>
          </div>
          {!loading && delta !== undefined && (
            <span className={cx(styles.delta, styles[deltaTone])} title={deltaLabel}>
              <DeltaIcon aria-hidden />
              {delta == null ? 'Nuevo' : formatDelta(delta)}
            </span>
          )}
        </div>
        {loading ? (
          <div className={styles.loading}>
            <Skeleton width="62%" height={30} radius={8} />
            <Skeleton width="40%" height={12} />
          </div>
        ) : (
          <>
            <div className={styles.value}>
              <AnimatedNumber value={value} format={format} />
            </div>
            {(footer || delta !== undefined) && (
              <div className={styles.footer}>
                {footer ?? <span className={styles.deltaLabel}>{deltaLabel}</span>}
              </div>
            )}
          </>
        )}
      </div>
      {sparkline && !loading && <div className={styles.spark}>{sparkline}</div>}
    </Card>
  );
}

import { formatMoney } from '@/data';
import { cx } from './utils';
import styles from './MoneyText.module.css';

export type MoneyTone = 'auto' | 'income' | 'expense' | 'profit' | 'pending' | 'neutral' | 'muted';

export interface MoneyTextProps {
  /** Monto en centavos. */
  cents: number;
  /**
   * Color: 'auto' colorea según el signo (positivo = ingreso, negativo = gasto),
   * 'neutral' usa el color de texto. Por defecto 'neutral'.
   */
  tone?: MoneyTone;
  /** Muestra el signo (+/−) explícito. */
  sign?: boolean;
  /** Formato compacto ("$12.5 k"). */
  compact?: boolean;
  /** Oculta los centavos. */
  noDecimals?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  weight?: 'regular' | 'medium' | 'semibold';
  /** Tachado (p. ej. monto anterior). */
  strike?: boolean;
  className?: string;
  currency?: string;
}

/** Monto con cifras tabulares y color semántico. */
export function MoneyText({ cents, tone = 'neutral', sign, compact, noDecimals, size, weight = 'medium', strike, className, currency }: MoneyTextProps) {
  const resolved = tone === 'auto' ? (cents > 0 ? 'income' : cents < 0 ? 'expense' : 'muted') : tone;
  const text = formatMoney(cents, { sign, compact, decimals: noDecimals ? false : undefined, currency });
  return <span className={cx(styles.money, styles[resolved], size && styles[size], styles[weight], strike && styles.strike, className)}>{text}</span>;
}

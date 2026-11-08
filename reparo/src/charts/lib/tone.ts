/** Tonos semánticos de Reparo → token CSS. */
export type ChartTone = 'brand' | 'income' | 'expense' | 'profit' | 'pending' | 'info' | 'neutral';

export const TONE_COLOR: Record<ChartTone, string> = {
  brand: 'var(--brand)',
  income: 'var(--income)',
  expense: 'var(--expense)',
  profit: 'var(--profit)',
  pending: 'var(--pending)',
  info: 'var(--info)',
  neutral: 'var(--text-3)',
};

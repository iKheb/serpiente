/* Héroe del panel: ganancia del mes, cobrado/gastado, meta y el teléfono 3D. */
import { useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowDownRight, ArrowUpRight, Minus, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { ProgressRing } from '@/charts';
import { formatDayMonth, formatPercent, useFormatters, type DateRange, type Settings } from '@/data';
import { AnimatedNumber, Skeleton, cx, formatDelta, useIsMobile, usePrefersReducedMotion } from '@/ui';
import { HeroDevice } from '@/three';
import { cumulative, ratio, type PeriodData } from './usePanelData';
import s from './Panel.module.css';

export function compareLabel(kind: 'week' | 'month', prev: DateRange): string {
  if (kind === 'month') {
    const last = prev.end - 1;
    const d = new Date(last).getDate();
    return d <= 1 ? `vs. ${formatDayMonth(last)}` : `vs. 1–${formatDayMonth(last)}`;
  }
  return 'vs. semana pasada al mismo corte';
}

export function DeltaPill({ value, invert, label }: { value: number | null | undefined; invert?: boolean; label?: string }) {
  if (value === undefined) return null;
  const dir = value == null ? 1 : value > 0.0005 ? 1 : value < -0.0005 ? -1 : 0;
  const good = invert ? dir < 0 : dir > 0;
  const tone = dir === 0 ? s.flat : good ? s.good : s.bad;
  const Icon = dir > 0 ? ArrowUpRight : dir < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cx(s.deltaPill, tone)} title={label}>
      <Icon aria-hidden />
      {value == null ? 'Nuevo' : formatDelta(value)}
    </span>
  );
}

interface HeroProps {
  month: PeriodData;
  settings: Settings | undefined;
  closedPrevious: number | undefined;
}

export function Hero({ month, settings, closedPrevious }: HeroProps) {
  const fmt = useFormatters();
  const isMobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  const { summary, previousSummary, series, todayIndex, period, previousToDate } = month;
  const goal = settings?.monthlyGoalCents ?? 0;
  const profit = summary?.gananciaCents ?? 0;
  const monthName = period.label.split(' ')[0];

  const trend = useMemo(() => {
    if (!series) return [];
    const upto = todayIndex >= 0 ? series.slice(0, todayIndex + 1) : series;
    const cum = cumulative(upto.map((p) => p.gananciaCents));
    return cum.length >= 2 ? cum.map((c) => c / 100) : [0, ...cum.map((c) => c / 100)];
  }, [series, todayIndex]);

  const delta = summary && previousSummary ? ratio(profit, previousSummary.gananciaCents) : undefined;
  const screen = useMemo(
    () => ({
      title: 'Ganancia del mes',
      value: fmt.money(profit),
      caption: period.label,
      trend,
      delta: delta === undefined || delta === null ? null : delta * 100,
    }),
    [fmt, profit, period.label, trend, delta],
  );

  const daysInMonth = Math.round((period.end - period.start) / 86_400_000);
  const dayOfMonth = todayIndex >= 0 ? todayIndex + 1 : daysInMonth;
  const remainingDays = Math.max(0, daysInMonth - dayOfMonth);
  const missing = Math.max(0, goal - profit);

  return (
    <motion.section
      className={s.hero}
      aria-labelledby="panel-hero-title"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className={s.heroGlow} aria-hidden />
      <div className={s.heroGrid} aria-hidden />
      <div className={s.heroMain}>
        <div className={s.heroEyebrow}>
          <span className={s.heroDot} aria-hidden />
          <h2 id="panel-hero-title">Ganancia de {monthName.toLowerCase()}</h2>
          <span className={s.heroEyebrowMeta}>
            día {dayOfMonth} de {daysInMonth}
          </span>
        </div>

        {summary ? (
          <div className={s.heroValueRow}>
            <AnimatedNumber value={profit} format={(n) => fmt.money(n)} duration={1100} className={cx(s.heroValue, profit < 0 && s.heroValueNeg)} />
            <div className={s.heroDelta}>
              <DeltaPill value={delta} label={compareLabel('month', previousToDate)} />
              <span className={s.muted}>{compareLabel('month', previousToDate)}</span>
            </div>
          </div>
        ) : (
          <div className={s.heroValueRow}>
            <Skeleton width={300} height={56} radius={12} />
          </div>
        )}

        <dl className={s.heroStats}>
          <HeroStat icon={<TrendingUp />} tone="income" label="Cobrado" value={summary?.cobradoCents} />
          <HeroStat icon={<TrendingDown />} tone="expense" label="Gastado" value={summary?.gastadoCents} />
          <HeroStat icon={<Wallet />} tone="pending" label="Por cobrar" value={summary?.porCobrarCents} />
          <div className={s.heroStat}>
            <dt>Margen</dt>
            <dd className="tabular-nums">{summary ? formatPercent(summary.margen) : '—'}</dd>
          </div>
        </dl>

        <div className={s.goalRow}>
          {goal > 0 ? (
            <>
              <ProgressRing
                value={Math.max(0, profit)}
                goal={goal}
                size={isMobile ? 76 : 84}
                thickness={8}
                tone={profit >= goal ? 'income' : 'brand'}
                ariaLabel={`Progreso hacia la meta mensual: ${formatPercent(goal ? profit / goal : 0)}`}
              />
              <div className={s.goalText}>
                <span className={s.goalTitle}>
                  <Target aria-hidden /> Meta del mes · {fmt.money(goal, { decimals: false })}
                </span>
                {profit >= goal ? (
                  <span className={s.goalSub}>¡Meta superada por {fmt.money(profit - goal, { decimals: false })}! Excelente mes.</span>
                ) : (
                  <span className={s.goalSub}>
                    Te faltan <strong>{fmt.money(missing, { decimals: false })}</strong>
                    {remainingDays > 0 ? (
                      <>
                        {' '}· necesitas {fmt.money(Math.ceil(missing / remainingDays), { decimals: false })}/día en los {remainingDays} días que quedan
                      </>
                    ) : null}
                  </span>
                )}
                {closedPrevious !== undefined && <span className={s.goalFoot}>El mes pasado cerró con {fmt.money(closedPrevious)} de ganancia</span>}
              </div>
            </>
          ) : (
            <div className={s.goalText}>
              <a href="#/ajustes" className={s.goalLink}>
                <Target aria-hidden /> Definir meta mensual
              </a>
              {closedPrevious !== undefined && <span className={s.goalFoot}>El mes pasado cerró con {fmt.money(closedPrevious)} de ganancia</span>}
            </div>
          )}
        </div>
      </div>

      <div className={s.heroDevice}>
        <HeroDevice screen={screen} variant={isMobile ? 'compact' : 'hero'} className={s.heroDeviceCanvas} />
      </div>
    </motion.section>
  );
}

function HeroStat({ icon, tone, label, value }: { icon: React.ReactNode; tone: 'income' | 'expense' | 'pending'; label: string; value: number | undefined }) {
  const fmt = useFormatters();
  return (
    <div className={cx(s.heroStat, s[`t-${tone}`])}>
      <dt>
        <span className={s.heroStatIcon} aria-hidden>
          {icon}
        </span>
        {label}
      </dt>
      <dd className="tabular-nums">{value === undefined ? <Skeleton width={90} height={18} /> : fmt.money(value)}</dd>
    </div>
  );
}

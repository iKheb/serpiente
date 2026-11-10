/* Panel principal (#/panel): ganancia, cobrado y gastado de la semana y del mes de un vistazo. */
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarDays, CalendarRange, Plus, Receipt } from 'lucide-react';
import { usePeriodHistory, useSettings, type PeriodKind } from '@/data';
import { Button, PageHeader, SegmentedControl, Skeleton, cx, useLocalState } from '@/ui';
import { useClock } from './useClock';
import { navigate } from '@/app/router';
import { Hero } from './Hero';
import { GettingStarted } from './GettingStarted';
import { FlowChart, FreshPeriodNote, InventoryAlert, PeriodKpis, Pipeline, ReadyList, ReceivableList, RecentActivity, SecondaryMetrics } from './Sections';
import { usePeriodData, useWorkshopData } from './usePanelData';
import s from './Panel.module.css';

function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Buenos días';
  if (hour >= 12 && hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function LiveDate() {
  const now = useClock(1000);
  const text = format(now, "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
  return (
    <span className={s.liveDate}>
      <time dateTime={new Date(now).toISOString()}>
        {text.charAt(0).toUpperCase() + text.slice(1)}
        <span className={s.liveSep} aria-hidden>
          ·
        </span>
        <span className="tabular-nums">{format(now, 'HH:mm:ss')}</span>
      </time>
    </span>
  );
}

const PERIOD_OPTIONS = [
  { value: 'week' as const, label: 'Semana', icon: <CalendarDays /> },
  { value: 'month' as const, label: 'Mes', icon: <CalendarRange /> },
];

export default function PanelPage() {
  const settings = useSettings();
  const now = useClock(30_000);
  const ws = settings?.weekStartsOn === 0 ? 0 : 1;
  const [kind, setKind] = useLocalState<PeriodKind>('reparo.panel.periodo', 'week');
  const periodKind: PeriodKind = kind === 'month' ? 'month' : 'week';

  const month = usePeriodData('month', now, ws);
  const period = usePeriodData(periodKind, now, ws);
  const history = usePeriodHistory('month', 2);
  const workshop = useWorkshopData(now);

  const owner = settings?.ownerName?.trim();
  const name = owner ? owner.split(/\s+/)[0] : settings?.businessName?.trim();
  const title = `${greeting(new Date(now).getHours())}${name ? `, ${name}` : ''}`;

  const header = (
    <PageHeader
      title={title}
      subtitle={<LiveDate />}
      actions={
        <>
          <Button variant="secondary" iconLeft={<Receipt />} onClick={() => navigate('#/gastos?nuevo=1')}>
            Registrar gasto
          </Button>
          <Button variant="primary" iconLeft={<Plus />} onClick={() => navigate('#/clientes?nuevo=1')}>
            Nuevo cliente
          </Button>
        </>
      }
    />
  );

  if (workshop.isLoading || !settings) {
    return (
      <div className={s.page}>
        {header}
        <Skeleton height={340} radius={20} />
        <div className={s.kpiGrid}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={150} radius={14} />
          ))}
        </div>
        <Skeleton height={360} radius={14} />
      </div>
    );
  }

  if (workshop.isEmpty) {
    return (
      <div className={s.page}>
        {header}
        <GettingStarted settings={settings} hasClients={(workshop.clients?.length ?? 0) > 0} hasInventory={workshop.hasInventory} />
      </div>
    );
  }

  return (
    <div className={s.page}>
      {header}
      <Hero month={month} settings={settings} closedPrevious={history?.[1]?.summary.gananciaCents} />

      <section className={s.block} aria-labelledby="panel-period-title">
        <div className={s.blockHead}>
          <div>
            <h2 id="panel-period-title" className={s.blockTitle}>
              {periodKind === 'week' ? 'Esta semana' : 'Este mes'}
            </h2>
            <p className={s.blockSub}>{period.period.label}</p>
          </div>
          <SegmentedControl aria-label="Periodo" value={periodKind} onChange={(v) => setKind(v)} options={PERIOD_OPTIONS} />
        </div>
        <FreshPeriodNote data={period} kind={periodKind} />
        <PeriodKpis data={period} kind={periodKind} />
        <SecondaryMetrics data={period} />
      </section>

      <div className={s.grid}>
        <div className={cx(s.span8, s.slotChart)}>
          <FlowChart data={period} kind={periodKind} />
        </div>
        <div className={cx(s.span4, s.slotSide)}>
          <div className={s.stack}>
            <div className={cx(s.slot, s.slotPipe)}>
              <Pipeline counts={workshop.statusCounts} />
            </div>
            <div className={cx(s.slot, s.slotInv)}>
              <InventoryAlert items={workshop.reorderItems} stats={workshop.inventoryStats} />
            </div>
          </div>
        </div>

        <div className={cx(s.span6, s.slotReady)}>
          <ReadyList ready={workshop.ready} now={now} />
        </div>
        <div className={cx(s.span6, s.slotRecv)}>
          <ReceivableList receivable={workshop.receivable} total={workshop.receivableTotal} />
        </div>

        <div className={cx(s.span12, s.slotAct)}>
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}

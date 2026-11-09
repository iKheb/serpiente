/* Estado vacío del panel: primeros pasos + datos de ejemplo. */
import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Bell, Check, DatabaseBackup, Package, Sparkles, UserPlus } from 'lucide-react';
import { seedDemoData, type Settings } from '@/data';
import { Button, ProgressBar, confirm, cx, toast, usePrefersReducedMotion } from '@/ui';
import { HeroDevice } from '@/three';
import s from './Panel.module.css';

interface Step {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  done: boolean;
}

export function GettingStarted({ settings, hasClients, hasInventory }: { settings: Settings | undefined; hasClients: boolean; hasInventory: boolean }) {
  const reduced = usePrefersReducedMotion();
  const [seeding, setSeeding] = useState(false);
  const steps: Step[] = [
    {
      key: 'cliente',
      title: 'Registra tu primer cliente',
      description: 'Equipo, falla, cobro y patrón de desbloqueo en un solo formulario.',
      href: '#/clientes?nuevo=1',
      icon: <UserPlus />,
      done: hasClients,
    },
    {
      key: 'inventario',
      title: 'Agrega repuestos a tu inventario',
      description: 'Te avisamos cuando una pieza llegue a su mínimo.',
      href: '#/inventario?nuevo=1',
      icon: <Package />,
      done: hasInventory,
    },
    {
      key: 'notificaciones',
      title: 'Activa las notificaciones',
      description: 'Equipos listos sin entregar, saldos pendientes y stock bajo.',
      href: '#/ajustes',
      icon: <Bell />,
      done: !!settings?.notificationsEnabled,
    },
    {
      key: 'respaldo',
      title: 'Haz tu primer respaldo',
      description: 'Tus datos viven en este dispositivo; guarda una copia segura.',
      href: '#/ajustes',
      icon: <DatabaseBackup />,
      done: !!settings?.lastBackupAt,
    },
  ];
  const done = steps.filter((x) => x.done).length;

  const seed = async () => {
    const ok = await confirm({
      title: '¿Cargar datos de ejemplo?',
      description: 'Se cargarán unos 90 días de clientes, gastos e inventario ficticios para que explores Reparo. Podrás borrarlos después desde Ajustes.',
      confirmLabel: 'Cargar datos de ejemplo',
      tone: 'brand',
      icon: <Sparkles />,
    });
    if (!ok) return;
    setSeeding(true);
    try {
      await seedDemoData();
      toast.success('Datos de ejemplo cargados');
    } catch {
      toast.error('No se pudieron cargar los datos de ejemplo');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <motion.section
      className={s.onboard}
      aria-labelledby="panel-start-title"
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className={s.heroGlow} aria-hidden />
      <div className={s.heroGrid} aria-hidden />
      <div className={s.onboardMain}>
        <span className={s.kicker}>
          <Sparkles aria-hidden /> Primeros pasos
        </span>
        <h2 id="panel-start-title" className={s.onboardTitle}>
          Tu taller, en orden desde hoy
        </h2>
        <p className={s.onboardLead}>
          Aquí verás cuánto cobraste, cuánto gastaste y qué ganancia te queda cada semana y cada mes. Completa estos pasos para empezar.
        </p>
        <div className={s.onboardProgress}>
          <ProgressBar value={done} max={steps.length} tone="brand" size="sm" label="Progreso" valueLabel={`${done} de ${steps.length}`} />
        </div>
        <ol className={s.steps}>
          {steps.map((st, i) => (
            <li key={st.key}>
              <a href={st.href} className={cx(s.step, st.done && s.stepDone)}>
                <span className={s.stepIcon} aria-hidden>
                  {st.done ? <Check /> : st.icon}
                </span>
                <span className={s.rowMain}>
                  <span className={s.stepTitle}>
                    <span className="sr-only">Paso {i + 1}: </span>
                    {st.title}
                    {st.done && <span className="sr-only"> (completado)</span>}
                  </span>
                  <span className={s.rowSub}>{st.description}</span>
                </span>
                <ArrowRight className={s.stepArrow} aria-hidden />
              </a>
            </li>
          ))}
        </ol>
        <div className={s.onboardActions}>
          <Button variant="primary" iconLeft={<UserPlus />} onClick={() => (location.hash = '#/clientes?nuevo=1')}>
            Registrar primer cliente
          </Button>
          <Button variant="secondary" iconLeft={<Sparkles />} loading={seeding} onClick={seed}>
            Explorar con datos de ejemplo
          </Button>
        </div>
      </div>
      <div className={s.heroDevice}>
        <HeroDevice
          className={s.heroDeviceCanvas}
          screen={{ title: 'Ganancia del mes', value: 'Tu negocio', caption: 'empieza aquí', trend: [1, 1.4, 1.2, 1.9, 2.3, 2.1, 2.8, 3.4] }}
        />
      </div>
    </motion.section>
  );
}

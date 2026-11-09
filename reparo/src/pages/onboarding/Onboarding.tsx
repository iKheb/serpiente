/* Bienvenida inicial (pantalla completa mientras settings.onboarded === false). */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  Boxes,
  Check,
  CircleCheck,
  FlaskConical,
  PackageX,
  Sparkles,
  Smartphone,
  Store,
  TrendingUp,
  User,
  Users,
  WifiOff,
} from 'lucide-react';
import { BRAND_NAME } from '@/app/brand';
import { CURRENCIES, formatMoney, seedDemoData, updateSettings, useSettings, ValidationError } from '@/data';
import { useNotificationPermission } from '@/pwa';
import { BrandMark } from '@/shell/BrandMark';
import { OnboardingScene } from '@/three';
import { Button, Input, Select, cx, toast, useIsMobile, usePrefersReducedMotion } from '@/ui';
import { COUNTRIES, COUNTRY_CURRENCY, COUNTRY_OPTIONS, countryFor, rememberCountry } from '../ajustes/shared';
import styles from './Onboarding.module.css';

const STEPS = ['Bienvenida', 'Tu negocio', 'Notificaciones', 'Empezar'] as const;
const DEFAULT_NAME = 'Mi Servicio Técnico';
const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: c.label }));

type Start = 'cero' | 'demo';

export default function Onboarding() {
  const settings = useSettings();
  const mobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  const { permission, request, supported } = useNotificationPermission();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [name, setName] = useState('');
  const [owner, setOwner] = useState('');
  const [currency, setCurrency] = useState('MXN');
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [country, setCountry] = useState('MX');
  const [nameError, setNameError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [start, setStart] = useState<Start>('cero');
  const [finishing, setFinishing] = useState(false);
  const loaded = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Precarga lo que ya hubiera en los ajustes (p. ej. tras borrar los datos).
  useEffect(() => {
    if (!settings || loaded.current) return;
    loaded.current = true;
    if (settings.businessName && settings.businessName !== DEFAULT_NAME) setName(settings.businessName);
    setOwner(settings.ownerName);
    setCurrency(settings.currency);
    setCountry(countryFor(settings.phoneCountryCode)?.iso ?? 'MX');
  }, [settings]);

  // Foco al cambiar de paso: primer campo en "Tu negocio", título en el resto.
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    const t = setTimeout(() => {
      if (step === 1) nameRef.current?.focus();
      else headingRef.current?.focus({ preventScroll: true });
    }, 260);
    return () => clearTimeout(t);
  }, [step]);

  const go = (n: number) => {
    setDir(n > step ? 1 : -1);
    setStep(Math.max(0, Math.min(STEPS.length - 1, n)));
  };

  const saveBusiness = async (): Promise<boolean> => {
    if (!name.trim()) {
      setNameError('Escribe el nombre de tu negocio');
      nameRef.current?.focus();
      return false;
    }
    const c = COUNTRIES.find((x) => x.iso === country);
    const cur = CURRENCIES.find((x) => x.code === currency);
    try {
      await updateSettings({
        businessName: name.trim(),
        ownerName: owner.trim(),
        currency,
        locale: cur?.locale ?? 'es-MX',
        phoneCountryCode: c?.code ?? '52',
      });
      if (c) rememberCountry(c.iso);
      return true;
    } catch (e) {
      if (e instanceof ValidationError) setNameError(e.fields.businessName ?? Object.values(e.fields)[0] ?? null);
      return false;
    }
  };

  const next = async (e?: FormEvent) => {
    e?.preventDefault();
    if (step === 1 && !(await saveBusiness())) return;
    if (step === STEPS.length - 1) return finish();
    go(step + 1);
  };

  const finish = async () => {
    setFinishing(true);
    try {
      if (start === 'demo') await seedDemoData();
      const c = COUNTRIES.find((x) => x.iso === country);
      const cur = CURRENCIES.find((x) => x.code === currency);
      await updateSettings({
        businessName: name.trim() || DEFAULT_NAME,
        ownerName: owner.trim(),
        currency,
        locale: cur?.locale ?? 'es-MX',
        phoneCountryCode: c?.code ?? '52',
        notificationsEnabled: true,
        onboarded: true,
      });
      toast({
        title: owner.trim() ? `¡Bienvenido, ${owner.trim().split(' ')[0]}!` : '¡Todo listo!',
        description: start === 'demo' ? 'Cargamos un taller de ejemplo para que explores. Puedes borrarlo en Ajustes → Datos.' : 'Registra tu primer cliente con la tecla C.',
        tone: 'success',
      });
    } catch {
      setFinishing(false);
      toast({ title: 'No se pudo terminar la configuración', description: 'Inténtalo de nuevo.', tone: 'danger' });
    }
  };

  const enableNotifications = async () => {
    setAsking(true);
    const r = await request();
    setAsking(false);
    if (r === 'granted') setTimeout(() => go(3), 700);
  };

  const pickCountry = (iso: string) => {
    setCountry(iso);
    const suggested = COUNTRY_CURRENCY[iso];
    if (!currencyTouched && suggested && CURRENCIES.some((c) => c.code === suggested)) setCurrency(suggested);
  };

  const variants = {
    enter: (d: number) => ({ opacity: 0, x: reduced ? 0 : d * 28, filter: reduced ? 'none' : 'blur(4px)' }),
    center: { opacity: 1, x: 0, filter: 'blur(0px)' },
    exit: (d: number) => ({ opacity: 0, x: reduced ? 0 : d * -20, filter: reduced ? 'none' : 'blur(4px)' }),
  };

  const heading = (text: ReactNode, sub?: ReactNode) => (
    <div className={styles.head}>
      <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
        {text}
      </h1>
      {sub && <p className={styles.lead}>{sub}</p>}
    </div>
  );

  const granted = permission === 'granted';
  const primaryLabel = step === 0 ? 'Comenzar' : step === STEPS.length - 1 ? 'Entrar a Reparo' : 'Continuar';

  return (
    <div className={styles.root} data-step={step}>
      <div className={styles.bg} aria-hidden>
        <span className={styles.blobA} />
        <span className={styles.blobB} />
        <span className={styles.blobC} />
        <span className={styles.grid} />
      </div>

      <div className={styles.scene} data-step={step}>
        <OnboardingScene stage={step} />
      </div>

      <div className={styles.column}>
        <header className={styles.top}>
          <div className={styles.brand}>
            <BrandMark size={26} />
            <span>{BRAND_NAME}</span>
          </div>
          <div className={styles.progress} role="progressbar" aria-label="Progreso de la configuración" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-valuetext={`Paso ${step + 1} de ${STEPS.length}: ${STEPS[step]}`}>
            {STEPS.map((s, i) => (
              <span key={s} className={styles.seg}>
                <motion.span className={styles.segFill} initial={false} animate={{ scaleX: i <= step ? 1 : 0 }} transition={{ duration: reduced ? 0 : 0.42, ease: [0.16, 1, 0.3, 1] }} />
              </span>
            ))}
          </div>
          <span className={styles.stepLabel}>
            {step + 1}/{STEPS.length}
          </span>
        </header>

        <form className={styles.panel} onSubmit={next} noValidate>
          <div className={styles.stage}>
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.div
                key={step}
                custom={dir}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: reduced ? 0.12 : 0.32, ease: [0.16, 1, 0.3, 1] }}
                className={styles.step}
              >
                {step === 0 && (
                  <>
                    <div className={styles.hero}>
                      <motion.div
                        className={styles.mark}
                        initial={reduced ? false : { scale: 0.6, opacity: 0, rotate: -8 }}
                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
                      >
                        <BrandMark size={mobile ? 52 : 64} animated={!reduced} />
                      </motion.div>
                      <h1 ref={headingRef} tabIndex={-1} className={styles.wordmark}>
                        {BRAND_NAME}
                      </h1>
                      <p className={styles.lead}>La gestión de tu servicio técnico de celulares, clara, rápida y siempre a la mano.</p>
                    </div>
                    <ul className={styles.points}>
                      {[
                        { icon: Users, t: 'Clientes y equipos', d: 'Cada reparación con folio, estado, fotos, desbloqueo y recibo por WhatsApp.' },
                        { icon: Boxes, t: 'Inventario y gastos', d: 'Repuestos con stock mínimo, compras y lo que usaste en cada equipo.' },
                        { icon: TrendingUp, t: 'Ganancias claras', d: 'Cobrado, gastado y ganancia por semana y por mes, sin hojas de cálculo.' },
                      ].map((p, i) => (
                        <motion.li
                          key={p.t}
                          className={styles.point}
                          initial={reduced ? false : { opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, delay: 0.25 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                        >
                          <span className={styles.pointIcon}>
                            <p.icon aria-hidden />
                          </span>
                          <span>
                            <strong>{p.t}</strong>
                            <span>{p.d}</span>
                          </span>
                        </motion.li>
                      ))}
                    </ul>
                    <div className={styles.offline}>
                      <WifiOff aria-hidden />
                      <span>
                        <strong>Funciona sin internet.</strong> Tus datos viven en este dispositivo.
                      </span>
                    </div>
                  </>
                )}

                {step === 1 && (
                  <>
                    {heading('Tu negocio', 'Así aparecerá en tus recibos y reportes. Puedes cambiarlo cuando quieras en Ajustes.')}
                    <div className={styles.fields}>
                      <Input
                        ref={nameRef}
                        label="Nombre del negocio"
                        required
                        size="lg"
                        prefix={<Store />}
                        value={name}
                        onValueChange={(v) => {
                          setName(v);
                          if (nameError) setNameError(null);
                        }}
                        error={nameError}
                        placeholder="Ej. CelFix Reparaciones"
                        autoComplete="organization"
                        maxLength={120}
                      />
                      <Input label="Tu nombre" optional size="lg" prefix={<User />} value={owner} onValueChange={setOwner} placeholder="Ej. Ana López" autoComplete="name" maxLength={120} />
                      <div className={styles.pair}>
                        <Select label="País (WhatsApp)" value={country} options={COUNTRY_OPTIONS} onChange={pickCountry} size="lg" />
                        <Select
                          label="Moneda"
                          value={currency}
                          options={CURRENCY_OPTIONS}
                          onChange={(v) => {
                            setCurrency(v);
                            setCurrencyTouched(true);
                          }}
                          size="lg"
                          hint={`Ejemplo: ${formatMoney(125050, { currency, locale: CURRENCIES.find((c) => c.code === currency)?.locale })}`}
                        />
                      </div>
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    {heading('No se te escapa nada', 'Reparo te avisa cuando un repuesto se agota, un equipo lleva días listo o hay saldo por cobrar.')}
                    <div className={styles.notifs} aria-hidden>
                      {[
                        { icon: PackageX, tone: 'danger', t: 'Stock bajo', b: 'Batería Galaxy A52 · quedan 1' },
                        { icon: Smartphone, tone: 'success', t: 'Equipo listo para entregar', b: 'Ana López · iPhone 13 · hace 3 días' },
                        { icon: TrendingUp, tone: 'brand', t: 'Resumen del día', b: `Ganancia ${formatMoney(342000, { currency })}` },
                      ].map((n, i) => (
                        <motion.div
                          key={n.t}
                          className={styles.notif}
                          initial={reduced ? false : { opacity: 0, y: -12, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 30, delay: 0.15 + i * 0.12 }}
                        >
                          <span className={styles.notifIcon} data-tone={n.tone}>
                            <n.icon />
                          </span>
                          <span className={styles.notifText}>
                            <strong>{n.t}</strong>
                            <span>{n.b}</span>
                          </span>
                          <span className={styles.notifTime}>{i === 0 ? 'ahora' : i === 1 ? '9:41' : '20:00'}</span>
                        </motion.div>
                      ))}
                    </div>
                    {granted ? (
                      <div className={styles.granted} role="status">
                        <CircleCheck aria-hidden /> Notificaciones activadas
                      </div>
                    ) : permission === 'denied' ? (
                      <p className={styles.note}>Las notificaciones están bloqueadas en este navegador. Puedes permitirlas después desde el candado junto a la dirección; mientras tanto verás los avisos dentro de Reparo.</p>
                    ) : !supported ? (
                      <p className={styles.note}>Este navegador no muestra notificaciones del sistema. Verás los avisos dentro de Reparo.</p>
                    ) : (
                      <p className={styles.note}>Funcionan sin internet. Las puedes ajustar o apagar en cualquier momento.</p>
                    )}
                  </>
                )}

                {step === 3 && (
                  <>
                    {heading('¿Cómo quieres empezar?', 'Elige una opción. Podrás cargar o borrar los datos de ejemplo desde Ajustes.')}
                    <div role="radiogroup" aria-label="Cómo empezar" className={styles.choices}>
                      {(
                        [
                          { v: 'cero', icon: Sparkles, t: 'Empezar desde cero', d: 'Un taller en blanco, listo para registrar tu primer cliente.' },
                          { v: 'demo', icon: FlaskConical, t: 'Explorar con datos de ejemplo', d: '~90 días de un taller ficticio: clientes, inventario, gastos y reportes.' },
                        ] as const
                      ).map((o) => {
                        const on = start === o.v;
                        return (
                          <button
                            key={o.v}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            tabIndex={on ? 0 : -1}
                            className={cx(styles.choice, on && styles.choiceOn)}
                            onClick={() => setStart(o.v)}
                            onKeyDown={(e) => {
                              if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                                e.preventDefault();
                                const nv: Start = start === 'cero' ? 'demo' : 'cero';
                                setStart(nv);
                                const sib = (e.currentTarget.parentElement?.querySelectorAll('button') ?? [])[nv === 'cero' ? 0 : 1] as HTMLButtonElement | undefined;
                                sib?.focus();
                              }
                            }}
                          >
                            <span className={styles.choiceIcon}>
                              <o.icon aria-hidden />
                            </span>
                            <span className={styles.choiceText}>
                              <strong>{o.t}</strong>
                              <span>{o.d}</span>
                            </span>
                            <span className={cx(styles.radio, on && styles.radioOn)} aria-hidden>
                              {on && <Check />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className={styles.actions}>
            {step > 0 ? (
              <Button type="button" variant="ghost" size="lg" iconLeft={<ArrowLeft />} onClick={() => go(step - 1)} disabled={finishing}>
                Atrás
              </Button>
            ) : (
              <span />
            )}
            <div className={styles.actionsRight}>
              {step === 2 && !granted && supported && permission !== 'denied' && (
                <Button type="button" variant="ghost" size="lg" onClick={() => go(3)}>
                  Ahora no
                </Button>
              )}
              {step === 2 && !granted && supported && permission !== 'denied' ? (
                <Button type="button" variant="primary" size="lg" iconLeft={<BellRing />} loading={asking} onClick={enableNotifications}>
                  Activar
                </Button>
              ) : (
                <Button type="submit" variant="primary" size="lg" iconRight={<ArrowRight />} loading={finishing} className={styles.cta}>
                  {primaryLabel}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

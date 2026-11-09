/* Bienvenida: "¿Ya usas Reparo en otro dispositivo?" → conectar proyecto
   (código o URL + clave, salvo que venga en el build) + correo y contraseña
   → restoreFromCloud → onDone. */
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CloudDownload, PartyPopper } from 'lucide-react';
import { Badge, Button, usePrefersReducedMotion } from '@/ui';
import { cloudSignIn, getCloudAuth } from '../client';
import { useCloudConfig } from '../config';
import { connectCloudProject, restoreFromCloud } from '../sync';
import { AccountFields, ForgotPassword, Notice, ProjectFields, emptyProjectDraft, resolveProjectDraft, type ProjectDraft } from './parts';
import styles from './Cloud.module.css';

export interface CloudOnboardingStepProps {
  /** Se llama tras traer los datos (la app ya quedó lista: onboarded = true). */
  onDone(): void;
  /** El usuario prefiere empezar de cero en este dispositivo. */
  onSkip(): void;
}

type Phase = 'form' | 'restoring' | 'done';

export function CloudOnboardingStep({ onDone, onSkip }: CloudOnboardingStepProps) {
  const cfg = useCloudConfig();
  const reduced = usePrefersReducedMotion();
  const builtIn = cfg.builtIn;
  const [draft, setDraft] = useState<ProjectDraft>(() => emptyProjectDraft('code'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<{ clients: number; expenses: number; inventory: number } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    setError(null);
    const project = builtIn ? null : resolveProjectDraft(draft).config;
    if (!builtIn && !project) return;
    setBusy(true);
    try {
      if (project) await connectCloudProject(project);
      if (!getCloudAuth().userId || getCloudAuth().email !== email.trim().toLowerCase()) await cloudSignIn(email, password);
      setPhase('restoring');
      const r = await restoreFromCloud();
      setCounts(r);
      setPhase('done');
    } catch (err) {
      setPhase('form');
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const anim = reduced
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const } };

  return (
    <div className={styles.onboarding}>
      <AnimatePresence mode="wait" initial={false}>
        {phase === 'done' ? (
          <motion.div key="done" {...anim} className={styles.successBox} role="status">
            <span className={styles.successIcon} aria-hidden>
              <PartyPopper />
            </span>
            <h2 className={styles.obTitle}>¡Tus datos ya están aquí!</h2>
            {counts && (
              <div className={styles.counts}>
                <Badge tone="brand">{counts.clients.toLocaleString('es')} clientes</Badge>
                <Badge tone="expense">{counts.expenses.toLocaleString('es')} gastos</Badge>
                <Badge tone="info">{counts.inventory.toLocaleString('es')} repuestos</Badge>
              </div>
            )}
            <p className={styles.obLead}>De ahora en adelante este dispositivo se sincroniza solo. Las fotos de evidencia se quedan en el dispositivo donde se tomaron.</p>
            <Button variant="primary" size="lg" onClick={onDone} autoFocus>
              Entrar a Reparo
            </Button>
          </motion.div>
        ) : (
          <motion.form key="form" {...anim} onSubmit={submit} noValidate className={styles.root} aria-busy={busy || undefined}>
            <div>
              <h2 className={styles.obTitle}>¿Ya usas Reparo en otro dispositivo?</h2>
              <p className={styles.obLead}>Inicia sesión para traer tus datos: clientes, gastos, inventario y los datos de tu negocio.</p>
            </div>

            {!builtIn && (
              <div className={styles.panel}>
                <div>
                  <h3 className={styles.panelTitle}>Proyecto</h3>
                  <p className={styles.panelDesc}>Lo más fácil: copia el código de conexión desde Ajustes → Nube en tu computadora.</p>
                </div>
                <ProjectFields draft={draft} onChange={setDraft} showErrors={showErrors} disabled={busy} />
              </div>
            )}

            <div className={styles.panel}>
              {!builtIn && (
                <div>
                  <h3 className={styles.panelTitle}>Tu cuenta</h3>
                  <p className={styles.panelDesc}>El mismo correo y contraseña que usaste en tu otro dispositivo.</p>
                </div>
              )}
              <AccountFields mode="signin" email={email} password={password} onEmail={setEmail} onPassword={setPassword} showErrors={showErrors} disabled={busy} />
              <div className={styles.actions}>
                <ForgotPassword email={email} />
              </div>
            </div>

            {phase === 'restoring' && (
              <Notice tone="info" icon={<CloudDownload aria-hidden />} title="Descargando tus datos…" live>
                Puede tardar unos segundos si tienes muchos registros. No cierres la app.
              </Notice>
            )}
            {error && (
              <Notice tone="danger" live>
                {error}
              </Notice>
            )}

            <div className={styles.actions}>
              <Button variant="ghost" onClick={onSkip} disabled={busy}>
                No, empezar de cero
              </Button>
              <span className={styles.spacer} />
              <Button type="submit" variant="primary" size="lg" loading={busy} iconLeft={<CloudDownload size={18} />}>
                Traer mis datos
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

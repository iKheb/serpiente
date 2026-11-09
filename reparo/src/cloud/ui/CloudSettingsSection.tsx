/* Ajustes → Nube: conectar el proyecto de Supabase, crear cuenta / iniciar
   sesión y ver el estado de la sincronización. */
import { useState } from 'react';
import { Cloud, CloudOff, LogOut, Pencil, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge, Button, DateTimeText, SegmentedControl, confirm, toast, type BadgeTone } from '@/ui';
import { cloudSignIn, cloudSignOut, cloudSignUp, useCloudAuth } from '../client';
import { clearCloudConfig, useCloudConfig } from '../config';
import { cloudSyncNow, connectCloudProject, useCloudStatus, type CloudState } from '../sync';
import {
  AccountFields,
  CloudGuide,
  ConnectionCodePanel,
  ForgotPassword,
  NewPasswordPanel,
  Notice,
  ProjectFields,
  Steps,
  emptyProjectDraft,
  resolveProjectDraft,
  type AuthMode,
  type ProjectDraft,
} from './parts';
import styles from './Cloud.module.css';

const STATE: Record<CloudState, { label: string; tone: BadgeTone }> = {
  off: { label: 'Desconectada', tone: 'neutral' },
  idle: { label: 'Al día', tone: 'success' },
  syncing: { label: 'Sincronizando…', tone: 'info' },
  error: { label: 'Con error', tone: 'danger' },
  offline: { label: 'Sin conexión', tone: 'warning' },
};

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/* -------------------------------- Proyecto ------------------------------- */

function ProjectStep({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState<ProjectDraft>(() => emptyProjectDraft('manual'));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { config } = resolveProjectDraft(draft);
    if (!config) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await connectCloudProject(config);
      toast({ title: 'Proyecto conectado', description: hostOf(config.url), tone: 'success' });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className={styles.panel} onSubmit={save} noValidate>
      <div>
        <h3 className={styles.panelTitle}>1. Conecta tu proyecto de Supabase</h3>
        <p className={styles.panelDesc}>Pega la URL y la clave pública de tu proyecto, o el código de conexión de otro dispositivo donde ya usas Reparo.</p>
      </div>
      <ProjectFields draft={draft} onChange={setDraft} showErrors={showErrors} disabled={saving} />
      {error && (
        <Notice tone="danger" live>
          {error}
        </Notice>
      )}
      <div className={styles.actionsEnd}>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        )}
        <Button type="submit" variant="primary" loading={saving}>
          Guardar y continuar
        </Button>
      </div>
    </form>
  );
}

/* --------------------------------- Cuenta -------------------------------- */

function AccountStep({ step }: { step: string }) {
  const [mode, setMode] = useState<AuthMode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup') {
        const r = await cloudSignUp(email, password);
        if (r.needsConfirmation) {
          setConfirmSent(email.trim());
          setMode('signin');
          return;
        }
      } else {
        await cloudSignIn(email, password);
      }
      toast({ title: mode === 'signup' ? 'Cuenta creada' : 'Sesión iniciada', description: 'Sincronizando tus datos…', tone: 'success' });
      cloudSyncNow().catch(() => undefined);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.panel} onSubmit={submit} noValidate>
      <div className={styles.panelHead}>
        <div>
          <h3 className={styles.panelTitle}>{step}</h3>
          <p className={styles.panelDesc}>
            {mode === 'signup'
              ? 'Crea tu cuenta en esta computadora. En tus otros dispositivos inicia sesión con el mismo correo y contraseña.'
              : 'Usa el mismo correo y contraseña de tus otros dispositivos.'}
          </p>
        </div>
      </div>
      <SegmentedControl
        aria-label="Tipo de acceso"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
          setShowErrors(false);
        }}
        fullWidth
        options={[
          { value: 'signup', label: 'Crear cuenta' },
          { value: 'signin', label: 'Iniciar sesión' },
        ]}
      />
      {confirmSent && (
        <Notice tone="info" title="Confirma tu correo" live>
          Enviamos un enlace a {confirmSent}. Ábrelo (revisa también "Spam") y luego inicia sesión aquí. Para evitar este paso, desactiva "Confirm email" en Supabase.
        </Notice>
      )}
      <AccountFields mode={mode} email={email} password={password} onEmail={setEmail} onPassword={setPassword} showErrors={showErrors} disabled={busy} />
      {error && (
        <Notice tone="danger" live>
          {error}
        </Notice>
      )}
      <div className={styles.actions}>
        {mode === 'signin' && <ForgotPassword email={email} />}
        <span className={styles.spacer} />
        <Button type="submit" variant="primary" loading={busy}>
          {mode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'}
        </Button>
      </div>
      <Notice tone="brand" icon={<ShieldCheck aria-hidden />}>
        Los datos de este dispositivo se combinan con los de la nube: si un registro se cambió en dos lugares, gana el cambio más reciente.
      </Notice>
    </form>
  );
}

/* --------------------------------- Estado -------------------------------- */

function StatusPanel() {
  const status = useCloudStatus();
  const [busy, setBusy] = useState(false);
  const st = STATE[status.state];

  const syncNow = async () => {
    setBusy(true);
    try {
      const r = await cloudSyncNow();
      toast({ title: 'Sincronización completa', description: `${r.pushed} enviados · ${r.pulled} recibidos`, tone: 'success' });
    } catch (e) {
      toast({ title: 'No se pudo sincronizar', description: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const ok = await confirm({
      title: '¿Cerrar sesión en este dispositivo?',
      description: 'Tus datos se quedan guardados aquí y en la nube, pero este dispositivo dejará de sincronizar hasta que vuelvas a iniciar sesión.',
      confirmLabel: 'Cerrar sesión',
    });
    if (!ok) return;
    await cloudSignOut().catch(() => undefined);
    toast({ title: 'Sesión cerrada', tone: 'neutral' });
  };

  return (
    <section className={styles.panel} aria-labelledby="cloud-status-title">
      <div className={styles.panelHead}>
        <div>
          <h3 id="cloud-status-title" className={styles.panelTitle}>
            Sincronización
          </h3>
          <p className={styles.panelDesc}>Se sincroniza sola al abrir la app, al volver internet, cada minuto y unos segundos después de cada cambio.</p>
        </div>
        <Badge tone={st.tone} dot pulse={status.state === 'syncing'}>
          {st.label}
        </Badge>
      </div>

      <div className={styles.statusGrid}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Cuenta</span>
          <span className={styles.statValue}>{status.email ?? '—'}</span>
        </div>
        <div className={styles.stat} aria-live="polite">
          <span className={styles.statLabel}>Última sincronización</span>
          <span className={styles.statValue}>{status.lastSyncAt ? <DateTimeText value={status.lastSyncAt} /> : 'Todavía no'}</span>
          {status.lastSyncAt && (
            <span className={styles.statSub}>
              <DateTimeText value={status.lastSyncAt} variant="relative" muted />
            </span>
          )}
        </div>
      </div>

      {status.state === 'error' && status.error && (
        <Notice tone="danger" title="No se pudo sincronizar" live>
          {status.error}
        </Notice>
      )}
      {status.state === 'offline' && (
        <Notice tone="warning" icon={<CloudOff aria-hidden />} live>
          Sin internet. Puedes seguir trabajando: los cambios se enviarán al volver la conexión.
        </Notice>
      )}

      <div className={styles.actions}>
        <Button variant="primary" iconLeft={<RefreshCw size={16} />} onClick={syncNow} loading={busy || status.state === 'syncing'}>
          Sincronizar ahora
        </Button>
        <span className={styles.spacer} />
        <Button variant="ghost" iconLeft={<LogOut size={16} />} onClick={signOut}>
          Cerrar sesión
        </Button>
      </div>
    </section>
  );
}

/* -------------------------------- Sección -------------------------------- */

/** Sección completa de Ajustes → Nube. */
export function CloudSettingsSection() {
  const cfg = useCloudConfig();
  const auth = useCloudAuth();
  const status = useCloudStatus();
  const [editingProject, setEditingProject] = useState(false);

  const builtIn = cfg.builtIn;
  const hasProject = !!cfg.config && !editingProject;
  const steps = builtIn ? ['Cuenta', 'Sincronización'] : ['Proyecto', 'Cuenta', 'Sincronización'];
  const current = !hasProject ? 0 : !status.signedIn ? (builtIn ? 0 : 1) : steps.length - 1;
  const done = status.signedIn;

  const forgetProject = async () => {
    const ok = await confirm({
      title: '¿Desconectar este proyecto?',
      description: 'Se cerrará la sesión y este dispositivo dejará de sincronizar. Los datos guardados aquí y en Supabase no se borran.',
      confirmLabel: 'Desconectar',
      tone: 'danger',
    });
    if (!ok) return;
    await cloudSignOut().catch(() => undefined);
    await clearCloudConfig();
    toast({ title: 'Proyecto desconectado', tone: 'neutral' });
  };

  return (
    <div className={styles.root}>
      <div className={styles.hero}>
        <span className={styles.heroIcon} aria-hidden>
          <Cloud />
        </span>
        <div className={styles.heroText}>
          <h2 className={styles.heroTitle}>Tus datos en todos tus dispositivos</h2>
          <p className={styles.heroBody}>
            {builtIn
              ? 'Inicia sesión y la PC y el celular verán los mismos clientes, gastos, inventario y datos del negocio, automáticamente.'
              : 'Tus datos se guardan en tu propio proyecto de Supabase (plan gratis). La PC y el celular verán los mismos clientes, gastos, inventario y datos del negocio, automáticamente.'}{' '}
            Reparo sigue funcionando sin internet.
          </p>
        </div>
      </div>

      {!done && <Steps items={steps} current={current} />}

      {auth.recovery && status.signedIn && <NewPasswordPanel />}

      {!builtIn && !hasProject && <ProjectStep onDone={() => setEditingProject(false)} onCancel={cfg.config ? () => setEditingProject(false) : undefined} />}

      {hasProject && !builtIn && (
        <section className={styles.panel} aria-label="Proyecto conectado">
          <div className={styles.projectRow}>
            <Badge tone="success" dot>
              Proyecto conectado
            </Badge>
            <span className={styles.projectHost}>{hostOf(cfg.config!.url)}</span>
            <span className={styles.spacer} />
            {cfg.source === 'user' && (
              <>
                <Button size="sm" variant="ghost" iconLeft={<Pencil size={14} />} onClick={() => setEditingProject(true)}>
                  Cambiar
                </Button>
                <Button size="sm" variant="danger-ghost" onClick={forgetProject}>
                  Desconectar
                </Button>
              </>
            )}
          </div>
        </section>
      )}

      {hasProject && auth.ready && !status.signedIn && <AccountStep step={builtIn ? 'Crea tu cuenta o inicia sesión' : '2. Crea tu cuenta o inicia sesión'} />}

      {status.signedIn && <StatusPanel />}

      {hasProject && !builtIn && cfg.config && <ConnectionCodePanel config={cfg.config} />}

      <Notice tone="info">
        Se sincronizan clientes, gastos, inventario, movimientos, el registro de actividad y los datos del negocio. Las <strong>fotos de evidencia</strong>, las notificaciones, el tema y las preferencias de
        avisos se quedan sólo en cada dispositivo.
      </Notice>

      <CloudGuide builtIn={builtIn} />
    </div>
  );
}

/* Piezas compartidas de la UI de la nube: avisos, formularios de proyecto,
   cuenta y contraseña nueva, código de conexión con QR y guía rápida. */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CircleAlert,
  CircleCheck,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Link2,
  Mail,
  Plug,
  QrCode,
  TriangleAlert,
} from 'lucide-react';
import { Button, Input, SegmentedControl, cx, toast } from '@/ui';
import { decodeConnectionCode, encodeConnectionCode, validateCloudConfig, type CloudConfig } from '../config';
import { cloudResetPassword, cloudUpdatePassword, testCloudConfig, validateEmail, validatePassword } from '../client';
import { encodeQr, drawQrToCanvas } from '../qr';
import styles from './Cloud.module.css';

/* --------------------------------- Aviso --------------------------------- */

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger' | 'brand';

const NOTICE_ICON: Record<NoticeTone, ReactNode> = {
  info: <Info aria-hidden />,
  success: <CircleCheck aria-hidden />,
  warning: <TriangleAlert aria-hidden />,
  danger: <CircleAlert aria-hidden />,
  brand: <Info aria-hidden />,
};

export function Notice({ tone = 'info', title, children, icon, live }: { tone?: NoticeTone; title?: ReactNode; children?: ReactNode; icon?: ReactNode; live?: boolean }) {
  return (
    <div className={cx(styles.notice, styles[`tone-${tone}`])} role={live ? (tone === 'danger' ? 'alert' : 'status') : undefined}>
      {icon ?? NOTICE_ICON[tone]}
      <div className={styles.noticeBody}>
        {title && <span className={styles.noticeTitle}>{title}</span>}
        {children && <span>{children}</span>}
      </div>
    </div>
  );
}

/* -------------------------------- Pasos ---------------------------------- */

export function Steps({ items, current }: { items: string[]; current: number }) {
  return (
    <ol className={styles.steps} aria-label="Pasos para conectar la nube">
      {items.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className={cx(styles.step, active && styles.stepActive, done && styles.stepDone)} aria-current={active ? 'step' : undefined}>
            <span className={styles.stepNum} aria-hidden>
              {done ? <CircleCheck /> : i + 1}
            </span>
            <span>
              {label}
              {done && <span className="sr-only"> (listo)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------ Contraseña ------------------------------- */

function PasswordInput(props: { label: string; value: string; onChange: (v: string) => void; error?: string | null; autoComplete: string; hint?: ReactNode; disabled?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <Input
      label={props.label}
      type={show ? 'text' : 'password'}
      value={props.value}
      onValueChange={props.onChange}
      error={props.error ?? undefined}
      hint={props.hint}
      autoComplete={props.autoComplete}
      disabled={props.disabled}
      prefix={<KeyRound size={16} aria-hidden />}
      suffix={
        <button
          type="button"
          className={styles.eyeButton}
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={show}
        >
          {show ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        </button>
      }
      autoCapitalize="none"
      spellCheck={false}
    />
  );
}

/* ------------------------------ Proyecto --------------------------------- */

export interface ProjectDraft {
  mode: 'code' | 'manual';
  code: string;
  url: string;
  anonKey: string;
}

export const emptyProjectDraft = (mode: ProjectDraft['mode'] = 'manual'): ProjectDraft => ({ mode, code: '', url: '', anonKey: '' });

/** Config resultante de un borrador (o errores por campo). */
export function resolveProjectDraft(d: ProjectDraft): { config: CloudConfig | null; errors: { code?: string; url?: string; anonKey?: string } } {
  if (d.mode === 'code') {
    const r = decodeConnectionCode(d.code);
    return r.ok ? { config: r.value, errors: {} } : { config: null, errors: { code: r.error } };
  }
  const { value, errors } = validateCloudConfig({ url: d.url, anonKey: d.anonKey });
  return { config: value, errors };
}

/**
 * Campos para conectar el proyecto: pegar el código de conexión o escribir
 * URL + clave, con validación en vivo (al salir del campo) y botón "Probar".
 */
export function ProjectFields({
  draft,
  onChange,
  showErrors,
  disabled,
}: {
  draft: ProjectDraft;
  onChange: (d: ProjectDraft) => void;
  showErrors?: boolean;
  disabled?: boolean;
}) {
  const codeId = useId();
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const { config, errors } = resolveProjectDraft(draft);
  const err = (k: 'code' | 'url' | 'anonKey') => ((showErrors || touched[k]) && (draft[k] || showErrors) ? errors[k] : undefined);

  useEffect(() => setTest(null), [draft.mode, draft.code, draft.url, draft.anonKey]);

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onChange({ ...draft, code: text.trim() });
        setTouched((t) => ({ ...t, code: true }));
      }
    } catch {
      toast({ title: 'No se pudo leer el portapapeles', description: 'Mantén presionado el campo y elige "Pegar".', tone: 'warning' });
    }
  };

  const runTest = async () => {
    if (!config) {
      setTouched({ code: true, url: true, anonKey: true });
      return;
    }
    setTesting(true);
    setTest(null);
    try {
      setTest(await testCloudConfig(config));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={styles.fields}>
      <SegmentedControl
        aria-label="Cómo conectar el proyecto"
        value={draft.mode}
        onChange={(mode) => onChange({ ...draft, mode })}
        fullWidth
        options={[
          { value: 'code', label: 'Código de conexión', icon: <QrCode size={15} aria-hidden /> },
          { value: 'manual', label: 'URL y clave', icon: <Link2 size={15} aria-hidden /> },
        ]}
      />

      {draft.mode === 'code' ? (
        <div>
          <label className={styles.label} htmlFor={codeId}>
            Código de conexión
          </label>
          <textarea
            id={codeId}
            className={cx(styles.textarea, err('code') && styles.textareaInvalid)}
            value={draft.code}
            onChange={(e) => onChange({ ...draft, code: e.target.value })}
            onBlur={() => setTouched((t) => ({ ...t, code: true }))}
            placeholder="REPARO1.eyJ1Ijoi…"
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            disabled={disabled}
            aria-invalid={!!err('code') || undefined}
            aria-describedby={`${codeId}-hint${err('code') ? ` ${codeId}-err` : ''}`}
          />
          {err('code') ? (
            <p id={`${codeId}-err`} className={styles.error} role="alert">
              {err('code')}
            </p>
          ) : null}
          <p id={`${codeId}-hint`} className={styles.hint}>
            En la computadora donde ya usas Reparo: Ajustes → Nube → "Código de conexión". Cópialo y pégalo aquí (o escanea el QR con la cámara y copia el texto).
          </p>
          <div className={styles.actionsTight}>
            <Button size="sm" variant="secondary" iconLeft={<ClipboardPaste size={15} />} onClick={paste} disabled={disabled}>
              Pegar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Input
            label="URL del proyecto (Project URL)"
            value={draft.url}
            onValueChange={(url) => onChange({ ...draft, url })}
            onBlur={() => setTouched((t) => ({ ...t, url: true }))}
            placeholder="https://abcdefghijklmnopqrst.supabase.co"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            error={err('url')}
            hint="Supabase → Project Settings → Data API (o API) → Project URL."
            disabled={disabled}
          />
          <Input
            label="Clave pública (publishable o anon)"
            value={draft.anonKey}
            onValueChange={(anonKey) => onChange({ ...draft, anonKey })}
            onBlur={() => setTouched((t) => ({ ...t, anonKey: true }))}
            placeholder="sb_publishable_…  o  eyJhbGciOi…"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            error={err('anonKey')}
            hint={'Project Settings → API Keys → "Publishable key" (o la "anon public" clásica). Nunca la clave secreta.'}
            disabled={disabled}
            controlClassName={styles.mono}
          />
        </>
      )}

      <div className={styles.actions}>
        <Button variant="secondary" size="sm" iconLeft={<Plug size={15} />} onClick={runTest} loading={testing} disabled={disabled}>
          Probar conexión
        </Button>
      </div>
      {test && (
        <Notice tone={test.ok ? 'success' : 'danger'} live>
          {test.message}
        </Notice>
      )}
    </div>
  );
}

/* ------------------------------- Cuenta ---------------------------------- */

export type AuthMode = 'signin' | 'signup';

export function AccountFields({
  mode,
  email,
  password,
  onEmail,
  onPassword,
  showErrors,
  disabled,
}: {
  mode: AuthMode;
  email: string;
  password: string;
  onEmail: (v: string) => void;
  onPassword: (v: string) => void;
  showErrors?: boolean;
  disabled?: boolean;
}) {
  const [touched, setTouched] = useState({ email: false });
  const emailErr = (showErrors || (touched.email && email)) ? validateEmail(email) : null;
  const passErr = showErrors ? validatePassword(password, mode === 'signup') : null;
  return (
    <div className={styles.fields}>
      <Input
        label="Correo"
        type="email"
        value={email}
        onValueChange={onEmail}
        onBlur={() => setTouched({ email: true })}
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        placeholder="taller@gmail.com"
        prefix={<Mail size={16} aria-hidden />}
        error={emailErr ?? undefined}
        disabled={disabled}
      />
      <PasswordInput
        label="Contraseña"
        value={password}
        onChange={onPassword}
        error={passErr}
        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        hint={mode === 'signup' ? 'Mínimo 8 caracteres. Usarás este mismo correo y contraseña en tus otros dispositivos.' : undefined}
        disabled={disabled}
      />
    </div>
  );
}

/** Botón "¿Olvidaste tu contraseña?" que envía el correo de recuperación. */
export function ForgotPassword({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const send = async () => {
    const err = validateEmail(email);
    if (err) {
      toast({ title: 'Escribe tu correo arriba', description: 'Te enviaremos ahí el enlace para crear una contraseña nueva.', tone: 'warning' });
      return;
    }
    setSending(true);
    try {
      await cloudResetPassword(email);
      toast({ title: 'Revisa tu correo', description: `Enviamos un enlace a ${email.trim()} para crear una contraseña nueva. Ábrelo en este dispositivo.`, tone: 'success', duration: 9000 });
    } catch (e) {
      toast({ title: 'No se pudo enviar el correo', description: (e as Error).message, tone: 'danger' });
    } finally {
      setSending(false);
    }
  };
  return (
    <button type="button" className={styles.linkButton} onClick={send} disabled={sending} aria-busy={sending || undefined}>
      {sending ? 'Enviando…' : '¿Olvidaste tu contraseña?'}
    </button>
  );
}

/** Formulario de contraseña nueva (tras abrir el enlace de recuperación). */
export function NewPasswordPanel() {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await cloudUpdatePassword(password);
      toast({ title: 'Contraseña actualizada', tone: 'success' });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <form className={styles.panel} onSubmit={save} noValidate>
      <div>
        <h3 className={styles.panelTitle}>Crea tu contraseña nueva</h3>
        <p className={styles.panelDesc}>Abriste el enlace de recuperación. Escribe la contraseña que usarás de ahora en adelante.</p>
      </div>
      <PasswordInput label="Contraseña nueva" value={password} onChange={setPassword} error={error} autoComplete="new-password" hint="Mínimo 8 caracteres." />
      <div className={styles.actionsEnd}>
        <Button type="submit" variant="primary" loading={saving}>
          Guardar contraseña
        </Button>
      </div>
    </form>
  );
}

/* --------------------------- Código de conexión -------------------------- */

function QrCanvas({ text, px = 184, label }: { text: string; px?: number; label: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const qr = useMemo(() => {
    try {
      return encodeQr(text, 'M');
    } catch {
      return null;
    }
  }, [text]);
  useEffect(() => {
    const c = ref.current;
    if (!c || !qr) return;
    const cs = getComputedStyle(c.parentElement ?? c);
    drawQrToCanvas(c, qr, { px, dark: cs.color || 'black', light: cs.backgroundColor || 'white' });
  }, [qr, px]);
  if (!qr) return null;
  return (
    <div className={styles.qrPaper}>
      <canvas ref={ref} role="img" aria-label={label} width={px} height={px} />
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Código copiable + QR para conectar otro dispositivo sin teclear URL y clave. */
export function ConnectionCodePanel({ config }: { config: CloudConfig }) {
  const code = useMemo(() => encodeConnectionCode(config), [config]);
  const [open, setOpen] = useState(false);
  const copy = async () => {
    const ok = await copyText(code);
    toast(
      ok
        ? { title: 'Código copiado', description: 'Pégalo en el otro dispositivo (Ajustes → Nube o en la bienvenida).', tone: 'success' }
        : { title: 'No se pudo copiar', description: 'Selecciona el código y cópialo a mano.', tone: 'warning' },
    );
  };
  return (
    <section className={styles.panel} aria-labelledby="cloud-code-title">
      <div className={styles.panelHead}>
        <div>
          <h3 id="cloud-code-title" className={styles.panelTitle}>
            Conectar otro dispositivo
          </h3>
          <p className={styles.panelDesc}>
            En el celular abre Reparo → Ajustes → Nube (o la bienvenida) → "Código de conexión", pega este código e inicia sesión con el mismo correo. El código no incluye tu contraseña.
          </p>
        </div>
        <Button size="sm" variant={open ? 'ghost' : 'secondary'} iconLeft={<QrCode size={15} />} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Ocultar código' : 'Mostrar código'}
        </Button>
      </div>
      {open && (
        <div className={styles.codeLayout}>
          <QrCanvas text={code} label="Código QR con la conexión al proyecto de Supabase" />
          <div className={styles.codeBox}>
            <p className={styles.codeText} tabIndex={0} aria-label="Código de conexión">
              {code}
            </p>
            <div className={styles.actions}>
              <Button variant="primary" size="sm" iconLeft={<Copy size={15} />} onClick={copy}>
                Copiar código
              </Button>
            </div>
            <p className={styles.hint}>
              Con la cámara del celular puedes escanear el QR: copia el texto que aparece y pégalo en Reparo.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

/* --------------------------------- Guía ---------------------------------- */

export function CloudGuide({ builtIn }: { builtIn: boolean }) {
  return (
    <details className={styles.guide}>
      <summary>
        <ChevronRight className={styles.chevron} aria-hidden />
        Guía paso a paso
      </summary>
      {builtIn ? (
        <ol className={styles.guideList}>
          <li>
            En la computadora: <strong>Crear cuenta</strong> con tu correo y una contraseña. Tus datos se suben solos.
          </li>
          <li>
            En el celular: abre Reparo y en la bienvenida elige <strong>"Ya uso Reparo"</strong> (o Ajustes → Nube) e <strong>inicia sesión</strong> con el mismo correo.
          </li>
          <li>Listo: lo que registres en uno aparece en el otro en segundos cuando hay internet. Sin internet todo sigue funcionando y se envía al volver.</li>
        </ol>
      ) : (
        <ol className={styles.guideList}>
          <li>
            Crea una cuenta gratis en <strong>supabase.com</strong> y un proyecto nuevo (elige la región más cercana).
          </li>
          <li>
            En el proyecto abre <strong>SQL Editor</strong>, pega el archivo <code>supabase/schema.sql</code> y pulsa <strong>Run</strong>.
          </li>
          <li>
            En <strong>Authentication → Sign In / Providers → Email</strong> desactiva <strong>"Confirm email"</strong> (más simple), o configura la Site URL con la dirección de la app.
          </li>
          <li>
            En <strong>Project Settings → API</strong> copia la <strong>Project URL</strong> y la clave <strong>publishable</strong> (o <strong>anon</strong>) y pégalas aquí. Pulsa <strong>Probar conexión</strong>.
          </li>
          <li>
            <strong>Crea tu cuenta</strong> en la computadora. En el celular usa el <strong>código de conexión</strong> e inicia sesión con el mismo correo.
          </li>
        </ol>
      )}
    </details>
  );
}

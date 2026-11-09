/* ==========================================================================
   Nube (Supabase) — cliente y autenticación (correo + contraseña)
   La sesión la gestiona supabase-js (persistSession en localStorage con la
   clave 'reparo-auth'); aquí sólo se expone un almacén reactivo para la UI.
   ========================================================================== */
import { useSyncExternalStore } from 'react';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getCloudConfig, subscribeCloudConfig, getCloudConfigState, type CloudConfig } from './config';
import { CloudError, toCloudError } from './errors';

/* ---------------- Interfaz mínima (la cumple supabase-js y el fake) -------- */

export interface CloudUser {
  id: string;
  email?: string | null;
}
export interface CloudSession {
  user: CloudUser;
}
interface ApiError {
  message: string;
  code?: string;
  status?: number;
  name?: string;
}
type Res<T> = PromiseLike<{ data: T; error: ApiError | null }>;

export interface CloudQuery extends PromiseLike<{ data: unknown[] | null; error: ApiError | null }> {
  gt(column: string, value: number): CloudQuery;
  order(column: string, opts: { ascending: boolean }): CloudQuery;
  limit(n: number): CloudQuery;
}

/** Subconjunto de SupabaseClient que usa Reparo. */
export interface CloudClient {
  auth: {
    getSession(): Res<{ session: CloudSession | null }>;
    onAuthStateChange(cb: (event: string, session: CloudSession | null) => void): { data: { subscription: { unsubscribe(): void } } };
    signInWithPassword(p: { email: string; password: string }): Res<{ user: CloudUser | null; session: CloudSession | null }>;
    signUp(p: { email: string; password: string; options?: { emailRedirectTo?: string } }): Res<{
      user: (CloudUser & { identities?: unknown[] | null }) | null;
      session: CloudSession | null;
    }>;
    signOut(p?: { scope?: 'global' | 'local' | 'others' }): PromiseLike<{ error: ApiError | null }>;
    resetPasswordForEmail(email: string, opts?: { redirectTo?: string }): Res<unknown>;
    updateUser(attrs: { password?: string }): Res<{ user: CloudUser | null }>;
  };
  rpc(fn: string, args: Record<string, unknown>): Res<unknown>;
  from(table: string): { select(columns: string): CloudQuery };
}

export const AUTH_STORAGE_KEY = 'reparo-auth';

type Factory = (cfg: CloudConfig) => CloudClient;

const defaultFactory: Factory = (cfg) =>
  createSupabaseClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      storageKey: AUTH_STORAGE_KEY,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  }) as unknown as CloudClient;

let factory: Factory = defaultFactory;

/** Sólo para pruebas: reemplaza la creación del cliente (p. ej. por un fake en memoria). */
export function __setCloudClientFactory(f: Factory | null): void {
  factory = f ?? defaultFactory;
  resetClient();
}

/* ------------------------------ Estado auth ------------------------------ */

export interface CloudAuthState {
  /** true cuando ya se leyó la sesión guardada (o no hay config). */
  ready: boolean;
  userId: string | null;
  email: string | null;
  /** true tras abrir un enlace de "recuperar contraseña": la UI debe pedir la nueva. */
  recovery: boolean;
}

let auth: CloudAuthState = { ready: false, userId: null, email: null, recovery: false };
const authListeners = new Set<() => void>();

function setAuth(patch: Partial<CloudAuthState>): void {
  const next = { ...auth, ...patch };
  if (next.ready === auth.ready && next.userId === auth.userId && next.email === auth.email && next.recovery === auth.recovery) return;
  auth = next;
  for (const l of [...authListeners]) l();
}

export function subscribeCloudAuth(cb: () => void): () => void {
  authListeners.add(cb);
  return () => authListeners.delete(cb);
}

export function getCloudAuth(): CloudAuthState {
  return auth;
}

export function useCloudAuth(): CloudAuthState {
  return useSyncExternalStore(subscribeCloudAuth, getCloudAuth, getCloudAuth);
}

/* ------------------------------- Cliente --------------------------------- */

let current: { key: string; client: CloudClient; unsubscribe: () => void; init: Promise<void> } | null = null;

function resetClient(): void {
  current?.unsubscribe();
  current = null;
  setAuth({ ready: false, userId: null, email: null, recovery: false });
}

function cleanAuthParamsFromUrl(): void {
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  try {
    const u = new URL(location.href);
    let changed = false;
    for (const p of ['code', 'error', 'error_code', 'error_description']) {
      if (u.searchParams.has(p)) {
        u.searchParams.delete(p);
        changed = true;
      }
    }
    if (changed) history.replaceState(history.state, '', u.toString());
  } catch {
    /* sin acceso a la URL */
  }
}

/** Cliente de Supabase para la config efectiva (null si no hay proyecto configurado). */
export async function getCloudClient(): Promise<CloudClient | null> {
  const cfg = await getCloudConfig();
  if (!cfg) {
    if (current) resetClient();
    setAuth({ ready: true });
    return null;
  }
  const key = `${cfg.url}|${cfg.anonKey}`;
  if (current?.key !== key) {
    resetClient();
    const client = factory(cfg);
    const sub = client.auth.onAuthStateChange((event, session) => {
      setAuth({
        ready: true,
        userId: session?.user.id ?? null,
        email: session?.user.email ?? null,
        recovery: event === 'PASSWORD_RECOVERY' ? true : event === 'SIGNED_OUT' ? false : auth.recovery,
      });
    });
    const init = Promise.resolve(client.auth.getSession())
      .then(({ data }) => {
        setAuth({ ready: true, userId: data.session?.user.id ?? null, email: data.session?.user.email ?? null });
        cleanAuthParamsFromUrl();
      })
      .catch(() => setAuth({ ready: true }));
    current = { key, client, unsubscribe: () => sub.data.subscription.unsubscribe(), init };
  }
  await current.init;
  return current.client;
}

async function requireClient(): Promise<CloudClient> {
  const c = await getCloudClient();
  if (!c) throw new CloudError('Primero conecta tu proyecto de Supabase (URL y clave).', 'config');
  return c;
}

/** Usuario con sesión activa (null si no hay sesión o no hay config). */
export async function getCloudUser(): Promise<CloudUser | null> {
  const c = await getCloudClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.user ?? null;
}

/* ---------------------------- Autenticación ------------------------------ */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email: string): string | null {
  const e = email.trim();
  if (!e) return 'Escribe tu correo.';
  if (!EMAIL_RE.test(e)) return 'Ese correo no es válido. Ejemplo: taller@gmail.com';
  return null;
}

export function validatePassword(password: string, isNew = false): string | null {
  if (!password) return 'Escribe tu contraseña.';
  if (isNew && password.length < 8) return 'Usa al menos 8 caracteres.';
  return null;
}

function redirectUrl(): string | undefined {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return undefined;
  return `${location.origin}${location.pathname}`;
}

function check(email: string, password: string, isNew: boolean): string {
  const e = validateEmail(email) ?? validatePassword(password, isNew);
  if (e) throw new CloudError(e, 'auth');
  return email.trim().toLowerCase();
}

/** Inicia sesión con correo y contraseña. */
export async function cloudSignIn(email: string, password: string): Promise<CloudUser> {
  const mail = check(email, password, false);
  const c = await requireClient();
  try {
    const { data, error } = await c.auth.signInWithPassword({ email: mail, password });
    if (error) throw error;
    if (!data.user) throw new CloudError('No se pudo iniciar sesión.', 'auth');
    setAuth({ ready: true, userId: data.user.id, email: data.user.email ?? mail });
    return data.user;
  } catch (err) {
    throw toCloudError(err, 'No se pudo iniciar sesión.');
  }
}

/**
 * Crea la cuenta. Si el proyecto exige confirmar el correo, devuelve
 * `needsConfirmation: true` (no hay sesión hasta abrir el enlace).
 */
export async function cloudSignUp(email: string, password: string): Promise<{ user: CloudUser | null; needsConfirmation: boolean }> {
  const mail = check(email, password, true);
  const c = await requireClient();
  try {
    const { data, error } = await c.auth.signUp({ email: mail, password, options: { emailRedirectTo: redirectUrl() } });
    if (error) throw error;
    // Con "Confirm email" activo, un correo ya registrado devuelve un usuario sin identidades.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new CloudError('Ya existe una cuenta con ese correo. Usa "Iniciar sesión".', 'auth');
    }
    if (data.session) {
      setAuth({ ready: true, userId: data.session.user.id, email: data.session.user.email ?? mail });
      return { user: data.session.user, needsConfirmation: false };
    }
    return { user: data.user, needsConfirmation: true };
  } catch (err) {
    throw toCloudError(err, 'No se pudo crear la cuenta.');
  }
}

/** Cierra la sesión en ESTE dispositivo (los datos locales se conservan). */
export async function cloudSignOut(): Promise<void> {
  const c = await getCloudClient();
  if (!c) return;
  try {
    await c.auth.signOut({ scope: 'local' });
  } finally {
    setAuth({ userId: null, email: null, recovery: false });
  }
}

/** Envía el correo para restablecer la contraseña. */
export async function cloudResetPassword(email: string): Promise<void> {
  const err = validateEmail(email);
  if (err) throw new CloudError(err, 'auth');
  const c = await requireClient();
  try {
    const { error } = await c.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: redirectUrl() });
    if (error) throw error;
  } catch (e) {
    throw toCloudError(e, 'No se pudo enviar el correo.');
  }
}

/** Guarda una contraseña nueva (tras abrir el enlace de recuperación, o con sesión). */
export async function cloudUpdatePassword(password: string): Promise<void> {
  const err = validatePassword(password, true);
  if (err) throw new CloudError(err, 'auth');
  const c = await requireClient();
  try {
    const { error } = await c.auth.updateUser({ password });
    if (error) throw error;
    setAuth({ recovery: false });
  } catch (e) {
    throw toCloudError(e, 'No se pudo cambiar la contraseña.');
  }
}

/* ------------------------- Probar la configuración ----------------------- */

/**
 * Comprueba que la URL y la clave respondan y que exista la tabla de Reparo.
 * No necesita sesión.
 */
export async function testCloudConfig(cfg: CloudConfig): Promise<{ ok: boolean; message: string }> {
  if (typeof fetch === 'undefined') return { ok: false, message: 'Este navegador no puede conectarse.' };
  const headers: Record<string, string> = { apikey: cfg.anonKey };
  if (cfg.anonKey.startsWith('eyJ')) headers.Authorization = `Bearer ${cfg.anonKey}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const authRes = await fetch(`${cfg.url}/auth/v1/settings`, { headers, signal: ctrl.signal, cache: 'no-store' });
    if (authRes.status === 401 || authRes.status === 403) {
      return { ok: false, message: 'Supabase respondió, pero la clave no es válida para este proyecto.' };
    }
    if (!authRes.ok) return { ok: false, message: `Esa URL respondió con un error (${authRes.status}). ¿Es la "Project URL" correcta?` };
    const settings = (await authRes.json().catch(() => null)) as { external?: { email?: boolean }; mailer_autoconfirm?: boolean } | null;

    const rest = await fetch(`${cfg.url}/rest/v1/reparo_rows?select=id&limit=1`, { headers, signal: ctrl.signal, cache: 'no-store' });
    if (!rest.ok) {
      const body = (await rest.json().catch(() => null)) as { code?: string; message?: string } | null;
      const e = toCloudError({ ...body, status: rest.status });
      return { ok: false, message: e.kind === 'schema' ? e.message : `Conectado, pero la base respondió con un error: ${e.message}` };
    }
    if (settings?.external && settings.external.email === false) {
      return { ok: false, message: 'Conectado, pero el inicio de sesión con correo está desactivado (Authentication → Providers → Email).' };
    }
    const confirm = settings?.mailer_autoconfirm === false ? ' Tu proyecto pide confirmar el correo al crear la cuenta.' : '';
    return { ok: true, message: `¡Conexión correcta! El proyecto está listo para Reparo.${confirm}` };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return { ok: false, message: 'Supabase tardó demasiado en responder. Revisa tu internet.' };
    return { ok: false, message: toCloudError(err).message };
  } finally {
    clearTimeout(t);
  }
}

/* Mantiene el cliente al día cuando cambia la config. */
let lastKey = '';
subscribeCloudConfig(() => {
  const s = getCloudConfigState();
  const key = s.config ? `${s.config.url}|${s.config.anonKey}` : '';
  if (key !== lastKey) {
    lastKey = key;
    void getCloudClient().catch(() => undefined);
  }
});

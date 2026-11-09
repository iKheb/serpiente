/* ==========================================================================
   Nube (Supabase) — configuración del proyecto
   --------------------------------------------------------------------------
   - La config del usuario ({ url, anonKey }) vive en IndexedDB `meta` ('cloud').
   - Si el build trae VITE_REPARO_CLOUD_URL + VITE_REPARO_CLOUD_KEY, ésa es la
     config predeterminada (la del usuario, si existe, tiene prioridad) y la UI
     sólo pide correo y contraseña.
   - "Código de conexión": base64url de { u, k } para pasar la config de la PC
     al celular sin teclear (también como QR).
   ========================================================================== */
import { useSyncExternalStore } from 'react';
import { db, dbReady } from '@/data/db';

export interface CloudConfig {
  /** URL del proyecto, normalizada: "https://<ref>.supabase.co". */
  url: string;
  /** Clave pública del proyecto: publishable ("sb_publishable_…") o anon (JWT "eyJ…"). */
  anonKey: string;
}

export type CloudConfigSource = 'user' | 'build';

export const META_CLOUD_CONFIG = 'cloud';

/* ------------------------------ Validación ------------------------------- */

const REF_RE = /^[a-z0-9]{20}$/;
const JWT_RE = /^eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+$/;
const PUBLISHABLE_RE = /^sb_publishable_[\w-]{10,}$/;

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Normaliza la URL del proyecto. Acepta "https://abc….supabase.co", con "/" o
 * rutas (/rest/v1, /auth/v1) al final, la referencia sola ("abcdefghij…") o un
 * dominio propio con https. En desarrollo acepta http://localhost.
 */
export function normalizeProjectUrl(raw: string | null | undefined): Validation<string> {
  let s = String(raw ?? '').trim();
  if (!s) return { ok: false, error: 'Pega la URL del proyecto (Project URL).' };
  if (REF_RE.test(s)) return { ok: true, value: `https://${s}.supabase.co` };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: 'Eso no parece una dirección. Debe verse como https://xxxx.supabase.co' };
  }
  const host = u.hostname.toLowerCase();
  const local = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) {
    return { ok: false, error: 'La URL debe empezar con https://' };
  }
  if (host.endsWith('supabase.com')) {
    return { ok: false, error: 'Ésa es la dirección del panel de Supabase. Copia la "Project URL" (termina en .supabase.co) en Project Settings → API.' };
  }
  if (host.endsWith('.supabase.co')) {
    const ref = host.slice(0, -'.supabase.co'.length);
    if (!/^[a-z0-9-]+$/.test(ref) || ref.includes('.')) return { ok: false, error: 'La URL del proyecto no es válida.' };
  } else if (!host.includes('.') && !local) {
    return { ok: false, error: 'La URL del proyecto no es válida.' };
  }
  return { ok: true, value: `${u.protocol}//${u.host}` };
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const part = jwt.split('.')[1];
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Valida la clave pública (publishable o anon). Rechaza explícitamente las secretas. */
export function normalizeAnonKey(raw: string | null | undefined): Validation<string> {
  const s = String(raw ?? '').replace(/\s+/g, '');
  if (!s) return { ok: false, error: 'Pega la clave pública del proyecto (publishable o anon).' };
  if (/^sb_secret_/.test(s)) {
    return { ok: false, error: 'Ésa es la clave SECRETA: nunca la pegues en la app. Usa la clave "publishable" (sb_publishable_…) o "anon".' };
  }
  if (PUBLISHABLE_RE.test(s)) return { ok: true, value: s };
  if (JWT_RE.test(s)) {
    const payload = decodeJwtPayload(s);
    if (!payload) return { ok: false, error: 'La clave está incompleta. Cópiala de nuevo con el botón de copiar.' };
    if (payload.role === 'service_role') {
      return { ok: false, error: 'Ésa es la clave "service_role" (secreta): nunca la pegues en la app. Usa la clave "anon".' };
    }
    return { ok: true, value: s };
  }
  return { ok: false, error: 'La clave no tiene el formato esperado. Debe empezar con "sb_publishable_" o "eyJ".' };
}

export function validateCloudConfig(input: { url: string; anonKey: string }): { value: CloudConfig | null; errors: { url?: string; anonKey?: string } } {
  const u = normalizeProjectUrl(input.url);
  const k = normalizeAnonKey(input.anonKey);
  const errors: { url?: string; anonKey?: string } = {};
  if (!u.ok) errors.url = u.error;
  if (!k.ok) errors.anonKey = k.error;
  return { value: u.ok && k.ok ? { url: u.value, anonKey: k.value } : null, errors };
}

/* --------------------------- Código de conexión -------------------------- */

const CODE_PREFIX = 'REPARO1.';

function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Código copiable con la config del proyecto (NO incluye correo ni contraseña). */
export function encodeConnectionCode(cfg: CloudConfig): string {
  const m = /^https:\/\/([a-z0-9]{20})\.supabase\.co$/.exec(cfg.url);
  return CODE_PREFIX + b64urlEncode(JSON.stringify({ u: m ? m[1] : cfg.url, k: cfg.anonKey }));
}

/** Lee un código de conexión pegado (tolera espacios, saltos de línea y el prefijo opcional). */
export function decodeConnectionCode(raw: string): Validation<CloudConfig> {
  let s = String(raw ?? '').replace(/\s+/g, '');
  if (!s) return { ok: false, error: 'Pega el código de conexión.' };
  if (s.toUpperCase().startsWith(CODE_PREFIX)) s = s.slice(CODE_PREFIX.length);
  let parsed: unknown;
  try {
    parsed = JSON.parse(b64urlDecode(s));
  } catch {
    return { ok: false, error: 'El código no es válido o está incompleto. Cópialo de nuevo desde Ajustes → Nube en la otra computadora.' };
  }
  const o = (parsed ?? {}) as { u?: unknown; k?: unknown };
  const { value, errors } = validateCloudConfig({ url: String(o.u ?? ''), anonKey: String(o.k ?? '') });
  if (!value) return { ok: false, error: errors.url ?? errors.anonKey ?? 'El código no es válido.' };
  return { ok: true, value };
}

/* ----------------------------- Config de build --------------------------- */

function readBuildConfig(): CloudConfig | null {
  let env: ImportMetaEnv | undefined;
  try {
    env = import.meta.env;
  } catch {
    env = undefined;
  }
  const url = env?.VITE_REPARO_CLOUD_URL;
  const key = env?.VITE_REPARO_CLOUD_KEY;
  if (!url || !key) return null;
  const { value } = validateCloudConfig({ url, anonKey: key });
  if (!value) {
    console.warn('[reparo] VITE_REPARO_CLOUD_URL / VITE_REPARO_CLOUD_KEY no son válidas; se ignoran.');
    return null;
  }
  return value;
}

let buildConfig: CloudConfig | null = readBuildConfig();

/** true si el build trae un proyecto predeterminado (la UI sólo pide correo y contraseña). */
export function hasBuiltInConfig(): boolean {
  return buildConfig !== null;
}

/** Sólo para pruebas: simula (o quita) la config de build. */
export function __setBuildConfigForTests(cfg: CloudConfig | null): void {
  buildConfig = cfg;
  void loadCloudConfig();
}

/* ------------------------------- Almacén --------------------------------- */

export interface CloudConfigState {
  loaded: boolean;
  config: CloudConfig | null;
  source: CloudConfigSource | null;
  /** true si hay un proyecto predeterminado en el build. */
  builtIn: boolean;
}

let state: CloudConfigState = { loaded: false, config: null, source: null, builtIn: buildConfig !== null };
const listeners = new Set<() => void>();

function setState(next: CloudConfigState): void {
  const same = state.loaded === next.loaded && state.source === next.source && state.builtIn === next.builtIn &&
    state.config?.url === next.config?.url && state.config?.anonKey === next.config?.anonKey;
  if (same) return;
  state = next;
  for (const l of [...listeners]) l();
}

export function subscribeCloudConfig(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getCloudConfigState(): CloudConfigState {
  return state;
}

export function useCloudConfig(): CloudConfigState {
  return useSyncExternalStore(subscribeCloudConfig, getCloudConfigState, getCloudConfigState);
}

async function readUserConfig(): Promise<CloudConfig | null> {
  const row = await db.meta.get(META_CLOUD_CONFIG);
  const v = row?.value as Partial<CloudConfig> | undefined;
  if (!v || typeof v.url !== 'string' || typeof v.anonKey !== 'string') return null;
  return validateCloudConfig({ url: v.url, anonKey: v.anonKey }).value;
}

let loading: Promise<CloudConfigState> | null = null;

/** Lee la config efectiva (usuario > build). */
export function loadCloudConfig(): Promise<CloudConfigState> {
  loading = (async () => {
    await dbReady();
    const user = await readUserConfig();
    const config = user ?? buildConfig;
    setState({ loaded: true, config, source: user ? 'user' : buildConfig ? 'build' : null, builtIn: buildConfig !== null });
    return state;
  })().finally(() => {
    loading = null;
  });
  return loading;
}

export async function getCloudConfig(): Promise<CloudConfig | null> {
  if (!state.loaded) await (loading ?? loadCloudConfig());
  return state.config;
}

/** Guarda la config ingresada por el usuario (ya validada o la valida aquí). */
export async function saveCloudConfig(input: { url: string; anonKey: string }): Promise<CloudConfig> {
  const { value, errors } = validateCloudConfig(input);
  if (!value) throw new Error(errors.url ?? errors.anonKey ?? 'Configuración no válida.');
  await dbReady();
  await db.meta.put({ key: META_CLOUD_CONFIG, value });
  await loadCloudConfig();
  return value;
}

/** Olvida la config del usuario (vuelve a la del build, si existe). */
export async function clearCloudConfig(): Promise<void> {
  await dbReady();
  await db.meta.delete(META_CLOUD_CONFIG);
  await loadCloudConfig();
}

if (typeof indexedDB !== 'undefined') {
  loadCloudConfig().catch(() => undefined);
}

/* Errores de la nube traducidos a español claro. */

export type CloudErrorKind = 'offline' | 'network' | 'config' | 'auth' | 'schema' | 'server' | 'confirm';

export class CloudError extends Error {
  constructor(
    message: string,
    public kind: CloudErrorKind = 'server',
  ) {
    super(message);
    this.name = 'CloudError';
  }
}

const SCHEMA_MSG = 'Falta preparar la base de datos de tu proyecto: abre el SQL Editor de Supabase, pega el contenido de supabase/schema.sql y pulsa Run.';

const AUTH_CODES: Record<string, [string, CloudErrorKind]> = {
  invalid_credentials: ['Correo o contraseña incorrectos. Revisa que estén bien escritos.', 'auth'],
  email_not_confirmed: [
    'Tu correo aún no está confirmado. Abre el enlace que te enviamos (revisa también "Spam") y vuelve a intentarlo.',
    'confirm',
  ],
  user_already_exists: ['Ya existe una cuenta con ese correo. Usa "Iniciar sesión".', 'auth'],
  email_exists: ['Ya existe una cuenta con ese correo. Usa "Iniciar sesión".', 'auth'],
  weak_password: ['La contraseña es muy débil. Usa al menos 8 caracteres combinando letras y números.', 'auth'],
  same_password: ['La nueva contraseña debe ser distinta de la anterior.', 'auth'],
  email_address_invalid: ['Ese correo no es válido. Revisa que esté bien escrito.', 'auth'],
  email_address_not_authorized: ['Supabase no permite enviar correos a esa dirección. Configura un SMTP propio o desactiva "Confirm email".', 'config'],
  signup_disabled: ['El registro de cuentas nuevas está desactivado en tu proyecto de Supabase (Authentication → Sign In / Providers).', 'config'],
  email_provider_disabled: ['El inicio de sesión con correo está desactivado en tu proyecto (Authentication → Providers → Email).', 'config'],
  over_email_send_rate_limit: ['Se enviaron demasiados correos en poco tiempo. Espera unos minutos y vuelve a intentarlo.', 'auth'],
  over_request_rate_limit: ['Demasiados intentos seguidos. Espera un minuto y vuelve a intentarlo.', 'auth'],
  user_banned: ['Esta cuenta está bloqueada en tu proyecto de Supabase.', 'auth'],
  session_expired: ['Tu sesión expiró. Vuelve a iniciar sesión.', 'auth'],
  session_not_found: ['Tu sesión ya no es válida. Vuelve a iniciar sesión.', 'auth'],
  refresh_token_not_found: ['Tu sesión ya no es válida. Vuelve a iniciar sesión.', 'auth'],
  refresh_token_already_used: ['Tu sesión ya no es válida. Vuelve a iniciar sesión.', 'auth'],
  otp_expired: ['El enlace del correo ya expiró. Pide uno nuevo.', 'auth'],
  flow_state_expired: ['El enlace del correo ya expiró. Pide uno nuevo.', 'auth'],
  bad_code_verifier: ['Abre el enlace del correo en el mismo dispositivo y navegador donde lo pediste.', 'auth'],
  request_timeout: ['Supabase tardó demasiado en responder. Intenta de nuevo.', 'network'],
};

const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Convierte cualquier error (supabase-js, PostgREST, red) en un CloudError legible. */
export function toCloudError(err: unknown, fallback = 'Ocurrió un error con la nube.'): CloudError {
  if (err instanceof CloudError) return err;
  const e = (err ?? {}) as { name?: string; message?: string; code?: string | number; status?: number; details?: string; hint?: string };
  const message = String(e.message ?? '');
  const code = e.code != null ? String(e.code) : '';
  const lower = message.toLowerCase();

  if (isOffline()) return new CloudError('Sin conexión a internet. Tus cambios quedan guardados en este dispositivo y se enviarán al volver la conexión.', 'offline');

  if (
    e.name === 'AuthRetryableFetchError' ||
    (e.name === 'TypeError' && /fetch|network|load failed/i.test(message)) ||
    /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)
  ) {
    return new CloudError('No se pudo conectar con Supabase. Revisa tu conexión a internet y que la URL del proyecto sea correcta.', 'network');
  }

  if (code && AUTH_CODES[code]) return new CloudError(...AUTH_CODES[code]);
  if (lower.includes('invalid login credentials')) return new CloudError(...AUTH_CODES.invalid_credentials);
  if (lower.includes('email not confirmed')) return new CloudError(...AUTH_CODES.email_not_confirmed);
  if (lower.includes('user already registered')) return new CloudError(...AUTH_CODES.user_already_exists);
  if (lower.includes('password should be') || lower.includes('password is known')) return new CloudError(...AUTH_CODES.weak_password);
  if (lower.includes('invalid api key') || lower.includes('no api key') || lower.includes('invalid authentication credentials')) {
    return new CloudError('La clave del proyecto no es válida. Cópiala de nuevo desde Project Settings → API Keys.', 'config');
  }
  if (lower.includes('rate limit')) return new CloudError(...AUTH_CODES.over_request_rate_limit);

  // PostgREST / Postgres
  if (['PGRST202', 'PGRST205', '42P01', '42883', 'PGRST204'].includes(code) || lower.includes('could not find the function') || lower.includes('relation "reparo_rows"')) {
    return new CloudError(SCHEMA_MSG, 'schema');
  }
  if (code === 'PGRST301' || code === 'PGRST302' || lower.includes('jwt expired')) {
    return new CloudError('Tu sesión expiró. Vuelve a iniciar sesión.', 'auth');
  }
  if (code === '42501') return new CloudError('Supabase rechazó la operación por permisos (RLS). Vuelve a ejecutar supabase/schema.sql.', 'schema');
  if (code === '57014') return new CloudError('Supabase tardó demasiado en responder. Intenta de nuevo.', 'network');
  if (e.status === 401 || e.status === 403) return new CloudError('Tu sesión ya no es válida. Vuelve a iniciar sesión.', 'auth');
  if (typeof e.status === 'number' && e.status >= 500) {
    return new CloudError(`Supabase tuvo un problema (${e.status}). Si tu proyecto gratis estuvo pausado por inactividad, reactívalo en supabase.com.`, 'server');
  }
  return new CloudError(message ? `${fallback} (${message})` : fallback, 'server');
}

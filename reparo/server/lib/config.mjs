// Configuración del servidor a partir de variables de entorno.
// Todo es opcional: sin variables, el servidor arranca en 0.0.0.0:8787,
// sirve la app compilada y guarda los datos en server/data/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PROJECT_DIR = path.resolve(SERVER_DIR, '..');

function readVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, 'package.json'), 'utf8'));
    return String(pkg.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

export const VERSION = readVersion();

/** Error de configuración con mensaje en español (se muestra tal cual al iniciar). */
export class ConfigError extends Error {}

function int(env, name, def, { min = -Infinity, max = Infinity } = {}) {
  const raw = env[name];
  if (raw === undefined || String(raw).trim() === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ConfigError(`${name}="${raw}" no es válido: debe ser un número entero entre ${min} y ${max}.`);
  }
  return n;
}

function list(raw) {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Carpeta de la app compilada. `vite build` escribe en `../app` respecto a la
 * raíz del proyecto (vite.config.ts → outDir), es decir, `../../app` respecto a
 * este directorio `server/`. Se aceptan también `app/` y `dist/` dentro del proyecto.
 */
export function resolveAppDir(env = process.env) {
  if (env.REPARO_APP_DIR) return path.resolve(env.REPARO_APP_DIR);
  const candidates = [
    path.resolve(SERVER_DIR, '..', '..', 'app'),
    path.resolve(SERVER_DIR, '..', 'app'),
    path.resolve(SERVER_DIR, '..', 'dist'),
  ];
  return candidates.find((d) => fs.existsSync(path.join(d, 'index.html'))) ?? candidates[0];
}

/** Política CORS: `*`, lista de orígenes, y palabras clave `lan` y `null`. */
export function parseCors(raw) {
  const items = list(raw);
  const policy = { any: false, lan: false, allowNull: false, origins: new Set() };
  for (const item of items) {
    const v = item.toLowerCase();
    if (v === '*') policy.any = true;
    else if (v === 'lan') policy.lan = true;
    else if (v === 'null') policy.allowNull = true;
    else {
      try {
        policy.origins.add(new URL(item).origin);
      } catch {
        throw new ConfigError(`REPARO_CORS contiene un origen inválido: "${item}" (usa p. ej. https://taller.ejemplo.com).`);
      }
    }
  }
  return policy;
}

export function readConfig(env = process.env) {
  const dataDir = path.resolve(env.REPARO_DATA_DIR || path.join(SERVER_DIR, 'data'));
  const certFile = env.REPARO_TLS_CERT || '';
  const keyFile = env.REPARO_TLS_KEY || '';
  if (Boolean(certFile) !== Boolean(keyFile)) {
    throw new ConfigError('Para HTTPS define ambas variables: REPARO_TLS_CERT y REPARO_TLS_KEY.');
  }
  let tls = null;
  if (certFile) {
    try {
      tls = { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile), certFile, keyFile };
    } catch (err) {
      throw new ConfigError(`No se pudo leer el certificado TLS: ${err.message}`);
    }
  }

  const dailyRaw = env.REPARO_DAILY_HOUR;
  const dailyHour =
    dailyRaw === undefined || String(dailyRaw).trim() === '' ? null : int(env, 'REPARO_DAILY_HOUR', null, { min: 0, max: 23 });

  const subject = (env.REPARO_VAPID_SUBJECT || 'mailto:reparo@example.com').trim();
  if (!/^(mailto:|https:\/\/)/.test(subject)) {
    throw new ConfigError('REPARO_VAPID_SUBJECT debe empezar con "mailto:" o "https://" (p. ej. mailto:tu@correo.com).');
  }

  const currency = (env.REPARO_CURRENCY || 'MXN').trim().toUpperCase();
  const locale = (env.REPARO_LOCALE || 'es-MX').trim();
  try {
    new Intl.NumberFormat(locale, { style: 'currency', currency });
  } catch {
    throw new ConfigError(`Moneda o locale no válidos: REPARO_CURRENCY="${currency}", REPARO_LOCALE="${locale}".`);
  }

  return {
    version: VERSION,
    host: (env.REPARO_HOST || env.HOST || '0.0.0.0').trim(),
    port: int(env, env.REPARO_PORT !== undefined ? 'REPARO_PORT' : 'PORT', 8787, { min: 0, max: 65535 }),
    appDir: resolveAppDir(env),
    dataDir,
    dbFile: path.join(dataDir, 'reparo.db'),
    vapidFile: path.join(dataDir, 'vapid.json'),
    tls,
    cors: parseCors(env.REPARO_CORS),
    token: (env.REPARO_TOKEN || '').trim(),
    allowedHosts: list(env.REPARO_HOSTS).map((h) => h.toLowerCase()),
    maxBodyBytes: int(env, 'REPARO_MAX_BODY_MB', 25, { min: 1, max: 1024 }) * 1024 * 1024,
    vapidSubject: subject,
    dailyHour,
    currency,
    locale,
    cspConnect: list(env.REPARO_CSP_CONNECT),
    hsts: env.REPARO_HSTS === '1' || env.REPARO_HSTS === 'true',
    logLevel: (env.REPARO_LOG || 'info').trim().toLowerCase(),
    /** Sólo para pruebas: acepta endpoints push http:// o locales (servicio push simulado). */
    pushAllowInsecure: env.REPARO_PUSH_INSECURE === '1',
  };
}

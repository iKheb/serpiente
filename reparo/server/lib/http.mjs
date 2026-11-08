// Utilidades HTTP: errores JSON en español, lectura de cuerpos con límite,
// compresión de respuestas, CORS y cabeceras de seguridad.
import net from 'node:net';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

const brotli = promisify(zlib.brotliCompress);
const gzip = promisify(zlib.gzip);

export class HttpError extends Error {
  constructor(status, message, code = 'ERROR', headers = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

/* ---------------------------- Cabeceras base ----------------------------- */

export const PERMISSIONS_POLICY =
  'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), display-capture=()';

/** CSP para la app single-file: scripts/estilos en línea y URIs data:/blob:, sin recursos de terceros. */
export function appCsp(extraConnect = []) {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    `connect-src ${["'self'", 'data:', 'blob:', 'https:', ...extraConnect].join(' ')}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function securityHeaders(config) {
  const h = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': PERMISSIONS_POLICY,
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
  if (config?.hsts && config?.tls) h['Strict-Transport-Security'] = 'max-age=15552000';
  return h;
}

/* --------------------------- Respuestas JSON ----------------------------- */

function pickEncoding(req) {
  const ae = String(req.headers['accept-encoding'] || '');
  if (/\bbr\b/.test(ae)) return 'br';
  if (/\bgzip\b/.test(ae)) return 'gzip';
  return null;
}

export { pickEncoding };

export async function sendJson(req, res, status, obj, headers = {}) {
  let body = Buffer.from(JSON.stringify(obj));
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    ...headers,
  };
  if (body.length >= 2048) {
    const enc = pickEncoding(req);
    if (enc === 'br') body = await brotli(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
    else if (enc === 'gzip') body = await gzip(body, { level: 6 });
    if (enc) {
      h['Content-Encoding'] = enc;
      h.Vary = h.Vary ? `${h.Vary}, Accept-Encoding` : 'Accept-Encoding';
    }
  }
  h['Content-Length'] = String(body.length);
  if (res.headersSent) return;
  res.writeHead(status, h);
  res.end(req.method === 'HEAD' ? undefined : body);
}

export function sendError(req, res, err) {
  const status = err.status || 500;
  const message = status >= 500 && !(err instanceof HttpError) ? 'Error interno del servidor.' : err.message;
  return sendJson(req, res, status, { ok: false, error: message, code: err.code || 'ERROR' }, err.headers || {});
}

/* --------------------------- Lectura de cuerpos -------------------------- */

/** Lee el cuerpo (con límite, admite gzip/br/deflate) y lo interpreta como JSON. */
export function readJsonBody(req, limit) {
  const type = String(req.headers['content-type'] || '').toLowerCase();
  if (!type.startsWith('application/json')) {
    return Promise.reject(new HttpError(415, 'El cuerpo debe ser JSON (Content-Type: application/json).', 'TIPO_NO_SOPORTADO'));
  }
  const mb = Math.round(limit / 1024 / 1024);
  const tooLarge = () =>
    new HttpError(413, `La solicitud supera el límite de ${mb} MB (REPARO_MAX_BODY_MB).`, 'DEMASIADO_GRANDE', { Connection: 'close' });
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    req.resume();
    return Promise.reject(tooLarge());
  }
  const enc = String(req.headers['content-encoding'] || 'identity').toLowerCase().trim();
  let stream = req;
  if (enc === 'gzip' || enc === 'x-gzip') stream = req.pipe(zlib.createGunzip({ maxOutputLength: limit + 1 }));
  else if (enc === 'br') stream = req.pipe(zlib.createBrotliDecompress({ maxOutputLength: limit + 1 }));
  else if (enc === 'deflate') stream = req.pipe(zlib.createInflate({ maxOutputLength: limit + 1 }));
  else if (enc !== 'identity') {
    req.resume();
    return Promise.reject(new HttpError(415, `Codificación de contenido no soportada: ${enc}.`, 'CODIFICACION_NO_SOPORTADA'));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const fail = (err) => {
      if (done) return;
      done = true;
      req.resume();
      reject(err);
    };
    stream.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) return fail(tooLarge());
      chunks.push(c);
    });
    stream.on('error', (err) =>
      fail(err instanceof HttpError ? err : new HttpError(400, 'No se pudo leer el cuerpo de la solicitud (¿compresión dañada?).', 'CUERPO_INVALIDO')),
    );
    req.on('aborted', () => fail(new HttpError(400, 'La solicitud se interrumpió.', 'INTERRUMPIDA')));
    stream.on('end', () => {
      if (done) return;
      done = true;
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return reject(new HttpError(400, 'El cuerpo de la solicitud está vacío.', 'CUERPO_VACIO'));
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, 'El cuerpo no es JSON válido.', 'JSON_INVALIDO'));
      }
    });
  });
}

/* ------------------------------ Red y CORS ------------------------------- */

export function hostnameOf(hostHeader) {
  const h = String(hostHeader || '').trim().toLowerCase();
  if (h.startsWith('[')) return h.slice(1, h.indexOf(']'));
  const i = h.lastIndexOf(':');
  return i > -1 && h.indexOf(':') === i ? h.slice(0, i) : h;
}

export function isLoopbackHost(host) {
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127\./.test(host);
}

export function isPrivateIp(host) {
  if (net.isIPv4(host)) {
    const [a, b] = host.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIPv6(host)) return host === '::1' || /^f[cd]/i.test(host) || /^fe80:/i.test(host);
  return false;
}

/**
 * Protección contra DNS rebinding: sin token, la API sólo responde a nombres de
 * host "locales" (IP, localhost, *.local, *.lan, *.home.arpa, *.internal) o a los
 * listados en REPARO_HOSTS. Con REPARO_TOKEN no hace falta (el atacante no lo conoce).
 */
export function hostAllowed(hostHeader, config) {
  if (config.token) return true;
  if (!hostHeader) return true;
  const host = hostnameOf(hostHeader);
  if (net.isIP(host) || isLoopbackHost(host)) return true;
  if (/\.(local|lan|home\.arpa|internal)$/.test(host)) return true;
  return config.allowedHosts.includes(host);
}

/** ¿Se permite este Origin para la API? (sin Origin = cliente no navegador o mismo origen). */
export function originAllowed(origin, req, cors) {
  if (!origin) return true;
  if (origin === 'null') return cors.any || cors.allowNull;
  if (cors.any) return true;
  let u;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (req.headers.host && u.host.toLowerCase() === String(req.headers.host).toLowerCase()) return true;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isLoopbackHost(host)) return true;
  if (cors.origins.has(u.origin)) return true;
  if (cors.lan && isPrivateIp(host)) return true;
  return false;
}

export function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin) return {};
  const h = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Content-Encoding, Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  // Chrome "Private Network Access": permite que una página pública hable con el servidor de la LAN.
  if (req.headers['access-control-request-private-network'] === 'true') h['Access-Control-Allow-Private-Network'] = 'true';
  return h;
}

export function clientIp(req) {
  return req.socket?.remoteAddress?.replace(/^::ffff:/, '') ?? null;
}

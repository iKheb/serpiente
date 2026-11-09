// Web Push sin dependencias:
// - RFC 8291: cifrado del mensaje (ECDH P-256 + HKDF-SHA256 + AES-128-GCM, "aes128gcm" de RFC 8188).
// - RFC 8292: identificación del servidor de aplicación con VAPID (JWT ES256).
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

/* ------------------------------ base64url -------------------------------- */

export const b64url = {
  encode: (buf) => Buffer.from(buf).toString('base64url'),
  /** Acepta base64url o base64 estándar, con o sin relleno. */
  decode: (str) => Buffer.from(String(str).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'), 'base64url'),
};

const toBuf = (v) => (Buffer.isBuffer(v) ? v : v instanceof Uint8Array ? Buffer.from(v) : b64url.decode(v));

/* --------------------------------- HKDF ---------------------------------- */

/** HKDF-SHA256 (RFC 5869) para longitudes ≤ 32 bytes (un solo bloque de expansión). */
export function hkdf(salt, ikm, info, length) {
  if (length > 32) throw new RangeError('hkdf: longitud máxima 32');
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  return crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, length);
}

/* ------------------------------ Llaves VAPID ----------------------------- */

function publicFromJwk(jwk) {
  return Buffer.concat([Buffer.from([4]), b64url.decode(jwk.x), b64url.decode(jwk.y)]);
}

/** Genera un par de llaves VAPID (ECDSA P-256). Devuelve base64url: pública sin comprimir (65 B) y privada (32 B). */
export function generateVapidKeys() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  return { publicKey: b64url.encode(publicFromJwk(jwk)), privateKey: jwk.d };
}

/** Construye los KeyObject de node:crypto a partir de las llaves en base64url, verificando que formen un par. */
export function vapidKeyObjects(publicKey, privateKey) {
  const pub = toBuf(publicKey);
  const d = toBuf(privateKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('La llave pública VAPID debe ser un punto P-256 sin comprimir de 65 bytes.');
  if (d.length !== 32) throw new Error('La llave privada VAPID debe tener 32 bytes.');
  const x = b64url.encode(pub.subarray(1, 33));
  const y = b64url.encode(pub.subarray(33, 65));
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(d);
  if (!ecdh.getPublicKey().equals(pub)) throw new Error('La llave pública VAPID no corresponde a la privada.');
  const priv = crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x, y, d: b64url.encode(d) }, format: 'jwk' });
  const pubKey = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x, y }, format: 'jwk' });
  return { privateKeyObject: priv, publicKeyObject: pubKey };
}

/**
 * Lee server/data/vapid.json o lo crea la primera vez (permisos 600).
 * Si el archivo existe pero está dañado se lanza un error (regenerarlo
 * invalidaría todas las suscripciones de los dispositivos).
 */
export function loadOrCreateVapid(file, subject) {
  let created = false;
  let keys;
  if (fs.existsSync(file)) {
    try {
      keys = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`No se pudo leer ${file}: ${err.message}. Restáuralo desde un respaldo o bórralo para generar llaves nuevas (los dispositivos tendrán que volver a activar las notificaciones).`);
    }
  } else {
    keys = { ...generateVapidKeys(), createdAt: new Date().toISOString() };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ ...keys, subject }, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp, file);
    created = true;
  }
  const objects = vapidKeyObjects(keys.publicKey, keys.privateKey);
  return { publicKey: keys.publicKey, privateKey: keys.privateKey, subject, created, ...objects };
}

/* ------------------------------- JWT ES256 ------------------------------- */

/** Crea el JWT VAPID (RFC 8292 §2): { aud: origen del push service, exp ≤ 24 h, sub: mailto/https }. */
export function createVapidJwt({ audience, subject, privateKeyObject, expiresInSeconds = 12 * 3600, now = Date.now() }) {
  const header = b64url.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = { aud: audience, exp: Math.floor(now / 1000) + expiresInSeconds, sub: subject };
  const input = `${header}.${b64url.encode(JSON.stringify(claims))}`;
  const signature = crypto.sign('sha256', Buffer.from(input), { key: privateKeyObject, dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64url.encode(signature)}`;
}

/** Verifica un JWT VAPID (firma, alg, aud, exp y sub). Devuelve { header, claims } o lanza un error. */
export function verifyVapidJwt(token, publicKey, { audience, now = Date.now() } = {}) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('JWT mal formado');
  const [h, p, s] = parts;
  const header = JSON.parse(b64url.decode(h).toString('utf8'));
  const claims = JSON.parse(b64url.decode(p).toString('utf8'));
  if (header.alg !== 'ES256') throw new Error('alg debe ser ES256');
  const pub = toBuf(publicKey);
  const key = crypto.createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: b64url.encode(pub.subarray(1, 33)), y: b64url.encode(pub.subarray(33, 65)) },
    format: 'jwk',
  });
  const sig = b64url.decode(s);
  if (sig.length !== 64) throw new Error('La firma ES256 debe medir 64 bytes (r||s)');
  const ok = crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, sig);
  if (!ok) throw new Error('Firma inválida');
  const nowS = Math.floor(now / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= nowS) throw new Error('JWT vencido');
  if (claims.exp > nowS + 24 * 3600) throw new Error('exp supera 24 horas');
  if (audience && claims.aud !== audience) throw new Error('aud no coincide');
  if (!/^(mailto:|https:\/\/)/.test(String(claims.sub))) throw new Error('sub debe ser mailto: o https:');
  return { header, claims };
}

/* --------------------------- Cifrado aes128gcm --------------------------- */

const KEY_INFO = Buffer.from('WebPush: info\0', 'latin1');
const CEK_INFO = Buffer.from('Content-Encoding: aes128gcm\0', 'latin1');
const NONCE_INFO = Buffer.from('Content-Encoding: nonce\0', 'latin1');
const TAG_LENGTH = 16;

function deriveKeys({ authSecret, ecdhSecret, uaPublic, asPublic, salt }) {
  const ikm = hkdf(authSecret, ecdhSecret, Buffer.concat([KEY_INFO, uaPublic, asPublic]), 32);
  return { cek: hkdf(salt, ikm, CEK_INFO, 16), nonce: hkdf(salt, ikm, NONCE_INFO, 12) };
}

/**
 * Cifra `plaintext` para una suscripción (RFC 8291 §3.4) en un único registro aes128gcm.
 * @param {Buffer|string} plaintext
 * @param {{ p256dh: string|Buffer, auth: string|Buffer }} keys llaves de la suscripción del navegador
 * @param {{ salt?: Buffer, asPrivateKey?: Buffer|string, recordSize?: number, padding?: number }} [opts]
 *        `salt` y `asPrivateKey` sólo se fijan en pruebas (vector del RFC); normalmente son aleatorios.
 */
export function encryptPayload(plaintext, keys, opts = {}) {
  const uaPublic = toBuf(keys.p256dh);
  const authSecret = toBuf(keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh inválida: se espera un punto P-256 sin comprimir (65 bytes).');
  if (authSecret.length !== 16) throw new Error('auth inválido: se esperan 16 bytes.');
  const salt = opts.salt ? toBuf(opts.salt) : crypto.randomBytes(16);
  if (salt.length !== 16) throw new Error('salt debe medir 16 bytes');
  const recordSize = opts.recordSize ?? 4096;
  const padding = opts.padding ?? 0;

  const ecdh = crypto.createECDH('prime256v1');
  if (opts.asPrivateKey) ecdh.setPrivateKey(toBuf(opts.asPrivateKey));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);
  const { cek, nonce } = deriveKeys({ authSecret, ecdhSecret, uaPublic, asPublic, salt });

  const data = Buffer.concat([Buffer.from(plaintext), Buffer.from([0x02]), Buffer.alloc(padding)]);
  if (data.length + TAG_LENGTH > recordSize) throw new Error('El mensaje push es demasiado grande para un solo registro.');
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(recordSize, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, ciphertext]);
}

/** Descifra un cuerpo aes128gcm del lado del navegador (pruebas y diagnóstico). */
export function decryptPayload(body, { uaPrivateKey, auth }) {
  const buf = toBuf(body);
  const salt = buf.subarray(0, 16);
  const idlen = buf[20];
  const asPublic = buf.subarray(21, 21 + idlen);
  const ciphertext = buf.subarray(21 + idlen);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(toBuf(uaPrivateKey));
  const uaPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(asPublic);
  const { cek, nonce } = deriveKeys({ authSecret: toBuf(auth), ecdhSecret, uaPublic, asPublic, salt });
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - TAG_LENGTH));
  const data = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - TAG_LENGTH)), decipher.final()]);
  let end = data.length - 1;
  while (end >= 0 && data[end] === 0) end--;
  if (end < 0 || data[end] !== 0x02) throw new Error('Delimitador de registro inválido');
  return data.subarray(0, end);
}

/* ------------------------------ Envío push ------------------------------- */

const MAX_PLAINTEXT = 3800;

/** Normaliza una suscripción del navegador ({ endpoint, keys: { p256dh, auth } }) o de la base. */
export function normalizeSubscription(sub) {
  if (!sub || typeof sub !== 'object') return null;
  const endpoint = sub.endpoint;
  const p256dh = sub.keys?.p256dh ?? sub.p256dh;
  const auth = sub.keys?.auth ?? sub.auth;
  if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  return { endpoint, p256dh, auth, deviceId: sub.deviceId };
}

/** Valida una suscripción recibida de un navegador. Devuelve un mensaje de error en español o null. */
export function validateSubscription(sub) {
  const s = normalizeSubscription(sub);
  if (!s) return 'La suscripción debe tener { endpoint, keys: { p256dh, auth } }.';
  let url;
  try {
    url = new URL(s.endpoint);
  } catch {
    return 'El endpoint de la suscripción no es una URL válida.';
  }
  if (url.protocol !== 'https:') return 'El endpoint de la suscripción debe usar https.';
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':') || !host.includes('.')) {
    return 'El endpoint de la suscripción debe ser un servicio push público.';
  }
  if (s.endpoint.length > 2048) return 'El endpoint de la suscripción es demasiado largo.';
  try {
    const p = b64url.decode(s.p256dh);
    if (p.length !== 65 || p[0] !== 4) return 'La llave p256dh de la suscripción no es válida.';
    if (b64url.decode(s.auth).length !== 16) return 'El secreto auth de la suscripción no es válido.';
  } catch {
    return 'Las llaves de la suscripción no son base64url válido.';
  }
  return null;
}

/** "Topic" (RFC 8030 §5.4): ≤ 32 caracteres base64url; reemplaza mensajes pendientes con el mismo tema. */
export function topicFor(tag) {
  return crypto.createHash('sha256').update(String(tag)).digest('base64url').slice(0, 32);
}

/** Recorta el payload para que quepa en un registro (4 KB). */
export function encodePayload(payload) {
  let json = JSON.stringify(payload);
  let body = String(payload.body ?? '');
  while (Buffer.byteLength(json) > MAX_PLAINTEXT && body.length > 0) {
    const over = Buffer.byteLength(json) - MAX_PLAINTEXT;
    body = body.slice(0, Math.max(0, body.length - over - 8));
    json = JSON.stringify({ ...payload, body: `${body}…` });
  }
  return Buffer.from(json);
}

/**
 * Construye la petición HTTP al servicio push (sin enviarla).
 * @returns {{ url: string, method: 'POST', headers: Record<string,string>, body: Buffer }}
 */
export function buildPushRequest(subscription, payload, { vapid, jwt, ttl = 86400, urgency = 'normal', topic, now = Date.now(), encryptOptions } = {}) {
  const sub = normalizeSubscription(subscription);
  if (!sub) throw new Error('Suscripción inválida');
  const url = new URL(sub.endpoint);
  const token =
    jwt ?? createVapidJwt({ audience: url.origin, subject: vapid.subject, privateKeyObject: vapid.privateKeyObject, now });
  const body = encryptPayload(Buffer.isBuffer(payload) ? payload : encodePayload(payload), sub, encryptOptions);
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Encoding': 'aes128gcm',
    'Content-Length': String(body.length),
    TTL: String(Math.max(0, Math.floor(ttl))),
    Urgency: urgency,
    Authorization: `vapid t=${token}, k=${vapid.publicKey}`,
  };
  if (topic) headers.Topic = topic;
  return { url: sub.endpoint, method: 'POST', headers, body };
}

const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 16 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 16 });

/** Envía la petición construida por buildPushRequest. Resuelve con { status, body } (no lanza por códigos HTTP). */
export function sendPushRequest(req, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(req.url);
    const mod = url.protocol === 'http:' ? http : https;
    const r = mod.request(
      url,
      { method: req.method, headers: req.headers, agent: url.protocol === 'http:' ? httpAgent : httpsAgent, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size <= 64 * 1024) chunks.push(c);
        });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      },
    );
    r.on('timeout', () => r.destroy(Object.assign(new Error('Tiempo de espera agotado'), { code: 'ETIMEDOUT' })));
    r.on('error', reject);
    r.end(req.body);
  });
}

export function closePushAgents() {
  httpsAgent.destroy();
  httpAgent.destroy();
}

/**
 * Envía notificaciones a las suscripciones guardadas en el SyncStore.
 * - 404/410 → elimina la suscripción (ya no existe en el navegador).
 * - JWT VAPID en caché por audiencia (se renueva 1 h antes de vencer).
 */
export class PushService {
  constructor({ store, vapid, log = () => {}, send = sendPushRequest, concurrency = 8 }) {
    this.store = store;
    this.vapid = vapid;
    this.log = log;
    this.send = send;
    this.concurrency = concurrency;
    this.jwtCache = new Map();
  }

  get publicKey() {
    return this.vapid.publicKey;
  }

  jwtFor(audience, now = Date.now()) {
    const hit = this.jwtCache.get(audience);
    if (hit && hit.exp - 3600 * 1000 > now) return hit.token;
    const expiresInSeconds = 12 * 3600;
    const token = createVapidJwt({
      audience,
      subject: this.vapid.subject,
      privateKeyObject: this.vapid.privateKeyObject,
      expiresInSeconds,
      now,
    });
    this.jwtCache.set(audience, { token, exp: now + expiresInSeconds * 1000 });
    return token;
  }

  async sendOne(sub, payload, opts) {
    const s = normalizeSubscription(sub);
    let host = '';
    try {
      host = new URL(s.endpoint).host;
      const req = buildPushRequest(s, payload, {
        vapid: this.vapid,
        jwt: this.jwtFor(new URL(s.endpoint).origin),
        ttl: opts.ttl,
        urgency: opts.urgency,
        topic: opts.topic,
      });
      const res = await this.send(req);
      if (res.status >= 200 && res.status < 300) {
        this.store.markSubscription(s.endpoint, true);
        return { ok: true, status: res.status };
      }
      if (res.status === 404 || res.status === 410) {
        this.store.removeSubscription(s.endpoint);
        this.log('push', `suscripción vencida eliminada (${host}, ${res.status})`);
        return { ok: false, removed: true, status: res.status, error: 'La suscripción ya no existe.' };
      }
      this.store.markSubscription(s.endpoint, false);
      const detail = res.body ? `: ${res.body.slice(0, 160).replace(/\s+/g, ' ')}` : '';
      return { ok: false, status: res.status, error: `El servicio push (${host}) respondió ${res.status}${detail}` };
    } catch (err) {
      this.store.markSubscription(s.endpoint, false);
      return { ok: false, error: `No se pudo contactar al servicio push${host ? ` (${host})` : ''}: ${err.code || err.message}` };
    }
  }

  async sendTo(subs, payload, opts = {}) {
    const result = { sent: 0, failed: 0, removed: 0, errors: [] };
    const queue = [...subs];
    const worker = async () => {
      while (queue.length) {
        const r = await this.sendOne(queue.shift(), payload, opts);
        if (r.ok) result.sent++;
        else {
          result.failed++;
          if (r.removed) result.removed++;
          else if (result.errors.length < 5) result.errors.push(r.error);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, queue.length) }, worker));
    return result;
  }

  /** Envía `payload` ({ title, body, href, tag, kind }) a los dispositivos indicados. */
  async notify(payload, { deviceId, excludeDeviceId, ttl = 86400, urgency = 'normal', topic } = {}) {
    const subs = this.store.subscriptions({ deviceId, excludeDeviceId });
    if (!subs.length) return { sent: 0, failed: 0, removed: 0, errors: [], subscriptions: 0 };
    const r = await this.sendTo(subs, payload, { ttl, urgency, topic: topic ?? (payload.tag ? topicFor(payload.tag) : undefined) });
    this.log('push', `"${payload.title}" → ${r.sent}/${subs.length} enviados${r.removed ? `, ${r.removed} eliminadas` : ''}${r.errors.length ? ` · ${r.errors[0]}` : ''}`);
    return { ...r, subscriptions: subs.length };
  }
}

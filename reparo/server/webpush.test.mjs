// @vitest-environment node
// Pruebas de Web Push: cifrado aes128gcm (RFC 8291), VAPID (RFC 8292) y envío.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, tempDir } from './lib/testkit.mjs';
import { SyncStore } from './lib/store.mjs';
import {
  PushService,
  b64url,
  buildPushRequest,
  createVapidJwt,
  decryptPayload,
  encodePayload,
  encryptPayload,
  generateVapidKeys,
  loadOrCreateVapid,
  topicFor,
  validateSubscription,
  vapidKeyObjects,
  verifyVapidJwt,
} from './lib/webpush.mjs';

/** Simula el navegador: par de llaves ECDH P-256 + secreto auth. */
function fakeBrowser() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return {
    privateKey: ecdh.getPrivateKey(),
    keys: { p256dh: b64url.encode(ecdh.getPublicKey()), auth: b64url.encode(auth) },
  };
}

function testVapid() {
  const k = generateVapidKeys();
  return { ...k, subject: 'mailto:taller@example.com', ...vapidKeyObjects(k.publicKey, k.privateKey) };
}

describe('RFC 8291 · cifrado aes128gcm', () => {
  // Vector de prueba de RFC 8291, sección 5.
  const V = {
    plaintext: 'When I grow up, I want to be a watermelon',
    asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
    salt: 'DGv6ra1nlYgDCS1FRnbzlw',
    message:
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  };

  it('reproduce byte a byte el mensaje del vector de prueba', () => {
    const out = encryptPayload(Buffer.from(V.plaintext), { p256dh: V.uaPublic, auth: V.auth }, { salt: V.salt, asPrivateKey: V.asPrivate });
    assert.equal(b64url.encode(out), V.message);
  });

  it('descifra el mensaje del vector con la llave privada del agente de usuario', () => {
    const pt = decryptPayload(V.message, { uaPrivateKey: V.uaPrivate, auth: V.auth });
    assert.equal(pt.toString('utf8'), V.plaintext);
  });

  it('ida y vuelta con llaves aleatorias, relleno y cabecera correcta', () => {
    const ua = fakeBrowser();
    const msg = JSON.stringify({ title: 'Hola', body: 'ñandú · ✓', href: '#/panel', tag: 't', kind: 'sistema' });
    const body = encryptPayload(msg, ua.keys, { padding: 7 });
    assert.equal(body.readUInt32BE(16), 4096, 'rs = 4096');
    assert.equal(body[20], 65, 'idlen = 65 (llave pública efímera sin comprimir)');
    assert.equal(body[21], 0x04);
    assert.equal(decryptPayload(body, { uaPrivateKey: ua.privateKey, auth: ua.keys.auth }).toString(), msg);
    // Cada envío usa salt y llave efímera distintos.
    assert.notDeepEqual(encryptPayload(msg, ua.keys), encryptPayload(msg, ua.keys));
  });

  it('rechaza llaves de suscripción mal formadas y mensajes demasiado grandes', () => {
    const ua = fakeBrowser();
    assert.throws(() => encryptPayload('x', { p256dh: 'AAAA', auth: ua.keys.auth }), /p256dh/);
    assert.throws(() => encryptPayload('x', { p256dh: ua.keys.p256dh, auth: 'AAAA' }), /auth/);
    assert.throws(() => encryptPayload(Buffer.alloc(5000), ua.keys), /demasiado grande/);
  });

  it('recorta el cuerpo del payload para que quepa en 4 KB', () => {
    const big = encodePayload({ title: 'T', body: 'x'.repeat(10000), href: '#/', tag: 't', kind: 'sistema' });
    assert.ok(big.length <= 3800);
    assert.equal(JSON.parse(big.toString()).title, 'T');
  });
});

describe('RFC 8292 · VAPID', () => {
  it('genera llaves P-256: pública sin comprimir de 65 bytes y privada de 32', () => {
    const k = generateVapidKeys();
    const pub = b64url.decode(k.publicKey);
    assert.equal(pub.length, 65);
    assert.equal(pub[0], 4);
    assert.equal(b64url.decode(k.privateKey).length, 32);
    assert.doesNotThrow(() => vapidKeyObjects(k.publicKey, k.privateKey));
    assert.throws(() => vapidKeyObjects(generateVapidKeys().publicKey, k.privateKey), /no corresponde/);
  });

  it('firma un JWT ES256 válido y detecta manipulaciones', () => {
    const v = testVapid();
    const now = Date.now();
    const jwt = createVapidJwt({ audience: 'https://fcm.googleapis.com', subject: v.subject, privateKeyObject: v.privateKeyObject, now });
    const { header, claims } = verifyVapidJwt(jwt, v.publicKey, { audience: 'https://fcm.googleapis.com', now });
    assert.deepEqual(header, { typ: 'JWT', alg: 'ES256' });
    assert.equal(claims.sub, 'mailto:taller@example.com');
    assert.equal(claims.exp, Math.floor(now / 1000) + 12 * 3600);
    assert.equal(b64url.decode(jwt.split('.')[2]).length, 64, 'firma r||s de 64 bytes');

    const [h, p, s] = jwt.split('.');
    const forged = b64url.encode(JSON.stringify({ aud: 'https://fcm.googleapis.com', exp: claims.exp, sub: 'mailto:otro@x.com' }));
    assert.throws(() => verifyVapidJwt(`${h}.${forged}.${s}`, v.publicKey), /Firma inválida/);
    assert.throws(() => verifyVapidJwt(jwt, generateVapidKeys().publicKey), /Firma inválida/);
    assert.throws(() => verifyVapidJwt(jwt, v.publicKey, { audience: 'https://updates.push.services.mozilla.com' }), /aud/);
    assert.throws(() => verifyVapidJwt(jwt, v.publicKey, { now: now + 13 * 3600 * 1000 }), /vencido/);
    const tooLong = createVapidJwt({ audience: 'https://a.b', subject: v.subject, privateKeyObject: v.privateKeyObject, expiresInSeconds: 25 * 3600 });
    assert.throws(() => verifyVapidJwt(tooLong, v.publicKey), /24 horas/);
    assert.ok(p);
  });

  it('crea vapid.json la primera vez (permisos 600) y lo reutiliza después', () => {
    const dir = tempDir();
    const file = path.join(dir, 'sub', 'vapid.json');
    const a = loadOrCreateVapid(file, 'mailto:a@b.com');
    assert.equal(a.created, true);
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const b = loadOrCreateVapid(file, 'mailto:a@b.com');
    assert.equal(b.created, false);
    assert.equal(b.publicKey, a.publicKey);
    fs.writeFileSync(file, '{ dañado');
    assert.throws(() => loadOrCreateVapid(file, 'mailto:a@b.com'), /No se pudo leer/);
  });
});

describe('petición al servicio push', () => {
  it('construye cabeceras (TTL, Urgency, Topic, VAPID) y un cuerpo que el navegador puede descifrar', () => {
    const v = testVapid();
    const ua = fakeBrowser();
    const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';
    const payload = { title: 'Stock bajo: Pantalla (quedan 1)', body: 'Mínimo 2', href: '#/inventario/i1', tag: 'stock-i1', kind: 'stock_bajo' };
    const req = buildPushRequest({ endpoint, keys: ua.keys }, payload, { vapid: v, ttl: 3600, urgency: 'high', topic: topicFor('stock-i1') });
    assert.equal(req.method, 'POST');
    assert.equal(req.url, endpoint);
    assert.equal(req.headers['Content-Encoding'], 'aes128gcm');
    assert.equal(req.headers['Content-Type'], 'application/octet-stream');
    assert.equal(req.headers.TTL, '3600');
    assert.equal(req.headers.Urgency, 'high');
    assert.match(req.headers.Topic, /^[A-Za-z0-9_-]{1,32}$/);
    assert.equal(Number(req.headers['Content-Length']), req.body.length);
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(req.headers.Authorization);
    assert.ok(m, 'Authorization: vapid t=…, k=…');
    assert.equal(m[2], v.publicKey);
    verifyVapidJwt(m[1], m[2], { audience: 'https://fcm.googleapis.com' });
    const decrypted = JSON.parse(decryptPayload(req.body, { uaPrivateKey: ua.privateKey, auth: ua.keys.auth }).toString());
    assert.deepEqual(decrypted, payload);
  });

  it('valida suscripciones del navegador', () => {
    const ua = fakeBrowser();
    assert.equal(validateSubscription({ endpoint: 'https://web.push.apple.com/QGx', keys: ua.keys }), null);
    assert.match(validateSubscription({ endpoint: 'http://push.example.com/x', keys: ua.keys }), /https/);
    assert.match(validateSubscription({ endpoint: 'https://127.0.0.1/x', keys: ua.keys }), /público/);
    assert.match(validateSubscription({ endpoint: 'https://push.example.com/x', keys: { p256dh: 'AAAA', auth: ua.keys.auth } }), /p256dh/);
    assert.match(validateSubscription({ endpoint: 'https://push.example.com/x' }), /keys/);
  });

  it('PushService envía, excluye al emisor y elimina suscripciones 404/410', async () => {
    const store = new SyncStore();
    const v = testVapid();
    const devA = fakeBrowser();
    const devB = fakeBrowser();
    const devC = fakeBrowser();
    store.upsertSubscription({ endpoint: 'https://push.example.com/a', deviceId: 'A', ...devA.keys });
    store.upsertSubscription({ endpoint: 'https://push.example.com/b', deviceId: 'B', ...devB.keys });
    store.upsertSubscription({ endpoint: 'https://push.example.com/gone', deviceId: 'C', ...devC.keys });
    const calls = [];
    const send = async (req) => {
      calls.push(req);
      if (req.url.endsWith('/gone')) return { status: 410, body: '' };
      return { status: 201, body: '' };
    };
    const push = new PushService({ store, vapid: v, send });
    const payload = { title: 'Equipo listo para entregar: Ana · Apple iPhone 13', body: 'Folio #000007', href: '#/clientes/c1', tag: 'listo-c1', kind: 'listo_sin_entregar' };
    const r = await push.notify(payload, { excludeDeviceId: 'A', urgency: 'high' });
    assert.equal(r.subscriptions, 2);
    assert.equal(r.sent, 1);
    assert.equal(r.removed, 1);
    assert.deepEqual(calls.map((c) => c.url).sort(), ['https://push.example.com/b', 'https://push.example.com/gone']);
    assert.deepEqual(store.subscriptions().map((s) => s.deviceId).sort(), ['A', 'B']);
    const forB = calls.find((c) => c.url.endsWith('/b'));
    assert.deepEqual(JSON.parse(decryptPayload(forB.body, { uaPrivateKey: devB.privateKey, auth: devB.keys.auth }).toString()), payload);
    // El JWT se reutiliza para la misma audiencia.
    assert.equal(push.jwtFor('https://push.example.com'), push.jwtFor('https://push.example.com'));

    const failing = new PushService({ store, vapid: v, send: async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); } });
    const r2 = await failing.notify(payload, { deviceId: 'B' });
    assert.equal(r2.sent, 0);
    assert.match(r2.errors[0], /No se pudo contactar al servicio push \(push\.example\.com\): ENOTFOUND/);
    assert.equal(store.subscriptions({ deviceId: 'B' }).length, 1, 'un error de red no elimina la suscripción');
    store.close();
  });
});

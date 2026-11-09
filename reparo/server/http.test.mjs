// @vitest-environment node
// Pruebas HTTP en proceso: API, CORS, token, estáticos y Web Push (con servicio push simulado).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { after, before, describe, it, tempDir, testConfig } from './lib/testkit.mjs';
import { createReparoServer } from './lib/app.mjs';
import { b64url, decryptPayload, verifyVapidJwt } from './lib/webpush.mjs';

function fakeBrowser() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { privateKey: ecdh.getPrivateKey(), keys: { p256dh: b64url.encode(ecdh.getPublicKey()), auth: b64url.encode(crypto.randomBytes(16)) } };
}

async function start(overrides = {}, opts = {}) {
  const config = await testConfig(overrides);
  const app = createReparoServer(config, opts);
  const { port } = await app.listen();
  const base = `http://127.0.0.1:${port}`;
  const req = (p, init = {}) => fetch(base + p, init);
  const post = (p, body, headers = {}) =>
    fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { app, base, req, post, config };
}

const waitFor = async (fn, ms = 2000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
};

describe('API pública y CORS', () => {
  let s;
  before(async () => {
    s = await start();
  });
  after(() => s.app.close());

  it('GET /api/health → { ok, version, time }', async () => {
    const r = await s.req('/api/health');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    const j = await r.json();
    assert.equal(j.ok, true);
    assert.equal(j.version, '1.0.0');
    assert.ok(Math.abs(j.time - Date.now()) < 5000);
  });

  it('GET /api/push/vapid-public-key → punto P-256 de 65 bytes en base64url', async () => {
    const { key } = await (await s.req('/api/push/vapid-public-key')).json();
    assert.match(key, /^[A-Za-z0-9_-]+$/);
    const raw = b64url.decode(key);
    assert.equal(raw.length, 65);
    assert.equal(raw[0], 4);
  });

  it('permite localhost y el mismo origen; rechaza otros orígenes con error en español', async () => {
    const ok = await s.req('/api/health', { headers: { Origin: 'http://localhost:5173' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const pre = await s.req('/api/sync', {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Private-Network': 'true' },
    });
    assert.equal(pre.status, 204);
    assert.match(pre.headers.get('access-control-allow-headers'), /Authorization/);
    assert.equal(pre.headers.get('access-control-allow-private-network'), 'true');
    const bad = await s.post('/api/sync', { deviceId: 'x', cursor: 0, changes: {} }, { Origin: 'https://malicioso.example' });
    assert.equal(bad.status, 403);
    const j = await bad.json();
    assert.equal(j.ok, false);
    assert.match(j.error, /Origen no permitido/);
    assert.equal(s.app.store.devices().length, 0, 'no se procesó la solicitud');
  });

  it('protege contra DNS rebinding sin token (nombres de host no locales)', async () => {
    const http = await import('node:http');
    const status = await new Promise((resolve) => {
      http.get(`${s.base}/api/sync/status`, { headers: { Host: 'atacante.example.com' } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
    });
    assert.equal(status, 403);
  });

  it('errores JSON: 404, 405, 415, 400 y 413', async () => {
    assert.equal((await s.req('/api/nada')).status, 404);
    const m = await s.req('/api/sync');
    assert.equal(m.status, 405);
    assert.equal(m.headers.get('allow'), 'POST');
    const t = await s.req('/api/sync', { method: 'POST', body: '{}', headers: { 'Content-Type': 'text/plain' } });
    assert.equal(t.status, 415);
    const bad = await s.req('/api/sync', { method: 'POST', body: '{nope', headers: { 'Content-Type': 'application/json' } });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).error, /JSON válido/);
    const inv = await s.post('/api/sync', { cursor: 0 });
    assert.equal(inv.status, 400);
    assert.match((await inv.json()).error, /deviceId/);
  });

  it('acepta cuerpos comprimidos con gzip', async () => {
    const body = zlib.gzipSync(JSON.stringify({ deviceId: 'gz', cursor: 0, changes: { clients: [{ id: 'gz1', updatedAt: 1, deviceId: 'gz' }] } }));
    const r = await s.req('/api/sync', { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).accepted, 1);
  });
});

describe('límite de tamaño', () => {
  it('responde 413 si el cuerpo supera REPARO_MAX_BODY_MB', async () => {
    const s = await start({ maxBodyBytes: 1024 });
    const r = await s.post('/api/sync', { deviceId: 'a', cursor: 0, changes: { audit: [{ id: 'x', ts: 1, big: 'x'.repeat(5000) }] } });
    assert.equal(r.status, 413);
    assert.match((await r.json()).error, /límite/);
    await s.app.close();
  });
});

describe('token (REPARO_TOKEN)', () => {
  let s;
  before(async () => {
    s = await start({ token: 'secreto-123' });
  });
  after(() => s.app.close());

  it('exige Authorization: Bearer en la API, salvo health y la llave pública', async () => {
    assert.equal((await s.req('/api/health')).status, 200);
    assert.equal((await s.req('/api/push/vapid-public-key')).status, 200);
    const no = await s.post('/api/sync', { deviceId: 'a', cursor: 0, changes: {} });
    assert.equal(no.status, 401);
    assert.match((await no.json()).error, /Token inválido o ausente/);
    const wrong = await s.post('/api/sync', { deviceId: 'a', cursor: 0, changes: {} }, { Authorization: 'Bearer otro' });
    assert.equal(wrong.status, 401);
    const ok = await s.post('/api/sync', { deviceId: 'a', cursor: 0, changes: {} }, { Authorization: 'Bearer secreto-123' });
    assert.equal(ok.status, 200);
    const st = await s.req('/api/sync/status', { headers: { Authorization: 'Bearer secreto-123' } });
    assert.equal((await st.json()).devices.length, 1);
  });
});

describe('archivos estáticos', () => {
  let s;
  let appDir;
  before(async () => {
    appDir = tempDir('reparo-app-');
    fs.writeFileSync(path.join(appDir, 'index.html'), `<!doctype html><title>Reparo</title><script>${'console.log(1);'.repeat(500)}</script>`);
    fs.writeFileSync(path.join(appDir, 'sw.js'), `self.addEventListener('push', () => {});${' '.repeat(2000)}`);
    fs.writeFileSync(path.join(appDir, 'manifest.webmanifest'), '{"name":"Reparo"}');
    fs.writeFileSync(path.join(appDir, 'icon-192.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(path.dirname(appDir), 'secreto.txt'), 'no');
    s = await start({ appDir });
  });
  after(() => s.app.close());

  it('sirve index.html con CSP, no-cache, ETag y compresión brotli/gzip', async () => {
    const r = await s.req('/', { headers: { 'Accept-Encoding': 'br' } });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(r.headers.get('cache-control'), 'no-cache');
    assert.match(r.headers.get('content-security-policy'), /script-src 'self' 'unsafe-inline'/);
    assert.match(r.headers.get('content-security-policy'), /img-src 'self' data: blob:/);
    assert.match(r.headers.get('permissions-policy'), /camera=\(self\)/);
    assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    assert.match(await r.text(), /<title>Reparo<\/title>/);
    const etag = r.headers.get('etag');
    assert.ok(etag);
    const again = await s.req('/', { headers: { 'If-None-Match': etag } });
    assert.equal(again.status, 304);

    const raw = await new Promise((resolve) => {
      import('node:http').then(({ get }) =>
        get(`${s.base}/index.html`, { headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({ enc: res.headers['content-encoding'], vary: res.headers.vary, body: Buffer.concat(chunks) }));
        }),
      );
    });
    assert.equal(raw.enc, 'gzip');
    assert.equal(raw.vary, 'Accept-Encoding');
    assert.match(zlib.gunzipSync(raw.body).toString(), /Reparo/);
  });

  it('MIME y caché correctos para sw.js, manifest e íconos', async () => {
    const sw = await s.req('/sw.js');
    assert.equal(sw.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(sw.headers.get('cache-control'), 'no-cache');
    const mf = await s.req('/manifest.webmanifest');
    assert.equal(mf.headers.get('content-type'), 'application/manifest+json; charset=utf-8');
    assert.equal(mf.headers.get('cache-control'), 'no-cache');
    const icon = await s.req('/icon-192.png');
    assert.equal(icon.headers.get('content-type'), 'image/png');
    assert.equal(icon.headers.get('cache-control'), 'public, max-age=86400');
  });

  it('no permite salir de la carpeta de la app ni leer archivos ocultos', async () => {
    const http = await import('node:http');
    const get = (p) =>
      new Promise((resolve) => http.get({ host: '127.0.0.1', port: new URL(s.base).port, path: p }, (res) => (res.resume(), resolve(res.statusCode))));
    assert.equal(await get('/../secreto.txt'), 404);
    assert.equal(await get('/%2e%2e/secreto.txt'), 404);
    assert.equal(await get('/.env'), 404);
    assert.equal(await get('/no-existe.js'), 404);
  });

  it('las rutas de página sin extensión devuelven la app', async () => {
    const r = await s.req('/clientes', { headers: { Accept: 'text/html' } });
    assert.equal(r.status, 200);
    assert.match(await r.text(), /Reparo/);
  });
});

describe('Web Push extremo a extremo (servicio push simulado)', () => {
  let s;
  const sent = [];
  before(async () => {
    s = await start({}, { pushSend: async (req) => (sent.push(req), { status: 201, body: '' }) });
  });
  after(() => s.app.close());

  it('suscribe, envía la prueba cifrada y firmada, y desuscribe', async () => {
    const ua = fakeBrowser();
    const endpoint = 'https://fcm.googleapis.com/fcm/send/dispositivo-a';
    const bad = await s.post('/api/push/subscribe', { deviceId: 'A', subscription: { endpoint: 'http://x', keys: ua.keys } });
    assert.equal(bad.status, 400);
    assert.equal((await s.post('/api/push/subscribe', { deviceId: 'A', subscription: { endpoint, keys: ua.keys } })).status, 200);

    const none = await s.post('/api/push/test', { deviceId: 'otro' });
    assert.equal(none.status, 404);
    assert.match((await none.json()).error, /no tiene una suscripción/);

    const t = await s.post('/api/push/test', { deviceId: 'A' });
    assert.equal(t.status, 200);
    assert.equal((await t.json()).sent, 1);
    const req = sent.at(-1);
    assert.equal(req.url, endpoint);
    assert.equal(req.headers['Content-Encoding'], 'aes128gcm');
    assert.ok(Number(req.headers.TTL) > 0);
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(req.headers.Authorization);
    const { key } = await (await s.req('/api/push/vapid-public-key')).json();
    assert.equal(k, key);
    verifyVapidJwt(jwt, key, { audience: 'https://fcm.googleapis.com' });
    const payload = JSON.parse(decryptPayload(req.body, { uaPrivateKey: ua.privateKey, auth: ua.keys.auth }).toString());
    assert.deepEqual(payload, { title: 'Notificaciones push activadas en Reparo', body: payload.body, href: '#/ajustes', tag: 'push-test', kind: 'sistema' });

    const un = await s.post('/api/push/unsubscribe', { endpoint });
    assert.deepEqual(await un.json(), { ok: true, removed: true });
    assert.equal(s.app.store.subscriptionCount(), 0);
  });

  it('tras sincronizar avisa a los OTROS dispositivos: stock bajo y equipo listo', async () => {
    const uaA = fakeBrowser();
    const uaB = fakeBrowser();
    await s.post('/api/push/subscribe', { deviceId: 'A', subscription: { endpoint: 'https://push.example.com/A', keys: uaA.keys } });
    await s.post('/api/push/subscribe', { deviceId: 'B', subscription: { endpoint: 'https://push.example.com/B', keys: uaB.keys } });
    const it0 = { id: 'inv1', nombre: 'Batería Galaxy A52', stock: 5, stockMinimo: 2, updatedAt: 1, deviceId: 'A', deletedAt: null };
    const c0 = { id: 'cli1', folio: 3, nombre: 'Luis', marca: 'Samsung', modelo: 'A52', servicio: 'Cambio de batería', estado: 'reparando', updatedAt: 1, deviceId: 'A', deletedAt: null };
    await s.post('/api/sync', { deviceId: 'A', cursor: 0, changes: { inventory: [it0], clients: [c0] } });
    sent.length = 0;
    await s.post('/api/sync', {
      deviceId: 'A',
      cursor: 0,
      changes: { inventory: [{ ...it0, stock: 1, updatedAt: 2 }], clients: [{ ...c0, estado: 'listo', updatedAt: 2 }] },
    });
    assert.ok(await waitFor(() => sent.length >= 2), 'se enviaron 2 push');
    assert.ok(sent.every((r) => r.url.endsWith('/B')), 'no se notifica al dispositivo que hizo el cambio');
    const titles = sent.map((r) => JSON.parse(decryptPayload(r.body, { uaPrivateKey: uaB.privateKey, auth: uaB.keys.auth }).toString()).title).sort();
    assert.deepEqual(titles, ['Equipo listo para entregar: Luis · Samsung A52', 'Stock bajo: Batería Galaxy A52 (quedan 1)']);
  });
});

// @vitest-environment node
// Prueba de extremo a extremo: arranca `node server/index.mjs` real en un puerto
// libre, simula dos dispositivos sincronizando (sin navegador) y valida la
// convergencia, la llave VAPID, el envío push cifrado y el cierre ordenado.
import assert from 'node:assert/strict';
import { after, before, describe, it } from './lib/testkit.mjs';
import { runSimulation, startFakePushService, startTempServer } from './tools/simular-dispositivos.mjs';

describe('servidor real + dos dispositivos', () => {
  const token = 'token-de-prueba-e2e';
  let srv;
  let push;
  let stopped = null;

  before(async () => {
    push = await startFakePushService();
    srv = await startTempServer({ env: { REPARO_TOKEN: token, REPARO_PUSH_INSECURE: '1' } });
  });

  after(async () => {
    if (!stopped) await srv?.stop();
    await push?.close();
  });

  it('imprime el arranque en español', () => {
    assert.match(srv.output, /Reparo · servidor/);
    assert.match(srv.output, /Local:\s+http:\/\/localhost:\d+/);
    assert.match(srv.output, /service worker .* HTTPS o en localhost/s);
  });

  it('GET /api/push/vapid-public-key responde la llave pública (65 bytes, base64url)', async () => {
    const r = await fetch(`${srv.url}/api/push/vapid-public-key`);
    assert.equal(r.status, 200);
    const { key } = await r.json();
    assert.equal(Buffer.from(key, 'base64url').length, 65);
  });

  it('dos dispositivos convergen (LWW, append-only, purgas, paginación y push)', async () => {
    const result = await runSimulation({ baseUrl: srv.url, token, fakePush: push });
    assert.equal(result.devices, 3);
    assert.equal(result.rows.audit > 2500, true);
  });

  it('se detiene ordenadamente con SIGTERM', async () => {
    stopped = await srv.stop();
    assert.equal(stopped.code, 0);
    assert.match(stopped.output, /Servidor detenido\. Datos guardados\./);
  });
});

#!/usr/bin/env node
// Simulación de extremo a extremo SIN navegador:
//   node server/tools/simular-dispositivos.mjs
// Arranca un servidor temporal (puerto libre, datos en una carpeta temporal),
// simula dos dispositivos (mostrador y celular del técnico) que editan y
// sincronizan con el mismo algoritmo que src/data/sync.ts, y comprueba que
// convergen. También levanta un "servicio push" falso para verificar que los
// avisos salen cifrados (aes128gcm) y firmados (VAPID). No toca server/data.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { b64url, decryptPayload, verifyVapidJwt } from '../lib/webpush.mjs';

const SERVER_ENTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'index.mjs');
const LWW = ['clients', 'expenses', 'inventory'];
const TABLES = [...LWW, 'movements', 'audit'];
const ENTITY = { clients: 'cliente', expenses: 'gasto', inventory: 'inventario' };
const ENTITY_TABLE = { cliente: 'clients', gasto: 'expenses', inventario: 'inventory' };
const MOVEMENT_WINDOW_MS = 60 * 24 * 3600 * 1000;
const CHUNK_ROWS = 1000;

const stampOf = (t, r) => Number(LWW.includes(t) ? r.updatedAt : r.ts);
function lwwWins(a, b) {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
  if (a.deviceId !== b.deviceId) return String(a.deviceId) > String(b.deviceId);
  return (a.rev || 0) > (b.rev || 0);
}

/* ------------------------- Dispositivo simulado -------------------------- */

/** Réplica en memoria de la base local + el algoritmo de src/data/sync.ts. */
export class SimDevice {
  constructor(name, baseUrl, { token = '' } = {}) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.token = token;
    this.deviceId = `${name}-${crypto.randomUUID()}`;
    this.tables = Object.fromEntries(TABLES.map((t) => [t, new Map()]));
    this.meta = { cursor: 0, pushedAt: {}, serverId: null, movements: {} };
    this.clock = 0;
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    this.push = { privateKey: ecdh.getPrivateKey(), keys: { p256dh: b64url.encode(ecdh.getPublicKey()), auth: b64url.encode(crypto.randomBytes(16)) } };
  }

  now() {
    this.clock = Math.max(this.clock + 1, Date.now());
    return this.clock;
  }

  /** Alta/edición con auditoría (como hace la capa de datos). */
  put(table, patch, { updatedAt } = {}) {
    const prev = this.tables[table].get(patch.id);
    const t = updatedAt ?? this.now();
    const row = { ...(prev ?? { createdAt: t, deletedAt: null, rev: 0 }), ...patch, updatedAt: t, deviceId: this.deviceId, rev: (prev?.rev ?? 0) + 1 };
    if (table === 'clients') row.numFotos = 0;
    this.tables[table].set(row.id, row);
    this.audit(prev ? 'editar' : 'crear', table, row.id);
    return row;
  }

  append(table, row) {
    const full = { ...row, ts: row.ts ?? this.now(), deviceId: this.deviceId };
    this.tables[table].set(full.id, full);
    return full;
  }

  audit(action, table, entityId) {
    return this.append('audit', { id: crypto.randomUUID(), action, entity: ENTITY[table] ?? 'sistema', entityId, title: entityId, summary: action, changes: [], snapshot: null });
  }

  purge(table, id) {
    this.tables[table].delete(id);
    this.audit('purgar', table, id);
  }

  collectPending(now) {
    const isLocal = (r) => !r.deviceId || r.deviceId === this.deviceId;
    const out = {};
    for (const t of TABLES) {
      const wm = this.meta.pushedAt[t];
      let rows = [...this.tables[t].values()];
      if (wm !== undefined) {
        if (t === 'movements') {
          const floor = Math.min(wm, now - MOVEMENT_WINDOW_MS);
          rows = rows.filter((r) => r.ts > floor && isLocal(r) && (r.ts > wm || !(r.id in this.meta.movements)));
        } else rows = rows.filter((r) => stampOf(t, r) > wm && isLocal(r));
      }
      out[t] = rows.sort((a, b) => stampOf(t, a) - stampOf(t, b));
    }
    return out;
  }

  static chunk(pending) {
    const chunks = [];
    let cur = {};
    let n = 0;
    for (const t of TABLES) {
      for (const r of pending[t]) {
        if (n >= CHUNK_ROWS) {
          chunks.push(cur);
          cur = {};
          n = 0;
        }
        (cur[t] ??= []).push(r);
        n++;
      }
    }
    chunks.push(cur);
    return chunks;
  }

  apply(changes) {
    let applied = 0;
    for (const t of TABLES) {
      for (const r of changes[t] ?? []) {
        const local = this.tables[t].get(r.id);
        if (LWW.includes(t) ? !local || lwwWins(r, local) : !local) {
          this.tables[t].set(r.id, t === 'clients' ? { ...r, numFotos: 0 } : r);
          applied++;
        }
      }
    }
    for (const a of changes.audit ?? []) {
      const t = a.action === 'purgar' ? ENTITY_TABLE[a.entity] : null;
      const local = t && this.tables[t].get(a.entityId);
      if (local && local.updatedAt <= a.ts) {
        this.tables[t].delete(a.entityId);
        applied++;
      }
    }
    return applied;
  }

  async post(body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(`${this.baseUrl}/api/sync`, { method: 'POST', headers, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(`${this.name}: ${res.status} ${json.error}`);
    return json;
  }

  async sync() {
    const stats = { pushed: 0, pulled: 0, requests: 0, sawMore: false };
    for (let attempt = 0; attempt < 3; attempt++) {
      const startedAt = Date.now();
      const pending = this.collectPending(startedAt);
      let res = null;
      let restart = false;
      for (const changes of SimDevice.chunk(pending)) {
        res = await this.post({ deviceId: this.deviceId, cursor: this.meta.cursor, changes });
        stats.requests++;
        if (res.resync || (this.meta.serverId && res.serverId !== this.meta.serverId)) {
          this.meta = { cursor: 0, pushedAt: {}, serverId: res.serverId, movements: {} };
          restart = true;
          break;
        }
        this.meta.serverId = res.serverId;
        stats.pushed += res.accepted;
        stats.pulled += this.apply(res.changes);
        stats.sawMore ||= res.more;
        this.meta.cursor = res.cursor;
        for (const r of changes.movements ?? []) if (r.deviceId === this.deviceId) this.meta.movements[r.id] = r.ts;
      }
      if (restart) continue;
      for (const t of TABLES) {
        let wm = this.meta.pushedAt[t] ?? 0;
        for (const r of pending[t]) if (r.deviceId === this.deviceId) wm = Math.max(wm, Math.min(stampOf(t, r), startedAt));
        this.meta.pushedAt[t] = wm;
      }
      while (res?.more) {
        res = await this.post({ deviceId: this.deviceId, cursor: this.meta.cursor, changes: {} });
        stats.requests++;
        stats.sawMore = true;
        stats.pulled += this.apply(res.changes);
        this.meta.cursor = res.cursor;
      }
      break;
    }
    return stats;
  }

  /** Copia canónica de todas las tablas para comparar dispositivos. */
  snapshot() {
    return Object.fromEntries(TABLES.map((t) => [t, [...this.tables[t].values()].sort((a, b) => (a.id < b.id ? -1 : 1))]));
  }

  counts() {
    return Object.fromEntries(TABLES.map((t) => [t, this.tables[t].size]));
  }
}

/* --------------------------- Infraestructura ----------------------------- */

/** Arranca `node server/index.mjs` en un puerto libre con datos temporales. */
export async function startTempServer({ env = {}, timeoutMs = 15000 } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reparo-e2e-'));
  const proc = spawn(process.execPath, [SERVER_ENTRY], {
    env: { ...process.env, REPARO_PORT: '0', REPARO_HOST: '127.0.0.1', REPARO_DATA_DIR: dataDir, REPARO_LOG: 'info', NO_COLOR: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const exited = new Promise((resolve) => proc.once('exit', (code, signal) => resolve({ code, signal })));
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`El servidor no arrancó a tiempo.\n${output}`)), timeoutMs);
    const onData = (chunk) => {
      output += chunk;
      const m = /escuchando en el puerto (\d+)/.exec(output);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    exited.then(({ code }) => {
      clearTimeout(timer);
      reject(new Error(`El servidor terminó (código ${code}).\n${output}`));
    });
  });
  return {
    url: `http://127.0.0.1:${port}`,
    dataDir,
    get output() {
      return output;
    },
    async stop() {
      proc.kill('SIGTERM');
      const r = await exited;
      fs.rmSync(dataDir, { recursive: true, force: true });
      return { ...r, output };
    },
  };
}

/** "Servicio push" local que registra lo recibido (el real sería FCM, Mozilla o Apple). */
export async function startFakePushService() {
  const received = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(201);
      res.end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    received,
    async waitFor(pred, ms = 3000) {
      const t = Date.now();
      while (Date.now() - t < ms) {
        const hit = received.find(pred);
        if (hit) return hit;
        await new Promise((r) => setTimeout(r, 20));
      }
      return null;
    },
    close: () => new Promise((r) => server.close(r)),
  };
}

function openPush(device, msg, vapidKey, audience) {
  const auth = /^vapid t=([^,]+), k=(.+)$/.exec(msg.headers.authorization);
  assert.ok(auth, 'cabecera Authorization VAPID');
  assert.equal(auth[2], vapidKey);
  verifyVapidJwt(auth[1], vapidKey, { audience });
  assert.equal(msg.headers['content-encoding'], 'aes128gcm');
  return JSON.parse(decryptPayload(msg.body, { uaPrivateKey: device.push.privateKey, auth: device.push.keys.auth }).toString());
}

/* ------------------------------ Escenario -------------------------------- */

/**
 * Corre el escenario completo contra `baseUrl`. Lanza AssertionError si algo falla.
 * @param {{ baseUrl: string, token?: string, fakePush?: Awaited<ReturnType<typeof startFakePushService>>, log?: (s: string) => void }} o
 */
export async function runSimulation({ baseUrl, token = '', fakePush = null, log = () => {} }) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const A = new SimDevice('mostrador', baseUrl, { token });
  const B = new SimDevice('tecnico', baseUrl, { token });
  const step = (s) => log(`  · ${s}`);

  const { key: vapidKey } = await (await fetch(`${baseUrl}/api/push/vapid-public-key`)).json();
  assert.equal(b64url.decode(vapidKey).length, 65);
  step(`llave pública VAPID: ${vapidKey.slice(0, 16)}… (65 bytes)`);

  if (fakePush) {
    for (const d of [A, B]) {
      const r = await fetch(`${baseUrl}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ deviceId: d.deviceId, subscription: { endpoint: `${fakePush.url}/${d.name}`, keys: d.push.keys } }),
      });
      assert.equal(r.status, 200, 'suscripción push');
    }
    step('ambos dispositivos suscritos a Web Push');
  }

  // 1) Altas en cada dispositivo.
  A.put('clients', { id: 'c1', folio: 1, nombre: 'Ana López', marca: 'Apple', modelo: 'iPhone 13', servicio: 'Cambio de pantalla', estado: 'recibido', cobroCents: 250000, pagadoCents: 100000, fecha: Date.now(), desbloqueoTipo: 'pin', desbloqueoCodigo: '1234', desbloqueoPatron: [] });
  A.put('clients', { id: 'c2', folio: 2, nombre: 'Luis Pérez', marca: 'Samsung', modelo: 'A52', estado: 'diagnostico', fecha: Date.now() });
  A.put('inventory', { id: 'i1', nombre: 'Batería Galaxy A52', stock: 5, stockMinimo: 2 });
  B.put('clients', { id: 'c3', folio: 1, nombre: 'Marta Ruiz', marca: 'Xiaomi', modelo: 'Redmi Note 12', estado: 'recibido', fecha: Date.now() });
  B.put('expenses', { id: 'e1', concepto: 'Pantalla OLED iPhone 13', totalCents: 120000, fecha: Date.now() });
  B.put('expenses', { id: 'e2', concepto: 'Flux', totalCents: 15000, fecha: Date.now() });
  await A.sync();
  await B.sync();
  await A.sync();
  assert.deepEqual(A.snapshot(), B.snapshot());
  step(`altas sincronizadas: ${JSON.stringify(A.counts())}`);

  // 2) Edición concurrente del mismo cliente: gana la más reciente (B).
  A.put('clients', { id: 'c1', nombre: 'Ana López (A)' });
  await new Promise((r) => setTimeout(r, 5));
  B.put('clients', { id: 'c1', nombre: 'Ana López (B)' });
  // Empate exacto de updatedAt: gana el deviceId mayor.
  const T = Date.now() + 10;
  A.put('clients', { id: 'c2', notas: 'nota de A' }, { updatedAt: T });
  B.put('clients', { id: 'c2', notas: 'nota de B' }, { updatedAt: T });
  await A.sync();
  await B.sync();
  await A.sync();
  assert.equal(A.tables.clients.get('c1').nombre, 'Ana López (B)');
  assert.equal(B.tables.clients.get('c1').nombre, 'Ana López (B)');
  const tieWinner = A.deviceId > B.deviceId ? 'nota de A' : 'nota de B';
  assert.equal(A.tables.clients.get('c2').notas, tieWinner);
  assert.equal(B.tables.clients.get('c2').notas, tieWinner);
  step('conflictos resueltos con LWW (más reciente; empate → deviceId mayor)');

  // 3) El técnico usa piezas (stock cruza el mínimo) → push al mostrador, no a él.
  B.append('movements', { id: 'm1', itemId: 'i1', type: 'uso', cantidad: -4, stockAntes: 5, stockDespues: 1, clienteId: 'c3', gastoId: null, nota: '', costoUnitarioCents: 30000 });
  B.put('inventory', { id: 'i1', stock: 1 });
  // Movimiento con fecha retroactiva (3 días antes): también debe viajar.
  B.append('movements', { id: 'm0', itemId: 'i1', type: 'ajuste', cantidad: 0, stockAntes: 1, stockDespues: 1, clienteId: null, gastoId: null, nota: 'conteo', costoUnitarioCents: 0, ts: Date.now() - 3 * 86400e3 });
  // El mostrador marca un equipo como listo → push al técnico.
  A.put('clients', { id: 'c1', estado: 'listo' });
  await B.sync();
  await A.sync();
  await B.sync();
  assert.ok(A.tables.movements.has('m0'), 'el movimiento retroactivo llegó');
  if (fakePush) {
    const audience = new URL(fakePush.url).origin;
    const stock = await fakePush.waitFor((m) => m.path === '/mostrador');
    assert.ok(stock, 'push de stock bajo recibido por el mostrador');
    const p1 = openPush(A, stock, vapidKey, audience);
    assert.equal(p1.title, 'Stock bajo: Batería Galaxy A52 (quedan 1)');
    const ready = await fakePush.waitFor((m) => m.path === '/tecnico');
    assert.ok(ready, 'push de equipo listo recibido por el técnico');
    const p2 = openPush(B, ready, vapidKey, audience);
    assert.equal(p2.title, 'Equipo listo para entregar: Ana López (B) · Apple iPhone 13');
    assert.equal(fakePush.received.filter((m) => m.path === '/tecnico' && openPush(B, m, vapidKey, audience).kind === 'stock_bajo').length, 0, 'quien hizo el cambio no recibe su propio aviso');
    step(`push cifrados y firmados: "${p1.title}" → mostrador · "${p2.title}" → técnico`);

    const t = await fetch(`${baseUrl}/api/push/test`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ deviceId: B.deviceId }) });
    assert.equal(t.status, 200);
    const test = await fakePush.waitFor((m) => m.path === '/tecnico' && openPush(B, m, vapidKey, audience).tag === 'push-test');
    assert.equal(openPush(B, test, vapidKey, audience).title, 'Notificaciones push activadas en Reparo');
    step('POST /api/push/test entregado');
  }

  // 4) Purga definitiva en un dispositivo → desaparece en el otro y en el servidor.
  A.purge('expenses', 'e1');
  await A.sync();
  await B.sync();
  assert.equal(B.tables.expenses.has('e1'), false);
  step('purga definitiva replicada');

  // 5) Mucho historial: paginación de 2000 filas.
  for (let i = 0; i < 2500; i++) A.append('audit', { id: `bulk-${String(i).padStart(4, '0')}`, action: 'sistema', entity: 'sistema', entityId: null, title: 'carga', summary: 'masiva', changes: [], snapshot: null });
  const up = await A.sync();
  const down = await B.sync();
  assert.ok(up.requests >= 3, 'el envío se dividió en lotes de 1000');
  assert.equal(down.sawMore, true, 'la descarga usó more:true');
  step(`paginación: ${up.requests} lotes de subida, ${down.requests} páginas de bajada`);

  // 6) Convergencia final + un tercer dispositivo nuevo que arranca desde cero.
  await A.sync();
  await B.sync();
  assert.deepEqual(A.snapshot(), B.snapshot(), 'A y B convergen');
  const C = new SimDevice('nuevo', baseUrl, { token });
  await C.sync();
  assert.deepEqual(C.snapshot(), A.snapshot(), 'un dispositivo nuevo recibe exactamente lo mismo');
  const status = await (await fetch(`${baseUrl}/api/sync/status`, { headers })).json();
  assert.deepEqual(status.rows, A.counts(), 'el servidor tiene lo mismo que los dispositivos');
  step(`convergencia: ${JSON.stringify(status.rows)} en servidor, mostrador, técnico y dispositivo nuevo`);

  // 7) Una segunda sincronización sin cambios no envía ni recibe nada.
  const idle = await A.sync();
  assert.deepEqual([idle.pushed, idle.pulled], [0, 0]);
  return { rows: status.rows, devices: status.devices.length };
}

/* --------------------------------- CLI ----------------------------------- */

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const token = crypto.randomBytes(12).toString('hex');
  console.log('\nReparo · simulación de dos dispositivos\n');
  const push = await startFakePushService();
  const srv = await startTempServer({ env: { REPARO_TOKEN: token, REPARO_PUSH_INSECURE: '1' } });
  console.log(`  servidor temporal en ${srv.url} (token, datos en ${srv.dataDir})`);
  let ok = false;
  try {
    const r = await runSimulation({ baseUrl: srv.url, token, fakePush: push, log: console.log });
    console.log(`\n  ✔ Todo convergió (${r.devices} dispositivos).`);
    ok = true;
  } catch (err) {
    console.error(`\n  ✘ Falló la simulación: ${err.message}`);
  } finally {
    const { code } = await srv.stop();
    await push.close();
    console.log(`  servidor detenido (código ${code}).\n`);
  }
  process.exit(ok ? 0 : 1);
}

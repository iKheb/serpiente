// Ensambla el servidor: estáticos + API (/api) + Web Push + resumen diario.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import {
  HttpError,
  clientIp,
  corsHeaders,
  hostAllowed,
  originAllowed,
  readJsonBody,
  securityHeaders,
  sendError,
  sendJson,
} from './http.mjs';
import { createStaticHandler } from './static.mjs';
import { SyncStore, SYNC_TABLES } from './store.mjs';
import { PushService, closePushAgents, loadOrCreateVapid, validateSubscription, normalizeSubscription } from './webpush.mjs';
import { eventsFromSync, scheduleDailySummary } from './rules.mjs';

/* -------------------------------- Logs ----------------------------------- */

const COLORS = { error: 31, warn: 33, push: 35, sync: 36, api: 90, info: 32, debug: 90 };

export function createLogger(level = 'info', { color = process.stdout.isTTY } = {}) {
  const quiet = level === 'quiet' || level === 'silent';
  const debug = level === 'debug';
  return (kind, message) => {
    if (quiet && kind !== 'error') return;
    if (kind === 'debug' && !debug) return;
    const time = new Date().toTimeString().slice(0, 8);
    const tag = kind.padEnd(5);
    const line = color ? `\x1b[2m${time}\x1b[0m \x1b[${COLORS[kind] ?? 0}m${tag}\x1b[0m ${message}` : `${time} ${tag} ${message}`;
    (kind === 'error' || kind === 'warn' ? console.error : console.log)(line);
  };
}

const shortId = (id) => String(id).slice(0, 8);

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 128;

/* ------------------------------- Servidor -------------------------------- */

/**
 * @param {ReturnType<import('./config.mjs').readConfig>} config
 * @param {{ log?: Function, pushSend?: Function, pushAllowInsecure?: boolean }} [opts]
 */
export function createReparoServer(config, opts = {}) {
  const log = opts.log ?? createLogger(config.logLevel);
  const pushAllowInsecure = opts.pushAllowInsecure ?? config.pushAllowInsecure ?? false;
  fs.mkdirSync(config.dataDir, { recursive: true });
  const store = new SyncStore(config.dbFile);
  const vapid = loadOrCreateVapid(config.vapidFile, config.vapidSubject);
  const push = new PushService({ store, vapid, log, send: opts.pushSend });
  const baseHeaders = securityHeaders(config);
  const serveStatic = createStaticHandler({ root: config.appDir, baseHeaders, cspConnect: config.cspConnect, log });
  const pending = new Set();
  let stopSummary = () => {};

  /** Lanza una tarea en segundo plano (p. ej. pushes) y la recuerda para el cierre ordenado. */
  const background = (promise) => {
    const p = Promise.resolve(promise)
      .catch((err) => log('error', err.message))
      .finally(() => pending.delete(p));
    pending.add(p);
  };

  /* --------------------------------- API --------------------------------- */

  const routes = {
    'GET /api/health': {
      public: true,
      handler: () => ({
        ok: true,
        service: 'reparo',
        version: config.version,
        time: Date.now(),
        authRequired: Boolean(config.token),
      }),
    },

    'GET /api/sync/status': {
      handler: () => ({
        ok: true,
        service: 'reparo',
        version: config.version,
        serverId: store.serverId,
        time: Date.now(),
        cursor: store.maxSeq(),
        rows: store.counts(),
        devices: store.devices().map((d) => ({ deviceId: d.deviceId, lastSeen: d.lastSeen, firstSeen: d.firstSeen })),
        pushSubscriptions: store.subscriptionCount(),
      }),
    },

    'POST /api/sync': {
      handler: async (req, ctx) => {
        const body = await readJsonBody(req, config.maxBodyBytes);
        const { response, merge, request } = store.sync(body, {
          userAgent: String(req.headers['user-agent'] || '').slice(0, 200) || null,
          ip: clientIp(req),
        });
        const pulled = SYNC_TABLES.reduce((n, t) => n + response.changes[t].length, 0);
        ctx.note = `${shortId(request.deviceId)} ↑${merge.accepted.length} ↓${pulled} cursor ${response.cursor}${response.more ? ' (+más)' : ''}${merge.rejected.length ? ` · ${merge.rejected.length} rechazadas` : ''}`;
        const events = eventsFromSync(merge.accepted);
        if (events.length) {
          ctx.after = () => {
            for (const ev of events) {
              background(push.notify(ev.payload, { excludeDeviceId: request.deviceId, urgency: ev.urgency, ttl: ev.ttl }));
            }
          };
        }
        return response;
      },
    },

    'GET /api/push/vapid-public-key': {
      public: true,
      handler: () => ({ key: vapid.publicKey }),
    },

    'POST /api/push/subscribe': {
      handler: async (req, ctx) => {
        const body = await readJsonBody(req, 64 * 1024);
        if (!isId(body?.deviceId)) throw new HttpError(400, 'Falta "deviceId".', 'SOLICITUD_INVALIDA');
        const error = pushAllowInsecure ? (normalizeSubscription(body.subscription) ? null : 'Suscripción inválida.') : validateSubscription(body.subscription);
        if (error) throw new HttpError(400, error, 'SUSCRIPCION_INVALIDA');
        const sub = normalizeSubscription(body.subscription);
        store.upsertSubscription({
          endpoint: sub.endpoint,
          deviceId: body.deviceId,
          p256dh: sub.p256dh,
          auth: sub.auth,
          userAgent: String(req.headers['user-agent'] || '').slice(0, 200) || null,
        });
        ctx.note = `${shortId(body.deviceId)} suscrito (${new URL(sub.endpoint).host})`;
        return { ok: true };
      },
    },

    'POST /api/push/unsubscribe': {
      handler: async (req, ctx) => {
        const body = await readJsonBody(req, 64 * 1024);
        if (typeof body?.endpoint !== 'string' || !body.endpoint) throw new HttpError(400, 'Falta "endpoint".', 'SOLICITUD_INVALIDA');
        const removed = store.removeSubscription(body.endpoint);
        ctx.note = removed ? 'suscripción eliminada' : 'suscripción no encontrada';
        return { ok: true, removed };
      },
    },

    'POST /api/push/test': {
      handler: async (req, ctx) => {
        const body = await readJsonBody(req, 16 * 1024);
        if (!isId(body?.deviceId)) throw new HttpError(400, 'Falta "deviceId".', 'SOLICITUD_INVALIDA');
        const subs = store.subscriptions({ deviceId: body.deviceId });
        if (!subs.length) {
          throw new HttpError(404, 'Este dispositivo no tiene una suscripción push registrada en el servidor. Activa las notificaciones primero.', 'SIN_SUSCRIPCION');
        }
        const r = await push.notify(
          {
            title: 'Notificaciones push activadas en Reparo',
            body: 'Te avisaremos de stock bajo, equipos listos para entregar y el resumen del día.',
            href: '#/ajustes',
            tag: 'push-test',
            kind: 'sistema',
          },
          { deviceId: body.deviceId, urgency: 'normal', ttl: 300 },
        );
        ctx.note = `${shortId(body.deviceId)} prueba ${r.sent}/${r.subscriptions}`;
        if (r.sent === 0) {
          ctx.status = 502;
          return { ok: false, error: r.errors[0] || 'No se pudo enviar la notificación de prueba.', code: 'PUSH_FALLIDO', ...r };
        }
        return { ok: true, ...r };
      },
    },
  };

  async function handleApi(req, res, pathname) {
    const started = process.hrtime.bigint();
    const ctx = { note: '', status: 200, after: null };
    const cors = corsHeaders(req);
    let status = 200;
    try {
      const origin = req.headers.origin;
      if (!originAllowed(origin, req, config.cors)) {
        throw new HttpError(403, `Origen no permitido: ${origin}. Agrégalo a REPARO_CORS en el servidor.`, 'ORIGEN_NO_PERMITIDO');
      }
      if (req.method === 'OPTIONS') {
        status = 204;
        res.writeHead(204, { ...baseHeaders, ...cors, 'Content-Length': '0' });
        return res.end();
      }
      if (!hostAllowed(req.headers.host, config)) {
        throw new HttpError(
          403,
          `Nombre de host no permitido: ${req.headers.host}. Agrégalo a REPARO_HOSTS o configura REPARO_TOKEN.`,
          'HOST_NO_PERMITIDO',
        );
      }
      const method = req.method === 'HEAD' ? 'GET' : req.method;
      const route = routes[`${method} ${pathname}`];
      if (!route) {
        const other = Object.keys(routes).filter((k) => k.endsWith(` ${pathname}`));
        if (other.length) {
          throw new HttpError(405, 'Método no permitido.', 'METODO_NO_PERMITIDO', { Allow: other.map((k) => k.split(' ')[0]).join(', ') });
        }
        throw new HttpError(404, `Ruta de la API no encontrada: ${pathname}`, 'NO_ENCONTRADO');
      }
      if (config.token && !route.public) {
        const m = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
        if (!m || !safeEqual(m[1].trim(), config.token)) {
          throw new HttpError(401, 'Token inválido o ausente. Configura el mismo token (REPARO_TOKEN) en la app.', 'NO_AUTORIZADO', {
            'WWW-Authenticate': 'Bearer realm="reparo"',
          });
        }
      }
      const result = await route.handler(req, ctx);
      status = ctx.status;
      await sendJson(req, res, status, result, { ...baseHeaders, ...cors });
      if (ctx.after) ctx.after();
    } catch (err) {
      status = err.status || 500;
      if (status >= 500) log('error', `${req.method} ${pathname}: ${err.stack || err.message}`);
      await sendError(req, res, Object.assign(err, { headers: { ...baseHeaders, ...cors, ...(err.headers || {}) } }));
      ctx.note = ctx.note || err.message;
    } finally {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      if (pathname === '/api/health' && status < 400) log('debug', `${req.method} ${pathname} ${status} · ${ms.toFixed(0)} ms`);
      else log(pathname === '/api/sync' && status < 400 ? 'sync' : status >= 400 ? 'warn' : 'api', `${req.method} ${pathname} ${status} · ${ms.toFixed(0)} ms${ctx.note ? ` · ${ctx.note}` : ''}`);
    }
  }

  async function handler(req, res) {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://x').pathname;
    } catch {
      res.writeHead(400, { ...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Solicitud inválida');
    }
    try {
      if (pathname === '/api' || pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
      await serveStatic(req, res, pathname);
    } catch (err) {
      log('error', `${req.method} ${pathname}: ${err.stack || err.message}`);
      if (!res.headersSent) {
        res.writeHead(500, { ...baseHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Error interno del servidor');
      } else res.destroy();
    }
  }

  const server = config.tls ? https.createServer({ cert: config.tls.cert, key: config.tls.key }, handler) : http.createServer(handler);
  server.requestTimeout = 120_000;
  server.headersTimeout = 20_000;
  server.keepAliveTimeout = 5_000;

  let closing = null;

  return {
    server,
    store,
    push,
    vapid,
    config,
    log,
    /** Empieza a escuchar. Resuelve con el puerto real (útil con PORT=0). */
    listen() {
      return new Promise((resolve, reject) => {
        const onError = (err) => {
          server.off('listening', onListening);
          reject(err);
        };
        const onListening = () => {
          server.off('error', onError);
          stopSummary = scheduleDailySummary({
            store,
            push,
            hour: config.dailyHour,
            locale: config.locale,
            currency: config.currency,
            log,
          });
          resolve(server.address());
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(config.port, config.host);
      });
    },
    /** Cierre ordenado: deja de aceptar conexiones, espera lo pendiente (máx. `graceMs`) y cierra SQLite. */
    close({ graceMs = 5000 } = {}) {
      if (closing) return closing;
      closing = (async () => {
        stopSummary();
        const closed = new Promise((resolve) => server.close(() => resolve()));
        server.closeIdleConnections?.();
        const timer = setTimeout(() => server.closeAllConnections?.(), graceMs);
        timer.unref();
        await Promise.race([Promise.allSettled([...pending]), new Promise((r) => setTimeout(r, graceMs).unref())]);
        await closed;
        clearTimeout(timer);
        closePushAgents();
        store.close();
      })();
      return closing;
    },
  };
}

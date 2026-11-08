#!/usr/bin/env node
// Reparo · servidor opcional (cero dependencias, Node ≥ 22).
// - Sirve la app compilada (también en la red local del taller, sin internet).
// - Sincroniza varios dispositivos (POST /api/sync) sobre SQLite.
// - Envía notificaciones Web Push (VAPID + aes128gcm).
// Uso: npm run build && npm run server
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigError, readConfig } from './lib/config.mjs';
import { createLogger, createReparoServer } from './lib/app.mjs';
import { isLoopbackHost } from './lib/http.mjs';

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c(1, s);
const dim = (s) => c(2, s);
const cyan = (s) => c(36, s);
const yellow = (s) => c(33, s);
const red = (s) => c(31, s);

function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.internal) continue;
      if (a.family === 'IPv4' || a.family === 4) out.push({ name, address: a.address });
    }
  }
  return out;
}

function printBanner(app, address) {
  const { config, store } = app;
  const scheme = config.tls ? 'https' : 'http';
  const port = address.port;
  const hostCfg = config.host;
  const wildcard = hostCfg === '0.0.0.0' || hostCfg === '::' || hostCfg === '';
  const listensOnLan = wildcard || !isLoopbackHost(hostCfg);
  const appBuilt = fs.existsSync(path.join(config.appDir, 'index.html'));
  const counts = store.counts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const lines = [];
  lines.push('');
  lines.push(`  ${bold('Reparo')} ${dim('· servidor')} ${dim('v' + config.version)}`);
  lines.push('');
  lines.push(`  ${dim('Local:')}       ${cyan(`${scheme}://localhost:${port}`)}`);
  if (listensOnLan) {
    const lan = wildcard ? lanAddresses() : [{ name: '', address: hostCfg }];
    if (lan.length) {
      for (const [i, a] of lan.entries()) {
        lines.push(`  ${dim(i === 0 ? 'Red local:' : '          ')}   ${cyan(`${scheme}://${a.address}:${port}`)}${a.name ? dim(`  (${a.name})`) : ''}`);
      }
      lines.push(dim('               Ábrela desde el celular conectado a la misma WiFi del taller.'));
    } else {
      lines.push(`  ${dim('Red local:')}   ${dim('sin interfaces de red detectadas')}`);
    }
  }
  lines.push('');
  lines.push(`  ${dim('App:')}         ${appBuilt ? config.appDir : yellow(`no compilada (${config.appDir}) → ejecuta: npm run build`)}`);
  lines.push(`  ${dim('Datos:')}       ${config.dbFile} ${dim(`(${total} registros sincronizados)`)}`);
  lines.push(`  ${dim('Web Push:')}    ${app.vapid.created ? 'llaves VAPID generadas en ' : 'llaves VAPID en '}${config.vapidFile}`);
  lines.push(`  ${dim('Resumen:')}     ${config.dailyHour == null ? 'resumen diario desactivado (REPARO_DAILY_HOUR)' : `todos los días a las ${String(config.dailyHour).padStart(2, '0')}:00 (${config.currency})`}`);
  lines.push(`  ${dim('Acceso API:')}  ${config.token ? 'protegido con token (REPARO_TOKEN)' : 'sin token'}`);
  lines.push('');

  if (!config.tls) {
    lines.push(
      yellow('  Aviso: el service worker (modo sin conexión instalable) y las notificaciones push sólo'),
    );
    lines.push(yellow('  funcionan en HTTPS o en localhost. Desde otro dispositivo de la red usa HTTPS'));
    lines.push(yellow('  (REPARO_TLS_CERT/REPARO_TLS_KEY, p. ej. con mkcert) o un túnel. Ver server/README.md.'));
    lines.push('');
  }
  if (!config.token && listensOnLan) {
    lines.push(red('  Aviso de seguridad: REPARO_TOKEN no está configurado y el servidor escucha en la red local.'));
    lines.push(red('  Cualquiera conectado a tu WiFi podría leer o modificar los datos sincronizados, incluidos'));
    lines.push(red('  los PIN, contraseñas y patrones de desbloqueo de los equipos de tus clientes.'));
    lines.push(red('  Define un token largo y aleatorio, p. ej.:  REPARO_TOKEN="$(openssl rand -hex 24)" npm run server'));
    lines.push(red('  y en la app usa la URL  http://IP:PUERTO/?token=ESE_TOKEN  (Ajustes → Sincronización).'));
    lines.push('');
  }
  lines.push(dim('  Ctrl+C para detener.'));
  lines.push('');
  console.log(lines.join('\n'));
}

async function main() {
  let config;
  try {
    config = readConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(red(`\n  Error de configuración: ${err.message}\n`));
      process.exit(2);
    }
    throw err;
  }

  const log = createLogger(config.logLevel, { color });
  let app;
  try {
    app = createReparoServer(config, { log });
  } catch (err) {
    console.error(red(`\n  No se pudo iniciar el servidor: ${err.message}\n`));
    process.exit(1);
  }

  let address;
  try {
    address = await app.listen();
  } catch (err) {
    const msg =
      err.code === 'EADDRINUSE'
        ? `El puerto ${config.port} ya está en uso. Cierra el otro proceso o usa otro puerto: PORT=8788 npm run server`
        : err.code === 'EACCES'
          ? `Sin permiso para usar el puerto ${config.port}. Usa uno mayor a 1024 (p. ej. PORT=8787).`
          : err.message;
    console.error(red(`\n  No se pudo iniciar el servidor: ${msg}\n`));
    app.store.close();
    process.exit(1);
  }
  printBanner(app, address);
  // Línea estable y fácil de detectar por scripts/pruebas.
  log('info', `escuchando en el puerto ${address.port}`);

  let stopping = false;
  const shutdown = async (signal) => {
    if (stopping) {
      console.error(red('\n  Cierre forzado.'));
      process.exit(1);
    }
    stopping = true;
    log('info', `${signal} recibido: cerrando conexiones y guardando datos…`);
    try {
      await app.close({ graceMs: 5000 });
      log('info', 'Servidor detenido. Datos guardados.');
      process.exit(0);
    } catch (err) {
      log('error', `error al cerrar: ${err.message}`);
      process.exit(1);
    }
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => log('error', `promesa rechazada sin manejar: ${err?.stack || err}`));
}

main();

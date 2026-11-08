// Adaptador mínimo para que las pruebas del servidor corran con `node --test server/`
// y también si Vitest (`npm test`) las recoge por su patrón por defecto.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const runner = process.env.VITEST ? await import('vitest') : await import('node:test');

export const describe = runner.describe;
export const it = runner.it ?? runner.test;
export const before = runner.before ?? runner.beforeAll;
export const after = runner.after ?? runner.afterAll;

/** Carpeta temporal que se borra al terminar el proceso. */
export function tempDir(prefix = 'reparo-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.once('exit', () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* nada que limpiar */
    }
  });
  return dir;
}

/** Configuración base para pruebas (sin leer el entorno real). */
export async function testConfig(overrides = {}) {
  const { readConfig } = await import('./config.mjs');
  const dataDir = overrides.dataDir ?? tempDir();
  const appDir = overrides.appDir ?? tempDir('reparo-app-');
  const base = readConfig({ REPARO_DATA_DIR: dataDir, REPARO_APP_DIR: appDir, REPARO_LOG: 'quiet' });
  return { ...base, host: '127.0.0.1', port: 0, ...overrides };
}

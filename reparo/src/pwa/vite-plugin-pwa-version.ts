/**
 * Plugin de Vite (sólo build): al terminar, calcula un hash corto del
 * index.html generado y lo inyecta en sw.js reemplazando el marcador
 * `__REPARO_SW_VERSION__`. Así cada build distinto produce un sw.js distinto
 * (el navegador detecta la actualización) y cachés con nombre único.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

const PLACEHOLDER = '__REPARO_SW_VERSION__';

export interface PwaVersionOptions {
  /** Nombre del service worker dentro de outDir (por defecto "sw.js"). */
  swFile?: string;
  /** Longitud del hash (por defecto 10). */
  length?: number;
}

export function reparoPwaVersion(options: PwaVersionOptions = {}): Plugin {
  const swFile = options.swFile ?? 'sw.js';
  const length = options.length ?? 10;
  let config: ResolvedConfig;

  return {
    name: 'reparo:pwa-version',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        const outDir = resolve(config.root, config.build.outDir);
        const htmlPath = resolve(outDir, 'index.html');
        const swPath = resolve(outDir, swFile);
        if (!existsSync(htmlPath) || !existsSync(swPath)) {
          config.logger.warn(`[reparo-pwa] No se encontró index.html o ${swFile} en ${outDir}; versión sin inyectar.`);
          return;
        }
        const version = createHash('sha256').update(readFileSync(htmlPath)).digest('hex').slice(0, length);
        const sw = readFileSync(swPath, 'utf8');
        if (!sw.includes(PLACEHOLDER)) {
          config.logger.warn(`[reparo-pwa] ${swFile} no contiene ${PLACEHOLDER}; no se modificó.`);
          return;
        }
        writeFileSync(swPath, sw.split(PLACEHOLDER).join(version));
        config.logger.info(`[reparo-pwa] ${swFile} → versión ${version}`);
      },
    },
  };
}

export default reparoPwaVersion;

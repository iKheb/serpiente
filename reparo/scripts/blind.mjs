#!/usr/bin/env node
/**
 * Comparación a ciegas: compone dos capturas lado a lado con etiquetas "A" y "B"
 * en orden ALEATORIO. La clave (qué lado es cuál) se guarda aparte para el
 * orquestador; el juez sólo debe ver el PNG compuesto.
 * Uso: node scripts/blind.mjs <imagenX.png> <imagenY.png> <salida.png>
 *   → escribe <salida.png> y <salida.png>.key.json ({ A: ruta, B: ruta })
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const [x, y, out] = process.argv.slice(2);
if (!x || !y || !out) { console.error('Uso: blind.mjs a.png b.png salida.png'); process.exit(1); }
const swap = Math.random() < 0.5;
const A = swap ? y : x, B = swap ? x : y;
const uri = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
const html = `<!doctype html><html><body style="margin:0;background:#888;font:600 28px system-ui">
<div style="display:flex;gap:24px;padding:24px;align-items:flex-start">
${[['A', A], ['B', B]].map(([l, p]) => `<div style="flex:1;min-width:0"><div style="color:#fff;margin-bottom:10px">${l}</div><img src="${uri(p)}" style="width:100%;display:block;border-radius:8px"></div>`).join('')}
</div></body></html>`;
const b = await pw.chromium.launch();
const page = await b.newPage({ viewport: { width: 2400, height: 900 } });
await page.setContent(html, { waitUntil: 'load' });
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
await page.screenshot({ path: out, fullPage: true });
await b.close();
fs.writeFileSync(out + '.key.json', JSON.stringify({ A: path.resolve(A), B: path.resolve(B) }, null, 2));
console.log(out);

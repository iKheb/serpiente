import { createServer } from 'vite';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port: 5899, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('console', (m) => { if (!/vite|DevTools|GL Driver/.test(m.text())) console.log('console:', m.text()); });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://127.0.0.1:5899/#/panel');
await page.waitForFunction(() => !!window.__reparo, null, { timeout: 60000 });
await page.evaluate(async () => { await window.__reparo.seedDemoData(); await window.__reparo.updateSettings({ onboarded: true }); });
await page.goto('http://127.0.0.1:5899/#/gastos');
const r = await page.evaluate(async () => {
  const mod = await import('/src/three/thumbnails.ts');
  try { await mod.renderPartThumbnail('baterias', { size: 48, theme: 'dark' }); return 'ok'; } catch (e) { return 'ERR ' + (e && e.stack || e); }
});
console.log(r);
await page.waitForTimeout(8000);
console.log(await page.evaluate(() => [...document.querySelectorAll('[data-kind]')].map((e) => e.className + ':' + (e.querySelector('img') ? 'img' : 'noimg')).slice(0, 5).join('\n')));
await browser.close(); await server.close(); process.exit(0);

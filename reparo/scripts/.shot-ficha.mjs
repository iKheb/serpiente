import { createServer } from 'vite';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(root, process.argv[2]); fs.mkdirSync(out, { recursive: true });
const vps = (process.argv[3] || 'desktop,tablet,mobile').split(',');
const themes = (process.argv[4] || 'dark,light').split(',');
const extra = process.argv[5] || ''; // e.g. route suffix list
const VP = { desktop: { width: 1440, height: 900 }, tablet: { width: 834, height: 1112 }, mobile: { width: 390, height: 844 } };
const port = 5793 + Math.floor(Math.random() * 100);
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const v of vps) for (const t of themes) {
  const ctx = await browser.newContext({ viewport: VP[v], isMobile: v === 'mobile', hasTouch: v !== 'desktop', colorScheme: t, locale: 'es-MX', timezoneId: 'America/Mexico_City' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`http://127.0.0.1:${port}/#/panel`);
  await page.waitForFunction(() => !!window.__reparo, null, { timeout: 60000 });
  const ids = await page.evaluate(async (t) => { const r = window.__reparo; await r.seedDemoData(); await r.updateSettings({ theme: t, onboarded: true });
    const all = await r.db.inventory.toArray(); const a = all.find((i) => i.sku === 'PAN-IP13-OLED'); const b = all.find((i) => i.stock === 0 && !i.pedidoAt); return [a?.id, b?.id]; }, t);
  const ex = await page.evaluate(async () => (await window.__reparo.db.expenses.toArray())[0]?.id);
  const routes = [['ficha', `inventario/${ids[0]}`], ['ficha-agotado', `inventario/${ids[1]}`], ...(extra ? [['gasto', `gastos/${ex}`]] : [])];
  for (const [name, r] of routes) {
    await page.goto(`http://127.0.0.1:${port}/#/${r}`); await page.waitForTimeout(5000);
    const f = path.join(out, `${name}__${v}__${t}.png`); await page.screenshot({ path: f, timeout: 90000 }).catch((e) => console.log('fail', f, e.message)); console.log(f);
  }
  await ctx.close();
}
await browser.close(); await server.close(); process.exit(0);

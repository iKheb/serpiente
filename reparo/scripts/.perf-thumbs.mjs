import { createServer } from 'vite';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port: 5791, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => console.log('console:', m.text()));
await page.addInitScript(() => {
  window.__long = [];
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true });
});
await page.goto('http://127.0.0.1:5791/#/panel');
await page.waitForFunction(() => !!window.__reparo, null, { timeout: 30000 });
await page.evaluate(async () => { await window.__reparo.seedDemoData(); await window.__reparo.updateSettings({ onboarded: true }); });
const mode = process.argv[2] || 'page';
if (mode === 'direct') {
  await page.goto('http://127.0.0.1:5791/#/ajustes'); await page.waitForTimeout(4000);
  const r = await page.evaluate(async () => {
    window.__long.length = 0; const t = [];
    const mod = await import('/src/three/thumbnails.ts');
    const kinds = ['pantallas','baterias','puertos','camaras','placas','carcasas','herramientas','accesorios','otros'];
    let t0 = performance.now();
    for (const k of kinds) { const a = performance.now(); await mod.renderPartThumbnail(k, { size: 48, theme: 'dark' }); t.push(k + ':' + Math.round(performance.now() - a)); }
    t.push('total48:' + Math.round(performance.now() - t0));
    t0 = performance.now();
    for (const k of kinds) await mod.renderPartThumbnail(k, { size: 96, theme: 'dark' });
    t.push('total96:' + Math.round(performance.now() - t0));
    t0 = performance.now();
    for (const k of kinds) await mod.renderPartThumbnail(k, { size: 48, theme: 'light' });
    t.push('total48light:' + Math.round(performance.now() - t0));
    return t;
  });
  console.log(r.join(' '));
} else {
  window: {
    const t0 = Date.now();
    await page.goto('http://127.0.0.1:5791/#/' + mode);
    await page.waitForTimeout(15000);
    console.log('route', mode, 'elapsed', Date.now() - t0);
  }
}
console.log('longtasks', JSON.stringify(await page.evaluate(() => window.__long)));
await browser.close(); await server.close(); process.exit(0);

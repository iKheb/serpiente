import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('err', m.text()); });
await page.addInitScript(() => { window.__long = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }); });
await page.goto('file://' + process.argv[2] + '#/panel');
await page.waitForFunction(() => !!window.__reparo, null, { timeout: 60000 });
await page.evaluate(async () => { await window.__reparo.seedDemoData(); await window.__reparo.updateSettings({ onboarded: true }); });
await page.goto('file://' + process.argv[2] + '#/inventario'); await page.evaluate(() => (window.__long.length = 0));
for (let t = 0; t < 12; t++) {
  await page.waitForTimeout(5000);
  const r = await page.evaluate(() => { const imgs = [...document.querySelectorAll('[data-kind] img')]; return imgs.length + ' imgs, ' + imgs.filter((i) => i.src.startsWith('blob:') || i.src.startsWith('data:')).length + ' ok; fallback ' + document.querySelectorAll('[data-kind] svg').length + '; long ' + JSON.stringify(window.__long); });
  console.log((t + 1) * 5 + 's', r);
}
const n = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('reparo.partThumb')).length);
console.log('persisted', n);
await page.reload(); await page.waitForTimeout(3000);
console.log('after reload', await page.evaluate(() => [...document.querySelectorAll('[data-kind] img')].filter((i) => i.src.startsWith('data:')).length));
await browser.close();

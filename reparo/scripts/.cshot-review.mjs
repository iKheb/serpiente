// Temporal (revisor clientes). Uso: node scripts/.cshot-review.mjs <outDir> [themes] [viewports] [only]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const root = '/home/user/serpiente/reparo';
const out = path.resolve(root, process.argv[2]);
const themes = (process.argv[3] || 'dark,light').split(',');
const vps = (process.argv[4] || 'desktop,mobile').split(',');
const only = (process.argv[5] || 'list,form,pattern,edit,detail,receipt,png').split(',');
const VP = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 }, small: { width: 360, height: 740 }, tablet: { width: 834, height: 1112 } };
const port = await new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port, strictPort: true, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
await server.listen();
const base = `http://127.0.0.1:${port}/`;
fs.mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const W = (ms) => new Promise((r) => setTimeout(r, ms));
for (const vn of vps) for (const theme of themes) {
  const mob = vn !== 'desktop';
  const ctx = await browser.newContext({ viewport: VP[vn], isMobile: mob, hasTouch: mob, colorScheme: theme, reducedMotion: process.env.RM ? 'reduce' : 'no-preference', locale: 'es-MX', timezoneId: 'America/Mexico_City' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror', (e) => errors.push(`[${vn}/${theme}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${vn}/${theme}] console: ${m.text()}`); });
  await page.goto(base + '#/panel');
  await page.waitForFunction(() => !!window.__reparo, null, { timeout: 60000 });
  const id = await page.evaluate(async (theme) => {
    const r = window.__reparo; await r.seedDemoData(); await r.updateSettings({ theme, onboarded: true });
    const cs = (await r.db.clients.toArray()).filter((c) => !c.deletedAt);
    const mv = await r.db.movements.toArray();
    const used = new Set(mv.filter((m) => m.type === 'uso').map((m) => m.clienteId));
    const c = cs.find((c) => used.has(c.id) && c.cobroCents > c.pagadoCents && c.pagadoCents > 0) || cs.find((c) => used.has(c.id)) || cs[0];
    return c.id;
  }, theme);
  console.log('id', id);
  const shot = async (name, full = false) => {
    const f = path.join(out, `${name}__${vn}__${theme}.png`);
    for (let k = 0; k < 3; k++) { try { await page.screenshot({ path: f, fullPage: full, timeout: 45000 }); console.log(f); return; } catch (e) { if (k === 2) errors.push('shot ' + name + ' ' + e.message.split('\n')[0]); await page.mouse.move(5, 5); await W(1000); } }
  };
  if (only.includes('list')) { await page.goto(base + '#/clientes'); await W(2500); await shot('list'); }
  console.log('form…');
  if (only.includes('form')) { await page.goto(base + '#/clientes?nuevo=1'); await W(2500); await shot('form'); }
  if (only.includes('pattern')) {
    try {
      if (!only.includes('form')) { await page.goto(base + '#/clientes?nuevo=1'); await W(2500); }
      await page.getByText('Patrón', { exact: true }).first().click({ timeout: 8000 }); await W(600);
      const box = page.locator('[data-field="desbloqueoPatron"] svg').first();
      await page.evaluate(() => document.querySelector('[data-field="desbloqueoPatron"]')?.scrollIntoView({ block: 'center' })); await W(400);
      const b = await box.boundingBox();
      if (b) {
        const pt = (i) => [b.x + (b.width * ((i % 3) + 0.5)) / 3, b.y + (b.height * (Math.floor(i / 3) + 0.5)) / 3];
        const seq = [0, 1, 2, 4, 6, 7, 8];
        await page.mouse.move(...pt(seq[0])); await page.mouse.down();
        for (const i of seq.slice(1)) await page.mouse.move(...pt(i), { steps: 8 });
        await page.mouse.up(); await W(600);
      }
      await shot('pattern');
    } catch (e) { errors.push('pattern ' + e.message.split('\n')[0]); }
  }
  if (only.includes('edit')) {
    await page.goto(base + `#/clientes/${id}?editar=1`); await W(2500);
    await page.evaluate(() => { const h = [...document.querySelectorAll('h2,h3,legend,span')].find((e) => e.textContent?.trim() === 'Evidencia fotográfica'); h?.scrollIntoView({ block: 'start' }); }); await W(500);
    await shot('edit');
  }
  if (only.includes('detail')) { await page.goto(base + `#/clientes/${id}`); await W(2800); await shot('detail'); await shot('detailfull', true); }
  if (only.includes('receipt')) {
    await page.goto(base + `#/clientes/${id}`); await W(2500);
    try {
      await page.getByRole('button', { name: /Enviar recibo por WhatsApp/ }).first().click({ timeout: 8000 }); await W(1800); await shot('receipt');
      await page.evaluate(() => document.querySelector('[aria-label^="Vista previa del recibo"]')?.scrollIntoView({ block: 'end' })); await W(500); await shot('receipt2');
    } catch (e) { errors.push('receipt ' + e.message.split('\n')[0]); }
  }
  if (only.includes('png') && vn === 'desktop') {
    try {
      const data = await page.evaluate(async (id) => {
        const { renderReceiptPNG } = await import('/src/pages/clientes/receipt/receiptImage.ts');
        const { withSettingsDefaults } = await import('/src/data/defaults.ts');
        const { db } = window.__reparo;
        const c = await db.clients.get(id);
        const s = withSettingsDefaults(await db.settings.get('settings'));
        const mv = (await db.movements.toArray()).filter((m) => m.clienteId === id && m.type === 'uso');
        const inv = await db.inventory.toArray();
        const piezas = mv.map((m) => ({ nombre: inv.find((i) => i.id === m.itemId)?.nombre || 'Repuesto', cantidad: Math.abs(m.cantidad) }));
        const blob = await renderReceiptPNG(c, s, { piezas });
        const buf = new Uint8Array(await blob.arrayBuffer()); let bin = ''; for (const x of buf) bin += String.fromCharCode(x); return btoa(bin);
      }, id);
      const f = path.join(out, `receiptpng__${theme}.png`); fs.writeFileSync(f, Buffer.from(data, 'base64')); console.log(f);
    } catch (e) { errors.push('png ' + e.message.split('\n')[0]); }
  }
  await ctx.close();
}
await browser.close(); await server.close();
if (errors.length) { console.log('--- ERRORES ---'); [...new Set(errors)].slice(0, 30).forEach((e) => console.log(e)); }
process.exit(0);

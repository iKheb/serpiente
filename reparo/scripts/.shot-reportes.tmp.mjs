#!/usr/bin/env node
/**
 * Capturas de pantalla reproducibles de Reparo.
 * Uso:
 *   node scripts/shot.mjs --routes panel,clientes,"clientes?nuevo=1" --out shots/x \
 *        [--seed] [--themes dark,light] [--viewports desktop,mobile,tablet] [--full] \
 *        [--onboarding] [--wait 1500] [--scale 1]
 * Levanta su propio servidor Vite (puerto libre) y lo cierra al terminar.
 * Ruta "ui" = galería del sistema de diseño.
 */
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pw;
const root = '/home/user/serpiente/reparo';
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  if (i === -1) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const routes = String(opt('routes', 'panel')).split(',').filter(Boolean);
const out = path.resolve(root, String(opt('out', 'shots/latest')));
const themes = String(opt('themes', 'dark')).split(',');
const viewportsSel = String(opt('viewports', 'desktop,mobile')).split(',');
const seed = !!opt('seed', false);
const onboarding = !!opt('onboarding', false);
const full = !!opt('full', false);
const wait = Number(opt('wait', 1600));
const scale = Number(opt('scale', 1));

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1280, height: 800 },
  tablet: { width: 834, height: 1112 },
  mobile: { width: 390, height: 844 },
  small: { width: 360, height: 740 },
};

const freePort = () =>
  new Promise((res) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });

const port = await freePort();
const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  server: { port, strictPort: true, host: '127.0.0.1', hmr: false },
  logLevel: 'error',
  clearScreen: false,
});
await server.listen();
const base = `http://127.0.0.1:${port}/`;
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  for (const vpName of viewportsSel) {
    const vp = VIEWPORTS[vpName];
    if (!vp) continue;
    for (const theme of themes) {
      const ctx = await browser.newContext({
        viewport: vp,
        deviceScaleFactor: scale,
        isMobile: vpName === 'mobile' || vpName === 'small',
        hasTouch: vpName === 'mobile' || vpName === 'small' || vpName === 'tablet',
        colorScheme: theme === 'light' ? 'light' : 'dark',
        locale: 'es-MX',
        timezoneId: 'America/Mexico_City',
      });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`[${vpName}/${theme}] pageerror: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(`[${vpName}/${theme}] console: ${m.text()}`);
      });
      await page.goto(base + '#/ajustes', { waitUntil: 'load' });
      const hasApi = await page
        .waitForFunction(() => !!window.__reparo, null, { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (hasApi) {
        await page.evaluate(
          async ({ seed, theme, onboarding }) => {
            const r = window.__reparo;
            if (seed && r.seedDemoData) await r.seedDemoData();
            if (r.updateSettings) await r.updateSettings({ theme, onboarded: !onboarding });
          },
          { seed, theme, onboarding },
        );
      } else {
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      }
      for (const r of routes) {
        await page.goto(base + '#/' + r, { waitUntil: 'load' }); await page.reload({ waitUntil: 'load' });
        if (!hasApi) await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        await page.waitForTimeout(wait);
        const file = path.join(out, `${r.replace(/[^a-z0-9]+/gi, '_')}__${vpName}__${theme}.png`);
        await page.screenshot({ path: file, fullPage: full });
        console.log(file);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) {
  console.log('\n--- ERRORES DE CONSOLA ---');
  [...new Set(errors)].slice(0, 40).forEach((e) => console.log(e));
}
process.exit(0);

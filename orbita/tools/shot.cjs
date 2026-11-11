// Capturas con Playwright.
// node tools/shot.cjs --url "http://localhost:8080/?dev#/inicio" --preset desktop --out /ruta/img.png
//   [--wait 2500] [--keys "ArrowDown,ArrowDown,Enter"] [--keydelay 350] [--click "selector"] [--full]
//   [--scale 1] [--eval "js a ejecutar antes de capturar"]
// Presets: desktop 1440x900 · tv 1920x1080 (?modo=tv recomendado) · tablet 1024x1366 · tabletl 1366x1024 · mobile 390x844
// Imprime errores de consola y de página (útil para depurar).
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const presets = { desktop: [1440, 900, false], tv: [1920, 1080, false], tablet: [1024, 1366, true], tabletl: [1366, 1024, true], mobile: [390, 844, true] };
(async () => {
  const [w, h, touch] = presets[opt('preset', 'desktop')] || presets.desktop;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: Number(opt('scale', 1)), hasTouch: touch, isMobile: touch && w < 800 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto(opt('url', 'http://localhost:8080/?dev#/inicio'), { waitUntil: 'load' });
  await page.waitForTimeout(Number(opt('wait', 2500)));
  const keys = opt('keys', '');
  if (keys) for (const k of String(keys).split(',')) { await page.keyboard.press(k.trim()); await page.waitForTimeout(Number(opt('keydelay', 350))); }
  const click = opt('click', '');
  if (click) { await page.click(String(click)); await page.waitForTimeout(800); }
  const ev = opt('eval', '');
  if (ev) { console.log('eval:', await page.evaluate(String(ev))); await page.waitForTimeout(500); }
  if (keys || click) await page.waitForTimeout(Number(opt('after', 900)));
  await page.screenshot({ path: opt('out', 'shot.png'), fullPage: !!opt('full', false) });
  console.log('OK', opt('out', 'shot.png'));
  if (errors.length) console.log('ERRORES:\n' + errors.slice(0, 30).join('\n'));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

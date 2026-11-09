import { createServer } from 'vite';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { port: 5792, host: '127.0.0.1', hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5792/#/ajustes');
await page.waitForTimeout(3000);
const r = await page.evaluate(async () => {
  const T = []; let a = performance.now(); const lap = (n) => { const b = performance.now(); T.push(n + ':' + Math.round(b - a)); a = b; };
  const three = await import('/node_modules/.vite/deps/three.js');
  const studio = await import('/src/three/lib/studio.ts');
  const parts = await import('/src/three/lib/parts.ts');
  lap('import');
  const canvas = document.createElement('canvas');
  const renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(192, 192, false);
  lap('renderer');
  const env = studio.createStudioEnvironment(renderer); lap('pmrem');
  const scene = new three.Scene(); scene.environment = env.texture; const lights = studio.addStudioLights(scene); lights.setTheme('dark');
  const cam = new three.OrthographicCamera(-5, 5, 5, -5, 0.1, 200); cam.position.set(0, 25, 55); cam.lookAt(0, 0, 0);
  for (const k of ['pantallas','baterias','puertos','camaras','placas','carcasas','herramientas','accesorios','otros']) {
    const m = parts.buildPart(k); lap(k + '.build');
    scene.add(m); renderer.compile(scene, cam); lap(k + '.compile');
    renderer.render(scene, cam); renderer.getContext().finish(); lap(k + '.render');
    canvas.toDataURL('image/png'); lap(k + '.png');
    scene.remove(m);
  }
  return T.join(' ');
});
console.log(r);
await browser.close(); await server.close(); process.exit(0);

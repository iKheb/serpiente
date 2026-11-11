// Build de producción: empaqueta Órbita en dist/ (un único index.html autocontenido + PWA).
//   node tools/build.mjs            (requiere esbuild: npm i -D esbuild, o ESBUILD=/ruta/al/modulo)
// Resultado:
//   dist/index.html   HTML único con CSS, JS y fuentes embebidos (ideal para TV y hosting estático)
//   dist/manifest.webmanifest, dist/sw.js, dist/icons/*  (instalación como app)
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

const esbuildPath = process.env.ESBUILD || 'esbuild';
const esbuild = await import(esbuildPath.startsWith('/') ? pathToFileURL(esbuildPath).href : esbuildPath);

// 1) JS: un solo bundle (los import() dinámicos se integran).
const result = await esbuild.build({
  entryPoints: [join(root, 'js/main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  target: ['es2020', 'chrome80', 'safari14'],
  write: false,
  legalComments: 'none',
  alias: {
    three: join(root, 'vendor/three/three.module.js'),
    'cannon-es': join(root, 'vendor/cannon/cannon-es.js'),
  },
  plugins: [{
    name: 'three-addons',
    setup(b) {
      b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: join(root, 'vendor/three/addons', a.path.replace('three/addons/', '')) }));
    },
  }],
});
const js = 'globalThis.__ORBITA_BUILD__=true;' + result.outputFiles[0].text;

// 2) CSS: concatenar en el orden del index.html e incrustar fuentes.
const html = readFileSync(join(root, 'index.html'), 'utf8');
const cssFiles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
let css = cssFiles.map((f) => readFileSync(join(root, f), 'utf8')).join('\n');
css = css.replace(/url\("\.\.\/fonts\/([^"]+)"\)/g, (_, f) => `url(data:font/woff2;base64,${readFileSync(join(root, 'fonts', f)).toString('base64')})`);
const cssMin = (await esbuild.transform(css, { loader: 'css', minify: true })).code;

// 3) HTML final
const escScript = (s) => s.replace(/<\/script/gi, '<\\/script');
let out = html
  .replace(/<link rel="preload"[^>]*>\n?/g, '')
  .replace(/<link rel="stylesheet"[^>]*>\n?/g, '')
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '')
  .replace('</head>', `<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icons/icon-192.png">\n<link rel="apple-touch-icon" href="icons/icon-192.png">\n<style>${cssMin}</style>\n</head>`)
  .replace(/<script type="module" src="js\/main.js"><\/script>/, () => `<script type="module">${escScript(js)}</script>`);
writeFileSync(join(dist, 'index.html'), out);

for (const f of ['manifest.webmanifest', 'sw.js']) if (existsSync(join(root, f))) cpSync(join(root, f), join(dist, f));
if (existsSync(join(root, 'icons'))) cpSync(join(root, 'icons'), join(dist, 'icons'), { recursive: true });

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log(`dist/index.html ${kb(Buffer.byteLength(out))} (JS ${kb(js.length)}, CSS ${kb(cssMin.length)})`);

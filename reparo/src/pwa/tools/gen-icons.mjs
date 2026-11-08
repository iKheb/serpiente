#!/usr/bin/env node
/**
 * Genera los íconos PWA de Reparo en /public/icons a partir del isotipo oficial
 * (`brandMarkSVG()` y `MARK` de src/app/brand.ts), rasterizándolos con Chromium.
 *
 *   node src/pwa/tools/gen-icons.mjs
 *
 * Salida (public/icons/):
 *   icon.svg                SVG oficial (favicon vectorial)
 *   favicon-32.png          favicon raster
 *   icon-192.png / -512     propósito "any" (tile redondeado, esquinas transparentes)
 *   maskable-192 / -512     propósito "maskable": degradado a sangre completa y glifo
 *                           dentro de la zona segura (círculo del 80 %)
 *   apple-touch-icon.png    180 px, opaco (iOS aplica su propia máscara)
 *   badge-96.png            glifo blanco monocromo sobre transparente (barra de Android)
 *   shortcut-*.png          íconos de los accesos directos del manifest (96 px)
 *
 * Es idempotente: se puede volver a ejecutar cuando cambie la marca.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const outDir = path.join(root, 'public/icons');

let pw;
try {
  pw = require('playwright');
} catch {
  pw = require('/opt/node-tools/node_modules/playwright');
}
const { chromium } = pw;

/* ---------- 1. Cargar la marca transpilando src/app/brand.ts ---------- */
const ts = require(path.join(root, 'node_modules/typescript'));
const brandSrc = fs.readFileSync(path.join(root, 'src/app/brand.ts'), 'utf8');
const { outputText } = ts.transpileModule(brandSrc, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const brand = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(outputText));
const { brandMarkSVG, MARK, BRAND_GRADIENT } = brand;

/* ---------- 2. Composición de variantes a partir de MARK ---------- */
const [ga, gb, gc] = BRAND_GRADIENT;
const p = MARK.phone;
const s = MARK.speaker;

/** Glifo (celular + bocina + pulso) en coordenadas 0..64, color configurable. */
function glyph(color = '#fff') {
  return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.r}" fill="none" stroke="${color}" stroke-width="${p.stroke}"/>
    <line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>
    <polyline points="${MARK.pulse}" fill="none" stroke="${color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function defs(stops = [ga, gb, gc]) {
  const st = stops
    .map((c, i) => `<stop offset="${stops.length === 1 ? 0 : i / (stops.length - 1)}" stop-color="${c}"/>`)
    .join('');
  return `<defs>
    <linearGradient id="g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">${st}</linearGradient>
    <radialGradient id="h" cx="20" cy="8" r="48" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
}

/** Escala un grupo alrededor del centro del viewBox 64×64. */
const scaled = (k, inner) => `<g transform="translate(32 32) scale(${k}) translate(-32 -32)">${inner}</g>`;

/** Fondo a sangre completa (sin esquinas) — maskable / apple-touch. */
function fullBleedSVG(size, glyphScale) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  ${defs()}
  <rect width="64" height="64" fill="url(#g)"/>
  <rect width="64" height="64" fill="url(#h)"/>
  ${scaled(glyphScale, glyph('#fff'))}
</svg>`;
}

/** Badge monocromo: sólo el glifo, blanco, ampliado para leerse a 24 dp. */
function badgeSVG(size) {
  // El celular mide 43.2 u de alto (con trazo); lo llevamos a ~88 % del lienzo.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  ${scaled(1.3, glyph('#fff'))}
</svg>`;
}

/* ---------- Íconos de accesos directos (lucide, mismo estilo de marca) ---------- */
async function lucideNode(name) {
  const file = path.join(root, 'node_modules/lucide-react/dist/esm/icons', `${name}.mjs`);
  const src = fs.readFileSync(file, 'utf8');
  // Extrae el literal `__iconData = {...}` sin ejecutar el módulo (evita depender de React).
  const m = src.match(/const __iconData = (\{[\s\S]*?\});\s*\n/);
  if (!m) throw new Error(`No se pudo leer el ícono lucide "${name}"`);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${m[1]});`)().node;
}

function nodeToSVG(node) {
  return node
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
}

const SHORTCUTS = [
  { file: 'shortcut-cliente', icon: 'user-plus', stops: [ga, gb, gc] },
  { file: 'shortcut-gasto', icon: 'receipt', stops: ['#ff9aad', '#ff6b85', '#e23a5a'] },
  { file: 'shortcut-pedir', icon: 'package-search', stops: ['#ffd88a', '#f5b947', '#d98a17'] },
  { file: 'shortcut-reportes', icon: 'chart-column-increasing', stops: ['#6ff0cb', '#34d6a6', '#0f9f76'] },
];

async function shortcutSVG(size, iconName, stops) {
  const node = await lucideNode(iconName);
  // Lucide usa un viewBox 24×24; lo centramos ocupando ~50 % del tile.
  const k = 32 / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  ${defs(stops)}
  <rect width="64" height="64" rx="15" fill="url(#g)"/>
  <rect width="64" height="64" rx="15" fill="url(#h)"/>
  <g transform="translate(16 16) scale(${k})" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${nodeToSVG(node)}</g>
</svg>`;
}

/* ---------- 3. Rasterizar ---------- */
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon.svg'), brandMarkSVG(512) + '\n');

const jobs = [
  { name: 'favicon-32.png', size: 32, svg: brandMarkSVG(32), transparent: true },
  { name: 'icon-192.png', size: 192, svg: brandMarkSVG(192), transparent: true },
  { name: 'icon-512.png', size: 512, svg: brandMarkSVG(512), transparent: true },
  { name: 'maskable-192.png', size: 192, svg: fullBleedSVG(192, 0.86), transparent: false },
  { name: 'maskable-512.png', size: 512, svg: fullBleedSVG(512, 0.86), transparent: false },
  { name: 'apple-touch-icon.png', size: 180, svg: fullBleedSVG(180, 0.92), transparent: false },
  { name: 'badge-96.png', size: 96, svg: badgeSVG(96), transparent: true },
];
for (const sc of SHORTCUTS) {
  jobs.push({ name: `${sc.file}.png`, size: 96, svg: await shortcutSVG(96, sc.icon, sc.stops), transparent: true });
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const job of jobs) {
    await page.setViewportSize({ width: job.size, height: job.size });
    const bg = job.transparent ? 'transparent' : '#06070a';
    await page.setContent(
      `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:${bg}}svg{display:block}</style></head><body>${job.svg}</body></html>`,
    );
    await page.screenshot({
      path: path.join(outDir, job.name),
      omitBackground: job.transparent,
      clip: { x: 0, y: 0, width: job.size, height: job.size },
    });
    console.log(`  ✓ ${path.relative(root, path.join(outDir, job.name))} (${job.size}×${job.size})`);
  }
} finally {
  await browser.close();
}
console.log(`Íconos generados en ${path.relative(root, outDir)}/ (${jobs.length + 1} archivos)`);

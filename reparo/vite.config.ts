import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { reparoPwaVersion } from './src/pwa/vite-plugin-pwa-version.js';

// Build de un solo archivo: index.html contiene todo (JS, CSS, fuentes) para
// que la app funcione incluso abriéndola directamente desde el disco, sin internet.
// sw.js, manifest e íconos se copian desde /public para el modo PWA instalable.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true }), reparoPwaVersion()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    target: 'es2022',
    outDir: '../app',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 5000,
  },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
} as any);

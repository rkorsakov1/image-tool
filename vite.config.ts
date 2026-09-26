import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const BASE = '/localcrop/';

/** 32-bit FNV-1a, hex. Only used to version the service worker cache (no Node types needed). */
const fnv1a = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

/** Files from public/ that the service worker precaches (small ones only; see src/pwa/serviceWorker.ts). */
const PUBLIC_PRECACHE = [
  'favicon.svg',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'vendor/ort@1.30.0/ort.webgpu.min.mjs',
  'vendor/ort@1.30.0/ort-wasm-simd-threaded.asyncify.mjs',
];

/**
 * Builds src/pwa/serviceWorker.ts as /sw.js and injects the precache list (every emitted
 * asset: app shell, workers, codec glue and .wasm) plus a version hash, so each deploy
 * gets a fresh cache and old ones are deleted on activate.
 */
const serviceWorker = (): Plugin => ({
  name: 'localcrop-service-worker',
  apply: 'build',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const entry = Object.values(bundle).find((output) => output.type === 'chunk' && output.fileName === 'sw.js');
    if (!entry || entry.type !== 'chunk') throw new Error('Service worker chunk not found.');
    const assets = Object.keys(bundle)
      .filter((file) => file !== 'sw.js' && file !== 'index.html' && !file.endsWith('.map'))
      .sort();
    const precache = ['./', ...assets, ...PUBLIC_PRECACHE];
    const version = fnv1a(assets.join('\n'));
    entry.code = entry.code.replace('__PRECACHE_MANIFEST__', JSON.stringify(precache)).replace('__BUILD_VERSION__', version);
  },
});

export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss(), serviceWorker()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { index: 'index.html', sw: 'src/pwa/serviceWorker.ts' },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});

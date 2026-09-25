/// <reference lib="webworker" />
// Hand-written service worker. Precaches the app shell and the WASM codecs so the app works
// offline. The background-removal model and ONNX Runtime wasm are NOT precached: the segment
// worker stores them in the Cache API ("localcrop-models-v1") on first use.
//
// Built as its own entry (sw.js at the site root); the vite.config.ts plugin replaces the two
// placeholders below with the build's asset list and a content hash.

export {};

declare const self: ServiceWorkerGlobalScope;

const PRECACHE: string[] = JSON.parse('__PRECACHE_MANIFEST__');
const VERSION = '__BUILD_VERSION__';
const CACHE = `localcrop-app-${VERSION}`;
const APP_CACHE_PREFIX = 'localcrop-app-';

const scopeUrl = new URL(self.registration.scope);
/** Large files the segment worker caches itself; never duplicated into the app cache. */
const BYPASS = [/\/models\//, /\.onnx$/, /ort-wasm-simd-threaded\.asyncify\.wasm$/];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE.map((path) => new URL(path, scopeUrl).href));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith(APP_CACHE_PREFIX) && name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

// The page asks the waiting worker to take over when the user accepts an update.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting();
});

const handleNavigation = async (request: Request): Promise<Response> => {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(new URL('./', scopeUrl).href, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(new URL('./', scopeUrl).href, { ignoreVary: true });
    return cached ?? new Response('Offline, and the app is not cached yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
};

/** Hashed assets never change, so the cache wins; anything else missing is fetched and kept. */
const handleAsset = async (request: Request): Promise<Response> => {
  // ignoreVary: module scripts send an Origin header that a Vary: Origin response would otherwise mismatch.
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scopeUrl.origin || !url.pathname.startsWith(scopeUrl.pathname)) return;
  if (BYPASS.some((pattern) => pattern.test(url.pathname))) return;
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  event.respondWith(handleAsset(request));
});

import type { RawImage } from '../lib/decoders/types';
import type { HeifRequest, HeifResponse } from './heif.worker';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (image: RawImage) => void; reject: (error: Error) => void }>();
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** The worker (and ~2 MB of libheif) is dropped after a minute without HEIC files. */
const IDLE_RELEASE_MS = 60_000;

const getWorker = (): Worker => {
  if (worker) return worker;
  worker = new Worker(new URL('./heif.worker.ts', import.meta.url), { type: 'module', name: 'heif' });
  worker.addEventListener('message', (event: MessageEvent<HeifResponse>) => {
    const entry = pending.get(event.data.id);
    if (!entry) return;
    pending.delete(event.data.id);
    if ('error' in event.data) entry.reject(new Error(event.data.error));
    else entry.resolve({ width: event.data.width, height: event.data.height, data: new Uint8ClampedArray(event.data.data) });
  });
  worker.addEventListener('error', () => {
    for (const entry of pending.values()) entry.reject(new Error('The HEIC decoder could not be loaded.'));
    pending.clear();
    worker?.terminate();
    worker = null;
  });
  return worker;
};

/** Decodes a HEIC/HEIF file off the main thread. */
export const decodeHeif = (buffer: ArrayBuffer): Promise<RawImage> => {
  if (idleTimer) clearTimeout(idleTimer);
  const id = nextId++;
  const promise = new Promise<RawImage>((resolve, reject) => pending.set(id, { resolve, reject }));
  getWorker().postMessage({ id, buffer } satisfies HeifRequest, [buffer]);
  return promise.finally(() => {
    if (pending.size > 0) return;
    idleTimer = setTimeout(() => {
      worker?.terminate();
      worker = null;
    }, IDLE_RELEASE_MS);
  });
};

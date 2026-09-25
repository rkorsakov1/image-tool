import { MODEL_CACHE_NAME, SEGMENTATION_MODEL } from './segmentationModel';
import type { SegmentResponse, SegmentStage } from './segmentProtocol';

export const IDLE_RELEASE_MS = 60_000;

export type SegmentProgress = { stage: SegmentStage; loaded: number; total: number };
export type SegmentOutput = { alpha: Uint8Array; provider: 'webgpu' | 'wasm' };

let worker: Worker | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;

/** Terminates the worker, which frees the ONNX session and all model memory. */
export const releaseSegmenter = (): void => {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  worker?.terminate();
  worker = null;
};

const scheduleRelease = () => {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(releaseSegmenter, IDLE_RELEASE_MS);
};

const getWorker = (): Worker => {
  worker ??= new Worker(new URL('./segment.worker.ts', import.meta.url), { type: 'module', name: 'segment' });
  return worker;
};

/** Runs background segmentation for `bitmap`; the worker (and model) load lazily on first use. */
export const segmentImage = async (bitmap: ImageBitmap, onProgress: (progress: SegmentProgress) => void): Promise<SegmentOutput> => {
  if (idleTimer) clearTimeout(idleTimer);
  const size = SEGMENTATION_MODEL.inputSize;
  const input = await createImageBitmap(bitmap, { resizeWidth: size, resizeHeight: size, resizeQuality: 'high' });
  const requestId = nextId;
  nextId += 1;
  const target = getWorker();

  return new Promise<SegmentOutput>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener('message', handleMessage);
      target.removeEventListener('error', handleError);
      scheduleRelease();
    };
    const handleMessage = (event: MessageEvent<SegmentResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId) return;
      if (response.type === 'progress') {
        onProgress({ stage: response.stage, loaded: response.loaded, total: response.total });
        return;
      }
      cleanup();
      if (response.type === 'error') {
        reject(new Error(response.message));
        return;
      }
      resolve({ alpha: response.alpha, provider: response.provider });
    };
    const handleError = (event: ErrorEvent) => {
      cleanup();
      releaseSegmenter();
      reject(new Error(event.message || 'The background-removal worker crashed (possibly out of memory).'));
    };
    target.addEventListener('message', handleMessage);
    target.addEventListener('error', handleError);
    target.postMessage({ type: 'segment', requestId, input, width: bitmap.width, height: bitmap.height }, [input]);
  });
};

/** True if the model is already in the Cache API (instant, offline-capable start). */
export const isModelCached = async (): Promise<boolean> => {
  try {
    const cache = await caches.open(MODEL_CACHE_NAME);
    const url = new URL(SEGMENTATION_MODEL.url, new URL(import.meta.env.BASE_URL, window.location.origin)).href;
    return (await cache.match(url)) !== undefined;
  } catch {
    return false;
  }
};

export const clearDownloadedModels = async (): Promise<boolean> => {
  releaseSegmenter();
  try {
    return await caches.delete(MODEL_CACHE_NAME);
  } catch {
    return false;
  }
};

import { supportsOffscreen2d } from './capabilities';
import { MODEL_CACHE_NAME, SEGMENTATION_MODEL } from './segmentationModel';
import type { SegmentRequest, SegmentResponse, SegmentStage } from './segmentProtocol';

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

type Finished = Extract<SegmentResponse, { type: 'segmented' | 'inferred' }>;

/** Sends one request and resolves with its final response, forwarding progress updates. */
const send = (request: SegmentRequest, transfer: Transferable[], onProgress: (progress: SegmentProgress) => void): Promise<Finished> => {
  const target = getWorker();
  return new Promise<Finished>((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener('message', handleMessage);
      target.removeEventListener('error', handleError);
      scheduleRelease();
    };
    const handleMessage = (event: MessageEvent<SegmentResponse>) => {
      const response = event.data;
      if (response.requestId !== request.requestId) return;
      if (response.type === 'progress') {
        onProgress({ stage: response.stage, loaded: response.loaded, total: response.total });
        return;
      }
      cleanup();
      if (response.type === 'error') {
        reject(new Error(response.message));
        return;
      }
      resolve(response);
    };
    const handleError = (event: ErrorEvent) => {
      cleanup();
      releaseSegmenter();
      reject(new Error(event.message || 'The background-removal worker crashed (possibly out of memory).'));
    };
    target.addEventListener('message', handleMessage);
    target.addEventListener('error', handleError);
    target.postMessage(request, transfer);
  });
};

/** Runs background segmentation for `bitmap`; the worker (and model) load lazily on first use. */
export const segmentImage = async (bitmap: ImageBitmap, onProgress: (progress: SegmentProgress) => void): Promise<SegmentOutput> => {
  if (idleTimer) clearTimeout(idleTimer);
  const size = SEGMENTATION_MODEL.inputSize;
  const input = await createImageBitmap(bitmap, { resizeWidth: size, resizeHeight: size, resizeQuality: 'high' });
  const requestId = nextId;
  nextId += 1;

  if (supportsOffscreen2d()) {
    const response = await send({ type: 'segment', requestId, input, width: bitmap.width, height: bitmap.height }, [input], onProgress);
    if (response.type !== 'segmented') throw new Error('Unexpected response from the segmentation worker.');
    return { alpha: response.alpha, provider: response.provider };
  }

  // Fallback: canvas work on the main thread, inference still in the worker.
  const [{ domEnv }, { readInputPixels, toInputTensor, upscaleMask }] = await Promise.all([
    import('./pipeline'),
    import('./segmentationPipeline'),
  ]);
  const tensor = toInputTensor(readInputPixels(input, domEnv));
  input.close();
  const response = await send({ type: 'infer', requestId, tensor }, [tensor.buffer], onProgress);
  if (response.type !== 'inferred') throw new Error('Unexpected response from the segmentation worker.');
  return { alpha: upscaleMask(response.mask, bitmap.width, bitmap.height, domEnv), provider: response.provider };
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

/// <reference lib="webworker" />
// Background-removal inference with the vendored ONNX Runtime, in its own worker so that
// terminating it releases all model memory.

import { MODEL_CACHE_NAME, ORT_RUNTIME, SEGMENTATION_MODEL } from './segmentationModel';
import type { SegmentRequest, SegmentResponse, SegmentStage } from './segmentProtocol';

// The small part of the onnxruntime-web API we use (loaded by URL, so no npm types).
type OrtTensor = { data: Float32Array; dims: readonly number[] };
type OrtSession = {
  run: (feeds: Record<string, OrtTensor>) => Promise<Record<string, OrtTensor>>;
  release: () => Promise<void>;
};
type Ort = {
  env: { wasm: { numThreads: number; wasmPaths: string; wasmBinary?: ArrayBuffer | Uint8Array; proxy: boolean }; logLevel: string };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => OrtTensor;
  InferenceSession: { create: (model: Uint8Array, options: Record<string, unknown>) => Promise<OrtSession> };
};

type Provider = 'webgpu' | 'wasm';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const siteRoot = new URL(import.meta.env.BASE_URL, scope.location.origin);
const runtimeBase = new URL(ORT_RUNTIME.path, siteRoot);

let sessionPromise: Promise<{ session: OrtSession; provider: Provider }> | null = null;

const post = (response: SegmentResponse, transfer: Transferable[] = []): void => scope.postMessage(response, transfer);

const progress = (requestId: number, stage: SegmentStage, loaded = 0, total = 0) =>
  post({ type: 'progress', requestId, stage, loaded, total });

/** Fetches through the Cache API so the files are available offline on the next visit. */
const fetchCached = async (url: URL, expectedBytes: number, onProgress: (loaded: number, total: number) => void): Promise<ArrayBuffer> => {
  const cache = await caches.open(MODEL_CACHE_NAME).catch(() => null);
  const cached = await cache?.match(url.href);
  if (cached) {
    onProgress(expectedBytes, expectedBytes);
    return cached.arrayBuffer();
  }

  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}) for ${url.pathname}.`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(Math.min(loaded, expectedBytes), expectedBytes);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  await cache?.put(url.href, new Response(bytes.slice(), { headers: { 'Content-Type': 'application/octet-stream' } })).catch(() => undefined);
  return bytes.buffer;
};

const hasWebGpu = async (): Promise<boolean> => {
  const gpu = (scope.navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
};

const loadSession = async (requestId: number): Promise<{ session: OrtSession; provider: Provider }> => {
  progress(requestId, 'runtime', 0, ORT_RUNTIME.wasmBytes);
  const wasmBinary = await fetchCached(new URL(ORT_RUNTIME.wasm, runtimeBase), ORT_RUNTIME.wasmBytes, (loaded, total) =>
    progress(requestId, 'runtime', loaded, total),
  );
  const ort = (await import(/* @vite-ignore */ new URL(ORT_RUNTIME.module, runtimeBase).href)) as Ort;
  // No SharedArrayBuffer on GitHub Pages: single-threaded, and no proxy worker (we are the worker).
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = runtimeBase.href;
  ort.env.wasm.wasmBinary = wasmBinary;
  ort.env.logLevel = 'error';

  const modelUrl = new URL(SEGMENTATION_MODEL.url, siteRoot);
  const model = await fetchCached(modelUrl, SEGMENTATION_MODEL.bytes, (loaded, total) => progress(requestId, 'model', loaded, total));

  progress(requestId, 'session');
  const options = (provider: Provider) => ({
    executionProviders: [provider],
    graphOptimizationLevel: 'all',
    // Constant-fold the weight DequantizeLinear nodes at load time (see VENDOR.md).
    extra: { session: { disable_quant_qdq: '1' } },
  });

  if (await hasWebGpu()) {
    try {
      const session = await ort.InferenceSession.create(new Uint8Array(model.slice(0)), options('webgpu'));
      return { session, provider: 'webgpu' };
    } catch (error) {
      console.warn('WebGPU session failed; falling back to WASM.', error);
    }
  }
  const session = await ort.InferenceSession.create(new Uint8Array(model), options('wasm'));
  return { session, provider: 'wasm' };
};

const toInputTensor = (input: ImageBitmap): Float32Array => {
  const size = SEGMENTATION_MODEL.inputSize;
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is not available.');
  context.drawImage(input, 0, 0, size, size);
  const { data } = context.getImageData(0, 0, size, size);

  let max = 1;
  for (let index = 0; index < data.length; index += 4) {
    max = Math.max(max, data[index] as number, data[index + 1] as number, data[index + 2] as number);
  }
  const plane = size * size;
  const tensor = new Float32Array(plane * 3);
  const { mean, std } = SEGMENTATION_MODEL;
  for (let pixel = 0; pixel < plane; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      tensor[channel * plane + pixel] = ((data[pixel * 4 + channel] as number) / max - (mean[channel] as number)) / (std[channel] as number);
    }
  }
  return tensor;
};

const normalizeOutput = (values: Float32Array): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(values.length);
  if (SEGMENTATION_MODEL.outputNormalization === 'sigmoid') {
    for (let index = 0; index < values.length; index += 1) out[index] = 255 / (1 + Math.exp(-(values[index] as number)));
    return out;
  }
  if (SEGMENTATION_MODEL.outputNormalization === 'none') {
    for (let index = 0; index < values.length; index += 1) out[index] = (values[index] as number) * 255;
    return out;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min || 1;
  for (let index = 0; index < values.length; index += 1) out[index] = (((values[index] as number) - min) / range) * 255;
  return out;
};

/** Bilinear upscale of the model's mask to the source resolution. */
const upscaleMask = (mask: Uint8ClampedArray, width: number, height: number): Uint8Array => {
  const size = SEGMENTATION_MODEL.inputSize;
  const small = new OffscreenCanvas(size, size);
  const smallContext = small.getContext('2d');
  if (!smallContext) throw new Error('Canvas 2D is not available.');
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let index = 0; index < mask.length; index += 1) {
    const value = mask[index] as number;
    rgba[index * 4] = value;
    rgba[index * 4 + 1] = value;
    rgba[index * 4 + 2] = value;
    rgba[index * 4 + 3] = 255;
  }
  smallContext.putImageData(new ImageData(rgba, size, size), 0, 0);

  const large = new OffscreenCanvas(width, height);
  const largeContext = large.getContext('2d', { willReadFrequently: true });
  if (!largeContext) throw new Error('Canvas 2D is not available.');
  largeContext.imageSmoothingEnabled = true;
  largeContext.imageSmoothingQuality = 'low'; // bilinear
  largeContext.drawImage(small, 0, 0, width, height);
  const { data } = largeContext.getImageData(0, 0, width, height);
  const alpha = new Uint8Array(width * height);
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = data[index * 4] as number;
  return alpha;
};

const handleSegment = async (request: Extract<SegmentRequest, { type: 'segment' }>): Promise<void> => {
  const { requestId, input, width, height } = request;
  try {
    sessionPromise ??= loadSession(requestId);
    const { session, provider } = await sessionPromise.catch((error: unknown) => {
      sessionPromise = null;
      throw error;
    });

    progress(requestId, 'inference');
    const size = SEGMENTATION_MODEL.inputSize;
    const ort = (await import(/* @vite-ignore */ new URL(ORT_RUNTIME.module, runtimeBase).href)) as Ort;
    const feeds = { [SEGMENTATION_MODEL.inputName]: new ort.Tensor('float32', toInputTensor(input), [1, 3, size, size]) };
    const results = await session.run(feeds);
    const output = results[SEGMENTATION_MODEL.outputName];
    if (!output) throw new Error(`The model has no output named ${SEGMENTATION_MODEL.outputName}.`);

    const alpha = upscaleMask(normalizeOutput(output.data.subarray(0, size * size)), width, height);
    post({ type: 'segmented', requestId, alpha, provider }, [alpha.buffer]);
  } catch (error) {
    post({ type: 'error', requestId, message: error instanceof Error ? error.message : String(error) });
  } finally {
    input.close();
  }
};

scope.onmessage = (event: MessageEvent<SegmentRequest>) => {
  const request = event.data;
  if (request.type === 'segment') void handleSegment(request);
};

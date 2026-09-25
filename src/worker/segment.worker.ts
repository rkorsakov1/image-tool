/// <reference lib="webworker" />
// Background-removal inference with the vendored ONNX Runtime, in its own worker so that
// terminating it releases all model memory.

import { offscreenEnv } from './pipeline';
import { MODEL_CACHE_NAME, ORT_RUNTIME, SEGMENTATION_MODEL } from './segmentationModel';
import { normalizeOutput, readInputPixels, toInputTensor, upscaleMask } from './segmentationPipeline';
import type { SegmentRequest, SegmentResponse, SegmentStage } from './segmentProtocol';

// The small part of the onnxruntime-web API we use (loaded by URL, so no npm types).
type OrtTensor = { data: Float32Array; dims: readonly number[] };
type OrtSession = { run: (feeds: Record<string, OrtTensor>) => Promise<Record<string, OrtTensor>> };
type Ort = {
  env: { wasm: { numThreads: number; wasmPaths: string; wasmBinary?: ArrayBuffer | Uint8Array; proxy: boolean }; logLevel: string };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => OrtTensor;
  InferenceSession: { create: (model: Uint8Array, options: Record<string, unknown>) => Promise<OrtSession> };
};

type Provider = 'webgpu' | 'wasm';
type Loaded = { ort: Ort; session: OrtSession; provider: Provider };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const siteRoot = new URL(import.meta.env.BASE_URL, scope.location.origin);
const runtimeBase = new URL(ORT_RUNTIME.path, siteRoot);

let loading: Promise<Loaded> | null = null;

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

const load = async (requestId: number): Promise<Loaded> => {
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
      return { ort, session, provider: 'webgpu' };
    } catch (error) {
      console.warn('WebGPU session failed; falling back to WASM.', error);
    }
  }
  const session = await ort.InferenceSession.create(new Uint8Array(model), options('wasm'));
  return { ort, session, provider: 'wasm' };
};

/** Runs the model on a prepared tensor and returns the normalized square mask. */
const infer = async (requestId: number, tensor: Float32Array): Promise<{ mask: Uint8ClampedArray; provider: Provider }> => {
  loading ??= load(requestId);
  const { ort, session, provider } = await loading.catch((error: unknown) => {
    loading = null;
    throw error;
  });
  progress(requestId, 'inference');
  const size = SEGMENTATION_MODEL.inputSize;
  const results = await session.run({ [SEGMENTATION_MODEL.inputName]: new ort.Tensor('float32', tensor, [1, 3, size, size]) });
  const output = results[SEGMENTATION_MODEL.outputName];
  if (!output) throw new Error(`The model has no output named ${SEGMENTATION_MODEL.outputName}.`);
  return { mask: normalizeOutput(output.data.subarray(0, size * size)), provider };
};

const handleRequest = async (request: SegmentRequest): Promise<void> => {
  const { requestId } = request;
  try {
    if (request.type === 'infer') {
      const { mask, provider } = await infer(requestId, request.tensor);
      post({ type: 'inferred', requestId, mask, provider }, [mask.buffer]);
      return;
    }
    const tensor = toInputTensor(readInputPixels(request.input, offscreenEnv));
    request.input.close();
    const { mask, provider } = await infer(requestId, tensor);
    const alpha = upscaleMask(mask, request.width, request.height, offscreenEnv);
    post({ type: 'segmented', requestId, alpha, provider }, [alpha.buffer]);
  } catch (error) {
    post({ type: 'error', requestId, message: error instanceof Error ? error.message : String(error) });
  }
};

scope.onmessage = (event: MessageEvent<SegmentRequest>) => {
  void handleRequest(event.data);
};

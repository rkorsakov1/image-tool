import type {
  ComposeJob,
  ComposeResult,
  EncodeJob,
  EncodeResult,
  FillJob,
  FillResult,
  WorkerRequest,
  WorkerResponse,
  ZipJob,
  ZipResult,
} from './protocol';
import { supportsOffscreen2d } from './capabilities';
import { createCancelledError } from './protocol';

export type EncodeHandle = { requestId: number; promise: Promise<EncodeResult> };

export type Processor = {
  encode: (job: EncodeJob) => EncodeHandle;
  fill: (job: FillJob) => Promise<FillResult>;
  compose: (job: ComposeJob) => Promise<ComposeResult>;
  zip: (job: ZipJob) => Promise<ZipResult>;
  cancel: (requestId: number) => void;
  /** 'worker' normally; 'main-thread' when OffscreenCanvas 2D isn't available. */
  mode: 'worker' | 'main-thread';
};

type AnyResult = EncodeResult | FillResult | ComposeResult | ZipResult;
type Pending = { resolve: (result: AnyResult) => void; reject: (error: Error) => void };


const createWorkerProcessor = (name: string): Processor => {
  const worker = new Worker(new URL('./processor.worker.ts', import.meta.url), { type: 'module', name });
  const pending = new Map<number, Pending>();
  let nextId = 1;

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const entry = pending.get(response.requestId);
    if (!entry) return;
    pending.delete(response.requestId);
    if (response.type === 'error') {
      entry.reject(response.cancelled ? createCancelledError() : new Error(response.message));
      return;
    }
    entry.resolve(response.result);
  };

  worker.onerror = (event) => {
    const error = new Error(event.message || 'The image worker crashed.');
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };

  /** Posts a request and returns a promise for its response, keyed by request id. */
  const request = <T extends AnyResult>(build: (requestId: number) => WorkerRequest, transfer: Transferable[] = []) => {
    const requestId = nextId;
    nextId += 1;
    const promise = new Promise<T>((resolve, reject) => {
      pending.set(requestId, { resolve: resolve as Pending['resolve'], reject });
    });
    worker.postMessage(build(requestId), transfer);
    return { requestId, promise };
  };

  return {
    mode: 'worker',
    // The bitmap is cloned by structured clone, so the main thread keeps its copy.
    encode: (job) => request<EncodeResult>((requestId) => ({ type: 'encode', requestId, payload: job })),
    fill: (job) => request<FillResult>((requestId) => ({ type: 'fill', requestId, payload: job }), [job.mask.buffer]).promise,
    compose: (job) => request<ComposeResult>((requestId) => ({ type: 'compose', requestId, payload: job }), [job.alpha.buffer]).promise,
    // Entry buffers are transferred: the caller must not reuse them.
    zip: (job) =>
      request<ZipResult>((requestId) => ({ type: 'zip', requestId, payload: job }), job.entries.map((entry) => entry.data.buffer)).promise,
    cancel: (requestId) => worker.postMessage({ type: 'cancel', requestId } satisfies WorkerRequest),
  };
};

/** Same interface, running the pipeline on the main thread with <canvas>. */
const createMainThreadProcessor = (): Processor => {
  const cancelled = new Set<number>();
  let nextId = 1;
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = <T,>(run: () => Promise<T>): Promise<T> => {
    const promise = queue.then(run, run);
    queue = promise.catch(() => undefined);
    return promise;
  };

  return {
    mode: 'main-thread',
    encode: (job) => {
      const requestId = nextId;
      nextId += 1;
      const promise = enqueue(async () => {
        const { runEncodeJob, domEnv } = await import('./pipeline');
        const checkpoint = async () => {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          if (cancelled.has(requestId)) throw createCancelledError();
        };
        try {
          await checkpoint();
          return await runEncodeJob(job, domEnv, checkpoint);
        } finally {
          cancelled.delete(requestId);
        }
      });
      return { requestId, promise };
    },
    fill: (job) =>
      enqueue(async () => {
        const { runFillJob, domEnv } = await import('./pipeline');
        return runFillJob(job, domEnv);
      }),
    compose: (job) =>
      enqueue(async () => {
        const { runComposeJob, domEnv } = await import('./pipeline');
        return runComposeJob(job, domEnv);
      }),
    zip: (job) =>
      enqueue(async () => {
        const { createZip } = await import('../lib/zip');
        return { blob: createZip(job.entries) };
      }),
    cancel: (requestId) => {
      cancelled.add(requestId);
    },
  };
};

/** `name` labels the worker in devtools. Retouch uses its own instance so strokes never wait behind an encode. */
export const createWorkerClient = (name = 'processor'): Processor =>
  supportsOffscreen2d() ? createWorkerProcessor(name) : createMainThreadProcessor();

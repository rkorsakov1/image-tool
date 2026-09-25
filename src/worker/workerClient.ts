import type { EncodeJob, EncodeResult, WorkerRequest, WorkerResponse } from './protocol';
import { createCancelledError } from './protocol';

export type EncodeHandle = { requestId: number; promise: Promise<EncodeResult> };

export type Processor = {
  encode: (job: EncodeJob) => EncodeHandle;
  cancel: (requestId: number) => void;
  /** 'worker' normally; 'main-thread' when OffscreenCanvas 2D isn't available. */
  mode: 'worker' | 'main-thread';
};

type Pending = { resolve: (result: EncodeResult) => void; reject: (error: Error) => void };

const supportsOffscreen2d = (): boolean => {
  try {
    return typeof OffscreenCanvas !== 'undefined' && new OffscreenCanvas(1, 1).getContext('2d') !== null;
  } catch {
    return false;
  }
};

const createWorkerProcessor = (): Processor => {
  const worker = new Worker(new URL('./processor.worker.ts', import.meta.url), { type: 'module', name: 'processor' });
  const pending = new Map<number, Pending>();
  let nextId = 1;

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const entry = pending.get(response.requestId);
    if (!entry) return;
    pending.delete(response.requestId);
    if (response.type === 'encoded') {
      entry.resolve(response.result);
      return;
    }
    entry.reject(response.cancelled ? createCancelledError() : new Error(response.message));
  };

  worker.onerror = (event) => {
    const error = new Error(event.message || 'The image worker crashed.');
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };

  const send = (request: WorkerRequest) => worker.postMessage(request);

  return {
    mode: 'worker',
    encode: (job) => {
      const requestId = nextId;
      nextId += 1;
      const promise = new Promise<EncodeResult>((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
      });
      // The bitmap is cloned by structured clone, so the main thread keeps its copy.
      send({ type: 'encode', requestId, payload: job });
      return { requestId, promise };
    },
    cancel: (requestId) => send({ type: 'cancel', requestId }),
  };
};

/** Same interface, running the pipeline on the main thread with <canvas>. */
const createMainThreadProcessor = (): Processor => {
  const cancelled = new Set<number>();
  let nextId = 1;
  let queue: Promise<unknown> = Promise.resolve();

  return {
    mode: 'main-thread',
    encode: (job) => {
      const requestId = nextId;
      nextId += 1;
      const run = async (): Promise<EncodeResult> => {
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
      };
      const promise = queue.then(run, run);
      queue = promise.catch(() => undefined);
      return { requestId, promise };
    },
    cancel: (requestId) => {
      cancelled.add(requestId);
    },
  };
};

export const createWorkerClient = (): Processor =>
  supportsOffscreen2d() ? createWorkerProcessor() : createMainThreadProcessor();

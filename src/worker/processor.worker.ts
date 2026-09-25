/// <reference lib="webworker" />
import { createZip } from '../lib/zip';
import { offscreenEnv, runComposeJob, runEncodeJob, runFillJob } from './pipeline';
import { createCancelledError, isCancelledError, type WorkerRequest, type WorkerResponse } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const cancelled = new Set<number>();
let queue: Promise<void> = Promise.resolve();

const post = (response: WorkerResponse, transfer: Transferable[] = []): void => scope.postMessage(response, transfer);

/** Yields to the event loop so pending 'cancel' messages are processed, then aborts if cancelled. */
const checkpointFor = (requestId: number) => async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (cancelled.has(requestId)) throw createCancelledError();
};

const handleEncode = async (request: Extract<WorkerRequest, { type: 'encode' }>): Promise<void> => {
  const { requestId, payload } = request;
  try {
    const checkpoint = checkpointFor(requestId);
    await checkpoint();
    const result = await runEncodeJob(payload, offscreenEnv, checkpoint);
    post({ type: 'encoded', requestId, result }, result.reference ? [result.reference] : []);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    post({ type: 'error', requestId, message, cancelled: isCancelledError(error) });
  } finally {
    payload.bitmap.close();
    cancelled.delete(requestId);
  }
};

const postError = (requestId: number, error: unknown): void =>
  post({ type: 'error', requestId, message: error instanceof Error ? error.message : String(error), cancelled: false });

const handleFill = async (request: Extract<WorkerRequest, { type: 'fill' }>): Promise<void> => {
  const { requestId, payload } = request;
  try {
    const result = await runFillJob(payload, offscreenEnv);
    post({ type: 'filled', requestId, result }, [result.bitmap]);
  } catch (error) {
    postError(requestId, error);
  } finally {
    payload.bitmap.close();
  }
};

const handleCompose = async (request: Extract<WorkerRequest, { type: 'compose' }>): Promise<void> => {
  const { requestId, payload } = request;
  try {
    const result = await runComposeJob(payload, offscreenEnv);
    post({ type: 'composed', requestId, result }, [result.bitmap]);
  } catch (error) {
    postError(requestId, error);
  } finally {
    payload.bitmap.close();
  }
};

const handleZip = async (request: Extract<WorkerRequest, { type: 'zip' }>): Promise<void> => {
  try {
    post({ type: 'zipped', requestId: request.requestId, result: { blob: createZip(request.payload.entries) } });
  } catch (error) {
    postError(request.requestId, error);
  }
};

const handleRequest = (request: Exclude<WorkerRequest, { type: 'cancel' }>): Promise<void> => {
  if (request.type === 'encode') return handleEncode(request);
  if (request.type === 'fill') return handleFill(request);
  if (request.type === 'compose') return handleCompose(request);
  return handleZip(request);
};

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') {
    cancelled.add(request.requestId);
    return;
  }
  // Jobs run one at a time, in order; the newest preview request cancels older ones.
  queue = queue.then(() => handleRequest(request));
};

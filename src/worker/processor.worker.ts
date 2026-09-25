/// <reference lib="webworker" />
import { runEncodeJob, offscreenEnv } from './pipeline';
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

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') {
    cancelled.add(request.requestId);
    return;
  }
  // Jobs run one at a time, in order; the newest preview request cancels older ones.
  queue = queue.then(() => handleEncode(request));
};

import type { CropRect, EncodeSettings, Transform } from '../lib/types';

export type EncodeJob = {
  /** Cloned (not transferred) so the main thread keeps its copy. */
  bitmap: ImageBitmap;
  transform: Transform;
  crop: CropRect | null;
  settings: EncodeSettings;
  /** Also return the source crop resampled to the output size (for Compare view). */
  wantReference: boolean;
};

export type EncodeResult = {
  blob: Blob;
  width: number;
  height: number;
  /** Quality actually used (resolved in target-size mode); 100 for PNG. */
  quality: number;
  encoder: 'wasm' | 'native';
  warning: string | null;
  upscaleCapped: boolean;
  reference: ImageBitmap | null;
};

export type WorkerRequest =
  | { type: 'encode'; requestId: number; payload: EncodeJob }
  | { type: 'cancel'; requestId: number };

export type WorkerResponse =
  | { type: 'encoded'; requestId: number; result: EncodeResult }
  | { type: 'error'; requestId: number; message: string; cancelled: boolean };

export const CANCELLED_MESSAGE = 'Cancelled';

export const createCancelledError = (): Error => {
  const error = new Error(CANCELLED_MESSAGE);
  error.name = 'CancelledError';
  return error;
};

export const isCancelledError = (error: unknown): boolean => error instanceof Error && error.name === 'CancelledError';

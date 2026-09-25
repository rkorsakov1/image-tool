export type SegmentStage = 'runtime' | 'model' | 'session' | 'inference';

export type SegmentRequest = {
  type: 'segment';
  requestId: number;
  /** The source already resized to the model's square input size. Transferred. */
  input: ImageBitmap;
  /** Source size the mask is scaled back to. */
  width: number;
  height: number;
};

export type SegmentResponse =
  | { type: 'progress'; requestId: number; stage: SegmentStage; loaded: number; total: number }
  | { type: 'segmented'; requestId: number; alpha: Uint8Array; provider: 'webgpu' | 'wasm' }
  | { type: 'error'; requestId: number; message: string };

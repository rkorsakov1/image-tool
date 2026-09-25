export type SegmentStage = 'runtime' | 'model' | 'session' | 'inference';

export type SegmentRequest =
  | {
      /** Worker does everything (OffscreenCanvas available). */
      type: 'segment';
      requestId: number;
      /** The source already resized to the model's square input size. Transferred. */
      input: ImageBitmap;
      /** Source size the mask is scaled back to. */
      width: number;
      height: number;
    }
  | {
      /** No OffscreenCanvas 2D: the page prepares the tensor and upscales the returned mask. */
      type: 'infer';
      requestId: number;
      /** Normalized CHW input tensor. Transferred. */
      tensor: Float32Array;
    };

export type SegmentResponse =
  | { type: 'progress'; requestId: number; stage: SegmentStage; loaded: number; total: number }
  | { type: 'segmented'; requestId: number; alpha: Uint8Array; provider: 'webgpu' | 'wasm' }
  | { type: 'inferred'; requestId: number; mask: Uint8ClampedArray; provider: 'webgpu' | 'wasm' }
  | { type: 'error'; requestId: number; message: string };

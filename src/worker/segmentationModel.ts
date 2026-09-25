// Swapping the background-removal model should only require editing this file (see VENDOR.md).

export type OutputNormalization = 'minmax' | 'sigmoid' | 'none';

export type SegmentationModel = {
  /** Path relative to the site root (import.meta.env.BASE_URL). */
  url: string;
  /** Exact file size, for the download progress bar (servers may compress the response). */
  bytes: number;
  /** Square input size in pixels. */
  inputSize: number;
  /** Applied after scaling pixels by 1 / max(pixel) (0–1 range): (x - mean) / std. */
  mean: [number, number, number];
  std: [number, number, number];
  inputName: string;
  outputName: string;
  outputNormalization: OutputNormalization;
  label: string;
};

export const SEGMENTATION_MODEL: SegmentationModel = {
  url: 'models/isnet-general-use-wq8/model.onnx',
  bytes: 46_736_138,
  inputSize: 1024,
  mean: [0.5, 0.5, 0.5],
  std: [1, 1, 1],
  inputName: 'input_image',
  outputName: 'output_image',
  outputNormalization: 'minmax',
  label: 'ISNet general-use (DIS), 8-bit weights',
};

export const ORT_RUNTIME = {
  version: '1.30.0',
  /** Folder under the site root holding the vendored ONNX Runtime files. */
  path: 'vendor/ort@1.30.0/',
  module: 'ort.webgpu.min.mjs',
  wasm: 'ort-wasm-simd-threaded.asyncify.wasm',
  wasmBytes: 26_781_914,
};

export const MODEL_CACHE_NAME = 'localcrop-models-v1';

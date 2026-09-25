// Pre- and post-processing around the segmentation model. Runs in the segment worker with
// OffscreenCanvas, or on the main thread with <canvas> where OffscreenCanvas 2D is missing.

import { get2d } from '../lib/drawing';
import type { CanvasEnv } from './pipeline';
import { SEGMENTATION_MODEL } from './segmentationModel';

/** RGBA pixels of `input` drawn at the model's square input size. */
export const readInputPixels = (input: ImageBitmap, env: CanvasEnv): Uint8ClampedArray => {
  const size = SEGMENTATION_MODEL.inputSize;
  const canvas = env.create(size, size);
  const context = get2d(canvas, { willReadFrequently: true });
  context.drawImage(input, 0, 0, size, size);
  return context.getImageData(0, 0, size, size).data;
};

/** Normalized CHW float tensor: pixel / max(pixel), then (x - mean) / std per channel. */
export const toInputTensor = (data: Uint8ClampedArray): Float32Array => {
  let max = 1;
  for (let index = 0; index < data.length; index += 4) {
    max = Math.max(max, data[index] as number, data[index + 1] as number, data[index + 2] as number);
  }
  const plane = data.length / 4;
  const tensor = new Float32Array(plane * 3);
  const { mean, std } = SEGMENTATION_MODEL;
  for (let pixel = 0; pixel < plane; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      tensor[channel * plane + pixel] = ((data[pixel * 4 + channel] as number) / max - (mean[channel] as number)) / (std[channel] as number);
    }
  }
  return tensor;
};

/** Model output → 0–255 alpha, using the model's configured normalization. */
export const normalizeOutput = (values: Float32Array): Uint8ClampedArray => {
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

/** Bilinear upscale of the square model mask to the source resolution. */
export const upscaleMask = (mask: Uint8ClampedArray, width: number, height: number, env: CanvasEnv): Uint8Array => {
  const size = SEGMENTATION_MODEL.inputSize;
  const small = env.create(size, size);
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let index = 0; index < mask.length; index += 1) {
    const value = mask[index] as number;
    rgba[index * 4] = value;
    rgba[index * 4 + 1] = value;
    rgba[index * 4 + 2] = value;
    rgba[index * 4 + 3] = 255;
  }
  get2d(small).putImageData(new ImageData(rgba, size, size), 0, 0);

  const large = env.create(width, height);
  const context = get2d(large, { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'low'; // bilinear
  context.drawImage(small, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);
  const alpha = new Uint8Array(width * height);
  for (let index = 0; index < alpha.length; index += 1) alpha[index] = data[index * 4] as number;
  return alpha;
};

// Object removal fills for uniform or smoothly varying backgrounds.
// Images are RGBA Uint8ClampedArray; masks are one byte per pixel (0 = keep, 255 = fill,
// in between = soft edge, blended proportionally).

export type Rect = { x: number; y: number; width: number; height: number };
export type RGB = [number, number, number];

/** Bounding box of mask > 0, or null for an empty mask. */
export const maskBounds = (mask: Uint8Array, width: number, height: number): Rect | null => {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (mask[row + x] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
};

const expandRect = (rect: Rect, margin: number, width: number, height: number): Rect => {
  const x = Math.max(0, rect.x - margin);
  const y = Math.max(0, rect.y - margin);
  return {
    x,
    y,
    width: Math.min(width, rect.x + rect.width + margin) - x,
    height: Math.min(height, rect.y + rect.height + margin) - y,
  };
};

/**
 * Per-channel median of the unmasked pixels within `ringWidth` px (Chebyshev distance) of the mask:
 * the default flat-fill color, robust to a few outliers along the edge.
 */
export const ringMedianColor = (data: Uint8ClampedArray, width: number, height: number, mask: Uint8Array, ringWidth = 4): RGB | null => {
  const bounds = maskBounds(mask, width, height);
  if (!bounds) return null;
  const region = expandRect(bounds, ringWidth, width, height);

  // Separable square dilation of the mask inside the region.
  const horizontal = new Uint8Array(region.width * region.height);
  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const from = Math.max(0, x - ringWidth);
      const to = Math.min(region.width - 1, x + ringWidth);
      let hit = 0;
      for (let k = from; k <= to && !hit; k += 1) hit = mask[(region.y + y) * width + region.x + k] ? 1 : 0;
      horizontal[y * region.width + x] = hit;
    }
  }

  const histograms = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let count = 0;
  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const index = (region.y + y) * width + region.x + x;
      if (mask[index]) continue;
      const from = Math.max(0, y - ringWidth);
      const to = Math.min(region.height - 1, y + ringWidth);
      let near = false;
      for (let k = from; k <= to && !near; k += 1) near = horizontal[k * region.width + x] === 1;
      if (!near) continue;
      for (let channel = 0; channel < 3; channel += 1) (histograms[channel] as Uint32Array)[data[index * 4 + channel] as number]! += 1;
      count += 1;
    }
  }
  if (count === 0) return null;

  const median = (histogram: Uint32Array): number => {
    const half = count / 2;
    let seen = 0;
    for (let value = 0; value < 256; value += 1) {
      seen += histogram[value] as number;
      if (seen >= half) return value;
    }
    return 255;
  };
  return [median(histograms[0] as Uint32Array), median(histograms[1] as Uint32Array), median(histograms[2] as Uint32Array)];
};

/** Fills masked pixels with one opaque color (soft mask values blend). */
export const flatFill = (data: Uint8ClampedArray, mask: Uint8Array, color: RGB): void => {
  for (let index = 0; index < mask.length; index += 1) {
    const weight = (mask[index] as number) / 255;
    if (weight === 0) continue;
    const offset = index * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      const original = data[offset + channel] as number;
      data[offset + channel] = original + ((color[channel] as number) - original) * weight;
    }
    const alpha = data[offset + 3] as number;
    data[offset + 3] = alpha + (255 - alpha) * weight;
  }
};

type Level = {
  width: number;
  height: number;
  /** Interleaved RGBA as floats 0–255. */
  values: Float32Array;
  unknown: Uint8Array;
};

const CHANNELS = 4;

const downsample = (level: Level): Level => {
  const width = Math.ceil(level.width / 2);
  const height = Math.ceil(level.height / 2);
  const values = new Float32Array(width * height * CHANNELS);
  const unknown = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const target = y * width + x;
      let known = 0;
      const sums = [0, 0, 0, 0];
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const fx = x * 2 + dx;
          const fy = y * 2 + dy;
          if (fx >= level.width || fy >= level.height) continue;
          const source = fy * level.width + fx;
          if (level.unknown[source]) continue;
          known += 1;
          for (let channel = 0; channel < CHANNELS; channel += 1) sums[channel]! += level.values[source * CHANNELS + channel] as number;
        }
      }
      // A coarse pixel is known if any of its fine pixels is, so the boundary ring survives
      // on every level. Coarse levels only provide the starting guess, so this is safe.
      unknown[target] = known === 0 ? 1 : 0;
      if (known > 0) {
        for (let channel = 0; channel < CHANNELS; channel += 1) values[target * CHANNELS + channel] = (sums[channel] as number) / known;
      }
    }
  }
  return { width, height, values, unknown };
};

/** Gauss–Seidel with over-relaxation on the unknown pixels; known pixels are fixed boundary values. */
const relax = (level: Level, tolerance: number, maxIterations: number): number => {
  const { width, height, values, unknown } = level;
  const cells: number[] = [];
  for (let index = 0; index < unknown.length; index += 1) if (unknown[index]) cells.push(index);
  const omega = 1.85;
  let iterations = 0;
  for (; iterations < maxIterations; iterations += 1) {
    let maxChange = 0;
    for (const index of cells) {
      const x = index % width;
      const y = (index - x) / width;
      let neighbours = 0;
      const sums = [0, 0, 0, 0];
      const add = (neighbour: number) => {
        neighbours += 1;
        for (let channel = 0; channel < CHANNELS; channel += 1) sums[channel]! += values[neighbour * CHANNELS + channel] as number;
      };
      if (x > 0) add(index - 1);
      if (x < width - 1) add(index + 1);
      if (y > 0) add(index - width);
      if (y < height - 1) add(index + width);
      if (neighbours === 0) continue;
      for (let channel = 0; channel < CHANNELS; channel += 1) {
        const offset = index * CHANNELS + channel;
        const current = values[offset] as number;
        const change = omega * ((sums[channel] as number) / neighbours - current);
        values[offset] = current + change;
        const magnitude = Math.abs(change);
        if (magnitude > maxChange) maxChange = magnitude;
      }
    }
    if (maxChange < tolerance) return iterations + 1;
  }
  return iterations;
};

export type HarmonicOptions = {
  /** Stop when no value changes by more than this (0–255 scale). Default 0.5, i.e. 0.5/255. */
  tolerance?: number;
  /** Iteration cap per pyramid level. */
  maxIterations?: number;
  /** Known pixels kept around the mask's bounding box as boundary. */
  margin?: number;
};

/**
 * Harmonic inpainting: solves Laplace's equation over the masked pixels with the surrounding
 * pixels as fixed boundary values, which reproduces gradients and soft shadows. Works inside the
 * mask's bounding box only, coarse-to-fine: the solution of each pyramid level (from 2×2
 * averaging) is the starting guess for the next finer one, so the fine levels converge quickly.
 * Modifies `data` in place; returns false if there was nothing to fill or no boundary to fill from.
 */
export const harmonicFill = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Uint8Array,
  { tolerance = 0.5, maxIterations = 4000, margin = 2 }: HarmonicOptions = {},
): boolean => {
  const bounds = maskBounds(mask, width, height);
  if (!bounds) return false;
  const region = expandRect(bounds, margin, width, height);

  const base: Level = {
    width: region.width,
    height: region.height,
    values: new Float32Array(region.width * region.height * CHANNELS),
    unknown: new Uint8Array(region.width * region.height),
  };
  let knownCount = 0;
  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const source = (region.y + y) * width + region.x + x;
      const target = y * region.width + x;
      base.unknown[target] = mask[source] ? 1 : 0;
      if (!mask[source]) knownCount += 1;
      for (let channel = 0; channel < CHANNELS; channel += 1) base.values[target * CHANNELS + channel] = data[source * CHANNELS + channel] as number;
    }
  }
  if (knownCount === 0) return false;

  const pyramid: Level[] = [base];
  while (true) {
    const last = pyramid[pyramid.length - 1] as Level;
    if (Math.min(last.width, last.height) <= 8) break;
    const next = downsample(last);
    pyramid.push(next);
  }

  // Coarsest level: start from the mean of the known pixels.
  const coarsest = pyramid[pyramid.length - 1] as Level;
  const mean = [0, 0, 0, 0];
  let meanCount = 0;
  for (let index = 0; index < coarsest.unknown.length; index += 1) {
    if (coarsest.unknown[index]) continue;
    meanCount += 1;
    for (let channel = 0; channel < CHANNELS; channel += 1) mean[channel]! += coarsest.values[index * CHANNELS + channel] as number;
  }
  for (let index = 0; index < coarsest.unknown.length; index += 1) {
    if (!coarsest.unknown[index]) continue;
    for (let channel = 0; channel < CHANNELS; channel += 1) coarsest.values[index * CHANNELS + channel] = (mean[channel] as number) / meanCount;
  }

  for (let levelIndex = pyramid.length - 1; levelIndex >= 0; levelIndex -= 1) {
    const level = pyramid[levelIndex] as Level;
    if (levelIndex < pyramid.length - 1) {
      // Prolongate: unknown fine pixels start from the bilinearly upsampled coarse solution.
      const coarse = pyramid[levelIndex + 1] as Level;
      for (let y = 0; y < level.height; y += 1) {
        const cy = Math.min(coarse.height - 1, Math.max(0, (y - 0.5) / 2));
        const y0 = Math.floor(cy);
        const y1 = Math.min(coarse.height - 1, y0 + 1);
        const fy = cy - y0;
        for (let x = 0; x < level.width; x += 1) {
          const index = y * level.width + x;
          if (!level.unknown[index]) continue;
          const cx = Math.min(coarse.width - 1, Math.max(0, (x - 0.5) / 2));
          const x0 = Math.floor(cx);
          const x1 = Math.min(coarse.width - 1, x0 + 1);
          const fx = cx - x0;
          for (let channel = 0; channel < CHANNELS; channel += 1) {
            const at = (px: number, py: number) => coarse.values[(py * coarse.width + px) * CHANNELS + channel] as number;
            const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * fx;
            const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * fx;
            level.values[index * CHANNELS + channel] = top + (bottom - top) * fy;
          }
        }
      }
    }
    relax(level, tolerance, maxIterations);
  }

  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const target = (region.y + y) * width + region.x + x;
      const weight = (mask[target] as number) / 255;
      if (weight === 0) continue;
      const source = y * region.width + x;
      for (let channel = 0; channel < CHANNELS; channel += 1) {
        const original = data[target * CHANNELS + channel] as number;
        data[target * CHANNELS + channel] = original + ((base.values[source * CHANNELS + channel] as number) - original) * weight;
      }
    }
  }
  return true;
};

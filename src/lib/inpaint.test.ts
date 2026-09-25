import { describe, expect, it } from 'vitest';
import { flatFill, harmonicFill, maskBounds, ringMedianColor } from './inpaint';

const makeImage = (width: number, height: number, pixel: (x: number, y: number) => [number, number, number]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return data;
};

const rectMask = (width: number, height: number, rect: { x: number; y: number; width: number; height: number }) => {
  const mask = new Uint8Array(width * height);
  for (let y = rect.y; y < rect.y + rect.height; y += 1) mask.fill(255, y * width + rect.x, y * width + rect.x + rect.width);
  return mask;
};

describe('maskBounds', () => {
  it('finds the bounding box', () => {
    expect(maskBounds(rectMask(10, 10, { x: 2, y: 3, width: 4, height: 5 }), 10, 10)).toEqual({ x: 2, y: 3, width: 4, height: 5 });
    expect(maskBounds(new Uint8Array(100), 10, 10)).toBeNull();
  });
});

describe('harmonicFill', () => {
  it('reconstructs a linear gradient under a hole', () => {
    const width = 96;
    const height = 64;
    // Linear functions are harmonic, so the exact solution is the original gradient.
    const gradient = (x: number, y: number): [number, number, number] => [40 + x * 1.5, 30 + y * 2, 200 - x - y];
    const original = makeImage(width, height, gradient);
    const damaged = original.slice();
    const hole = { x: 30, y: 16, width: 36, height: 30 };
    const mask = rectMask(width, height, hole);
    // Put a "logo" in the hole that the fill must remove.
    for (let index = 0; index < mask.length; index += 1) if (mask[index]) damaged.set([255, 0, 0, 255], index * 4);

    expect(harmonicFill(damaged, width, height, mask)).toBe(true);

    let maxError = 0;
    let totalError = 0;
    let count = 0;
    for (let index = 0; index < mask.length; index += 1) {
      if (!mask[index]) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const error = Math.abs((damaged[index * 4 + channel] as number) - (original[index * 4 + channel] as number));
        maxError = Math.max(maxError, error);
        totalError += error;
        count += 1;
      }
    }
    expect(totalError / count).toBeLessThan(1);
    expect(maxError).toBeLessThanOrEqual(2);
  });

  it('leaves pixels outside the mask untouched', () => {
    const width = 32;
    const height = 32;
    const original = makeImage(width, height, (x, y) => [x * 8, y * 8, 100]);
    const data = original.slice();
    const mask = rectMask(width, height, { x: 10, y: 10, width: 8, height: 8 });
    harmonicFill(data, width, height, mask);
    for (let index = 0; index < mask.length; index += 1) {
      if (mask[index]) continue;
      expect(data[index * 4]).toBe(original[index * 4]);
    }
  });

  it('handles a hole touching the image border', () => {
    const width = 40;
    const height = 30;
    const original = makeImage(width, height, () => [90, 120, 150]);
    const data = original.slice();
    const mask = rectMask(width, height, { x: 0, y: 0, width: 12, height: 30 });
    for (let index = 0; index < mask.length; index += 1) if (mask[index]) data.set([0, 0, 0, 255], index * 4);
    harmonicFill(data, width, height, mask);
    expect(Array.from(data.slice(0, 3))).toEqual([90, 120, 150]);
  });

  it('refuses a mask that covers everything', () => {
    const data = makeImage(8, 8, () => [1, 2, 3]);
    expect(harmonicFill(data, 8, 8, new Uint8Array(64).fill(255))).toBe(false);
  });
});

describe('ringMedianColor + flatFill', () => {
  it('uses the median of the surrounding ring', () => {
    const width = 40;
    const height = 40;
    const data = makeImage(width, height, (x) => (x === 5 ? [255, 255, 255] : [10, 20, 30]));
    const mask = rectMask(width, height, { x: 15, y: 15, width: 10, height: 10 });
    for (let index = 0; index < mask.length; index += 1) if (mask[index]) data.set([200, 0, 0, 255], index * 4);
    const color = ringMedianColor(data, width, height, mask);
    expect(color).toEqual([10, 20, 30]);
    flatFill(data, mask, color as [number, number, number]);
    expect(Array.from(data.slice((20 * width + 20) * 4, (20 * width + 20) * 4 + 4))).toEqual([10, 20, 30, 255]);
  });

  it('blends soft mask edges', () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255]);
    flatFill(data, new Uint8Array([128]), [255, 255, 255]);
    expect(data[0]).toBe(128);
  });
});

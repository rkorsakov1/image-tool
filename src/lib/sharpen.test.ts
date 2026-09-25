import { describe, expect, it } from 'vitest';
import { unsharpMask } from './sharpen';

const image = (width: number, height: number, value: (x: number, y: number) => number) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data.fill(value(x, y), offset, offset + 3);
      data[offset + 3] = 200;
    }
  }
  return data;
};

describe('unsharpMask', () => {
  it('leaves flat areas and alpha alone', () => {
    const data = image(8, 8, () => 100);
    unsharpMask(data, 8, 8, 100);
    expect(Array.from(data.slice(0, 4))).toEqual([100, 100, 100, 200]);
  });

  it('increases contrast across an edge', () => {
    const data = image(8, 8, (x) => (x < 4 ? 50 : 150));
    unsharpMask(data, 8, 8, 100);
    expect(data[(1 * 8 + 3) * 4]).toBeLessThan(50);
    expect(data[(1 * 8 + 4) * 4]).toBeGreaterThan(150);
  });

  it('does nothing at amount 0', () => {
    const data = image(8, 8, (x) => x * 20);
    const before = data.slice();
    unsharpMask(data, 8, 8, 0);
    expect(data).toEqual(before);
  });
});

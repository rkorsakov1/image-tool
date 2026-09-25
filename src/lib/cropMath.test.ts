import { describe, expect, it } from 'vitest';
import {
  computeAutoCrop,
  getViewTransform,
  moveCrop,
  resizeCropFromCorner,
  resolveOutputGeometry,
  scaleCropAroundCenter,
  screenToSource,
  sourceToScreen,
  targetAspect,
  transformedSize,
} from './cropMath';

const cover = (width: number | null, height: number | null, allowUpscale = false) => ({
  width,
  height,
  fit: 'cover' as const,
  allowUpscale,
});

describe('computeAutoCrop', () => {
  it('centers a square crop in a wide image', () => {
    expect(computeAutoCrop({ width: 4000, height: 2000 }, 1)).toEqual({ x: 1000, y: 0, width: 2000, height: 2000 });
  });

  it('centers a wide crop in a tall image', () => {
    expect(computeAutoCrop({ width: 1000, height: 2000 }, 16 / 9)).toEqual({
      x: 0,
      y: (2000 - 562.5) / 2,
      width: 1000,
      height: 562.5,
    });
  });

  it('uses the full image for free aspect', () => {
    expect(computeAutoCrop({ width: 300, height: 200 }, null)).toEqual({ x: 0, y: 0, width: 300, height: 200 });
  });
});

describe('targetAspect', () => {
  it('is locked only for cover with both dimensions', () => {
    expect(targetAspect(cover(1280, 720))).toBeCloseTo(16 / 9);
    expect(targetAspect(cover(1280, null))).toBeNull();
    expect(targetAspect({ width: 100, height: 100, fit: 'contain' })).toBeNull();
  });
});

describe('transformedSize', () => {
  it('swaps sides for quarter turns', () => {
    expect(transformedSize({ width: 40, height: 20 }, 90)).toEqual({ width: 20, height: 40 });
    expect(transformedSize({ width: 40, height: 20 }, 180)).toEqual({ width: 40, height: 20 });
  });
});

describe('moveCrop', () => {
  it('clamps to the image bounds', () => {
    const crop = { x: 10, y: 10, width: 50, height: 50 };
    expect(moveCrop(crop, -100, 1000, { width: 200, height: 100 })).toEqual({ x: 0, y: 50, width: 50, height: 50 });
  });
});

describe('resizeCropFromCorner', () => {
  const bounds = { width: 1000, height: 500 };

  it('keeps the aspect and anchors the opposite corner', () => {
    const crop = { x: 100, y: 100, width: 200, height: 100 };
    const result = resizeCropFromCorner(crop, 'se', { x: 500, y: 150 }, 2, bounds);
    expect(result).toEqual({ x: 100, y: 100, width: 400, height: 200 });
  });

  it('grows up-left from the nw handle', () => {
    const crop = { x: 400, y: 200, width: 200, height: 100 };
    const result = resizeCropFromCorner(crop, 'nw', { x: 300, y: 100 }, 2, bounds);
    expect(result.x + result.width).toBe(600);
    expect(result.y + result.height).toBe(300);
    expect(result.width / result.height).toBeCloseTo(2);
  });

  it('never leaves the image', () => {
    const crop = { x: 100, y: 100, width: 200, height: 100 };
    const result = resizeCropFromCorner(crop, 'se', { x: 5000, y: 5000 }, 2, bounds);
    expect(result.x + result.width).toBeLessThanOrEqual(1000);
    expect(result.y + result.height).toBeLessThanOrEqual(500);
    expect(result.width / result.height).toBeCloseTo(2);
  });

  it('enforces the 16 px minimum', () => {
    const crop = { x: 100, y: 100, width: 200, height: 200 };
    const result = resizeCropFromCorner(crop, 'se', { x: 101, y: 101 }, 1, bounds);
    expect(result.width).toBe(16);
    expect(result.height).toBe(16);
  });

  it('resizes axes independently with free aspect', () => {
    const crop = { x: 0, y: 0, width: 100, height: 100 };
    expect(resizeCropFromCorner(crop, 'se', { x: 300, y: 50 }, null, bounds)).toEqual({ x: 0, y: 0, width: 300, height: 50 });
  });
});

describe('scaleCropAroundCenter', () => {
  it('scales around the center and stays inside', () => {
    const crop = { x: 400, y: 200, width: 100, height: 50 };
    const result = scaleCropAroundCenter(crop, 1.02, { width: 1000, height: 500 });
    expect(result.width).toBeCloseTo(102);
    expect(result.x + result.width / 2).toBeCloseTo(450);
    expect(result.y + result.height / 2).toBeCloseTo(225);
  });
});

describe('resolveOutputGeometry', () => {
  it('matches the acceptance case: 4000×2000 → 1080×1080 centered', () => {
    const geometry = resolveOutputGeometry({ width: 4000, height: 2000 }, null, cover(1080, 1080));
    expect(geometry.sourceRect).toEqual({ x: 1000, y: 0, width: 2000, height: 2000 });
    expect([geometry.outWidth, geometry.outHeight]).toEqual([1080, 1080]);
    expect(geometry.upscaleCapped).toBe(false);
  });

  it('derives height from width and crop aspect', () => {
    const geometry = resolveOutputGeometry({ width: 4000, height: 3000 }, null, cover(1600, null));
    expect([geometry.outWidth, geometry.outHeight]).toEqual([1600, 1200]);
  });

  it('keeps the original size when no dimensions are set', () => {
    const geometry = resolveOutputGeometry({ width: 640, height: 480 }, null, cover(null, null));
    expect([geometry.outWidth, geometry.outHeight]).toEqual([640, 480]);
  });

  it('caps at the crop size without upscale', () => {
    const geometry = resolveOutputGeometry({ width: 800, height: 600 }, null, cover(1600, null));
    expect([geometry.outWidth, geometry.outHeight]).toEqual([800, 600]);
    expect(geometry.upscaleCapped).toBe(true);
  });

  it('upscales when allowed', () => {
    const geometry = resolveOutputGeometry({ width: 800, height: 600 }, null, cover(1600, null, true));
    expect([geometry.outWidth, geometry.outHeight]).toEqual([1600, 1200]);
  });

  it('pads in contain mode', () => {
    const geometry = resolveOutputGeometry(
      { width: 4000, height: 2000 },
      null,
      { width: 1000, height: 1000, fit: 'contain', allowUpscale: false },
    );
    expect([geometry.outWidth, geometry.outHeight]).toEqual([1000, 1000]);
    expect(geometry.drawRect).toEqual({ x: 0, y: 250, width: 1000, height: 500 });
  });
});

describe('getViewTransform', () => {
  it('fits and round-trips coordinates', () => {
    const view = getViewTransform({
      container: { width: 800, height: 600 },
      image: { width: 4000, height: 2000 },
      zoom: 'fit',
      devicePixelRatio: 2,
    });
    expect(view.scale).toBeCloseTo(0.2);
    expect(view.deviceScale).toBeCloseTo(0.4);
    expect(view.offsetY).toBeCloseTo(100);
    const point = { x: 1234, y: 567 };
    const back = screenToSource(view, sourceToScreen(view, point));
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
  });

  it('shows 100% zoom as one device pixel per source pixel', () => {
    const view = getViewTransform({
      container: { width: 800, height: 600 },
      image: { width: 4000, height: 2000 },
      zoom: 1,
      devicePixelRatio: 2,
    });
    expect(view.deviceScale).toBe(1);
  });
});

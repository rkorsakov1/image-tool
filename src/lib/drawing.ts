import { transformedSize } from './cropMath';
import type { Transform } from './types';

export type Surface = OffscreenCanvas | HTMLCanvasElement;
export type Context2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export const get2d = (canvas: Surface, options?: CanvasRenderingContext2DSettings): Context2D => {
  const context = canvas.getContext('2d', options) as Context2D | null;
  if (!context) throw new Error('Canvas 2D is not available.');
  return context;
};

/**
 * Draws `image` with rotation and flips applied, scaled by `scale`, into a context whose
 * canvas is the transformed size × scale. Rotation happens first, then flips in the rotated
 * (on-screen) orientation, so "flip horizontal" always mirrors what the user sees.
 */
export const drawTransformed = (
  context: Context2D,
  image: CanvasImageSource & { width: number; height: number },
  transform: Transform,
  scale = 1,
): void => {
  const size = transformedSize({ width: image.width, height: image.height }, transform.rotation);
  context.save();
  context.translate((size.width * scale) / 2, (size.height * scale) / 2);
  context.scale(transform.flipH ? -scale : scale, transform.flipV ? -scale : scale);
  context.rotate((transform.rotation * Math.PI) / 180);
  context.drawImage(image, -image.width / 2, -image.height / 2);
  context.restore();
};

export const isIdentityTransform = (transform: Transform): boolean =>
  transform.rotation === 0 && !transform.flipH && !transform.flipV;

/** True if any pixel's alpha is below 255. */
export const hasTransparency = (data: Uint8ClampedArray): boolean => {
  for (let index = 3; index < data.length; index += 4) {
    if ((data[index] as number) < 255) return true;
  }
  return false;
};

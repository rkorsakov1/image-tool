import { useEffect, useRef } from 'react';
import type { ViewTransform } from '../../lib/cropMath';
import { drawTransformed, get2d } from '../../lib/drawing';
import type { Transform } from '../../lib/types';

type ImageCanvasProps = {
  bitmap: ImageBitmap;
  transform: Transform;
  view: ViewTransform;
  className?: string;
};

/** Draws the (transformed) image at the view's size, sharp on high-DPI screens. */
export const ImageCanvas = ({ bitmap, transform, view, className }: ImageCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = Math.max(1, Math.round(view.displayWidth * (view.deviceScale / view.scale)));
  const height = Math.max(1, Math.round(view.displayHeight * (view.deviceScale / view.scale)));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const context = get2d(canvas);
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, width, height);
    drawTransformed(context, bitmap, transform, view.deviceScale);
  }, [bitmap, transform, width, height, view.deviceScale]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ position: 'absolute', left: view.offsetX, top: view.offsetY, width: view.displayWidth, height: view.displayHeight }}
    />
  );
};

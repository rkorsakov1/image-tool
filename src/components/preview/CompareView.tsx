import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useViewTransform } from '../../hooks/useViewTransform';
import { cn } from '../../lib/cn';
import { clampPan, type Point } from '../../lib/cropMath';
import { get2d } from '../../lib/drawing';
import type { QueueItem } from '../../lib/types';
import type { PreviewReference } from '../../hooks/useDebouncedEncode';
import { Button, focusRing } from '../ui/Button';
import { checkerboardClass } from './Checkerboard';

type Zoom = 'fit' | 1 | 2;
const ZOOMS: { value: Zoom; label: string }[] = [
  { value: 'fit', label: 'Fit' },
  { value: 1, label: '100%' },
  { value: 2, label: '200%' },
];

type CompareViewProps = { item: QueueItem; reference: PreviewReference | null };

type Drag = { pointerId: number; kind: 'split' | 'pan'; startX: number; startY: number; startPan: Point };

/** Before/after split: left = source crop resampled to the output size, right = the encoded file. */
export const CompareView = ({ item, reference }: CompareViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState<Zoom>('fit');
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [split, setSplit] = useState(50);
  const drag = useRef<Drag | null>(null);
  const output = item.output;
  const image = { width: output?.width ?? 1, height: output?.height ?? 1 };
  const { view, container } = useViewTransform(containerRef, { image, zoom, pan, padding: 16 });
  const hasView = view !== null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !reference) return;
    canvas.width = reference.bitmap.width;
    canvas.height = reference.bitmap.height;
    get2d(canvas).drawImage(reference.bitmap, 0, 0);
  }, [reference, hasView]);

  useEffect(() => setPan({ x: 0, y: 0 }), [zoom]);

  if (!output) {
    return <p className="p-6 text-sm text-slate-500 dark:text-slate-400">The comparison appears once the first preview is encoded.</p>;
  }

  const splitFromPointer = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !view) return;
    const x = clientX - rect.left - view.offsetX;
    setSplit(Math.round(Math.min(100, Math.max(0, (x / view.displayWidth) * 100))));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>, kind: Drag['kind']) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, kind, startX: event.clientX, startY: event.clientY, startPan: pan };
    if (kind === 'split') splitFromPointer(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || !view) return;
    event.stopPropagation();
    if (current.kind === 'split') {
      splitFromPointer(event.clientX);
      return;
    }
    const next = { x: current.startPan.x + event.clientX - current.startX, y: current.startPan.y + event.clientY - current.startY };
    setPan(clampPan(next, container, { width: view.displayWidth, height: view.displayHeight }));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    drag.current = null;
  };

  const handleSliderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1;
    const keys: Record<string, number> = {
      ArrowLeft: split - step,
      ArrowDown: split - step,
      ArrowRight: split + step,
      ArrowUp: split + step,
      Home: 0,
      End: 100,
      PageDown: split - 10,
      PageUp: split + 10,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setSplit(Math.min(100, Math.max(0, next)));
  };

  const zoomed = zoom !== 'fit';
  const layerStyle = view
    ? { left: view.offsetX, top: view.offsetY, width: view.displayWidth, height: view.displayHeight }
    : undefined;

  return (
    <div className="flex h-full min-h-72 flex-col">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2" role="toolbar" aria-label="Compare zoom">
        {ZOOMS.map((option) => (
          <Button key={option.label} size="sm" pressed={zoom === option.value} onClick={() => setZoom(option.value)}>
            {option.label}
          </Button>
        ))}
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
          Left: source resampled · Right: encoded file{zoomed ? ' · drag to pan' : ''}
        </span>
      </div>

      <div
        ref={containerRef}
        onPointerDown={(event) => handlePointerDown(event, zoomed ? 'pan' : 'split')}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={cn('relative flex-1 touch-none overflow-hidden select-none', {
          'cursor-grab active:cursor-grabbing': zoomed,
          'cursor-col-resize': !zoomed,
        })}
      >
        {view ? (
          <>
            <div aria-hidden="true" className={cn('absolute', checkerboardClass)} style={layerStyle} />
            <img
              src={output.url}
              alt="Encoded output"
              draggable={false}
              className={cn('absolute max-w-none', { '[image-rendering:pixelated]': zoom === 2 })}
              style={layerStyle}
            />
            <canvas
              ref={canvasRef}
              aria-label="Source crop, resampled to the output size"
              className={cn('absolute', { '[image-rendering:pixelated]': zoom === 2, invisible: !reference })}
              style={{ ...layerStyle, clipPath: `inset(0 ${100 - split}% 0 0)` }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.3)]"
              style={{ left: view.offsetX + (view.displayWidth * split) / 100, top: view.offsetY, height: view.displayHeight }}
            />
            <div
              role="slider"
              tabIndex={0}
              aria-label="Before/after split position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={split}
              aria-valuetext={`${split}% source, ${100 - split}% encoded`}
              onPointerDown={(event) => handlePointerDown(event, 'split')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={handleSliderKeyDown}
              className={cn(
                'absolute flex size-8 -translate-x-1/2 -translate-y-1/2 cursor-col-resize items-center justify-center rounded-full border border-slate-300 bg-white text-xs text-slate-700 shadow-md',
                focusRing,
              )}
              style={{ left: view.offsetX + (view.displayWidth * split) / 100, top: Math.min(container.height - 24, Math.max(24, view.offsetY + view.displayHeight / 2)) }}
            >
              ⇆
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

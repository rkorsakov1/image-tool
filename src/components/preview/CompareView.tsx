import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useViewTransform } from '../../hooks/useViewTransform';
import { cn } from '../../lib/cn';
import { clampPan, type Point } from '../../lib/cropMath';
import { get2d } from '../../lib/drawing';
import type { QueueItem } from '../../lib/types';
import type { PreviewReference } from '../../hooks/useDebouncedEncode';
import { FORMAT_LABELS, formatBytes } from '../../lib/format';
import { getItemPreset } from '../../state/appReducer';
import { useApp } from '../../state/AppContext';
import { HintChip, Stage, Toolbar } from '../layout/Stage';
import { focusRing, Segmented } from '../ui/Button';
import { Icon } from '../ui/Icon';
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
  const { state } = useApp();
  const preset = getItemPreset(state, item);
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
    return (
      <>
        <Toolbar label="Compare zoom">
          <span className="text-xs text-ink-3">Left: source resampled · Right: encoded file</span>
        </Toolbar>
        <Stage>
          <HintChip>The comparison appears once the first preview is encoded.</HintChip>
        </Stage>
      </>
    );
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

  const encodedLabel = `Encoded · ${FORMAT_LABELS[preset.format]}${preset.format === 'png' ? '' : ` q${output.quality}`} · ${formatBytes(output.blob.size)}`;
  const handleX = view ? view.offsetX + (view.displayWidth * split) / 100 : 0;

  return (
    <>
      <Toolbar label="Compare zoom">
        <Segmented<Zoom> label="Zoom" value={zoom} options={ZOOMS} onChange={setZoom} />
        <span className="ml-2 text-xs text-ink-3">{zoomed ? 'Drag to pan' : 'Drag to compare'}</span>
        <span className="min-w-4 flex-1" />
        <span className="text-xs text-ink-3 max-lg:hidden">Left: source resampled · Right: encoded file</span>
      </Toolbar>
      <Stage>
        <div
          ref={containerRef}
          onPointerDown={(event) => handlePointerDown(event, zoomed ? 'pan' : 'split')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={cn('absolute inset-0 touch-none overflow-hidden select-none', {
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
                className="pointer-events-none absolute w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.25)]"
                style={{ left: handleX, top: Math.max(0, view.offsetY), height: Math.min(container.height, view.displayHeight) }}
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
                  'absolute flex size-9 -translate-x-1/2 -translate-y-1/2 cursor-col-resize items-center justify-center rounded-full bg-white text-[#191918] shadow-float',
                  'before:absolute before:-inset-1', // 44px touch target
                  focusRing,
                )}
                style={{ left: handleX, top: Math.min(container.height - 24, Math.max(24, view.offsetY + view.displayHeight / 2)) }}
              >
                <Icon name="split" className="size-4" strokeWidth={1.8} />
              </div>
              <span className="pointer-events-none absolute top-3 left-3 rounded-md bg-[rgb(24_24_22/.8)] px-2 py-1 text-[11px] font-semibold text-white">
                Source · resampled
              </span>
              <span className="pointer-events-none absolute top-3 right-3 rounded-md bg-[rgb(24_24_22/.8)] px-2 py-1 font-mono text-[11px] font-semibold text-white">
                {encodedLabel}
              </span>
            </>
          ) : null}
        </div>
      </Stage>
    </>
  );
};

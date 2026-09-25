import { useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { cn } from '../../lib/cn';
import {
  moveCrop,
  resizeCropFromCorner,
  scaleCropAroundCenter,
  screenToSource,
  type Corner,
  type Point,
  type Size,
  type ViewTransform,
} from '../../lib/cropMath';
import type { CropRect } from '../../lib/types';
import { focusRing } from '../ui/Button';

type Drag = { pointerId: number; kind: 'move' | Corner; start: Point; startCrop: CropRect };

type CropBoxProps = {
  crop: CropRect;
  bounds: Size;
  aspect: number | null;
  view: ViewTransform;
  containerRef: RefObject<HTMLElement | null>;
  showThirds: boolean;
  onChange: (crop: CropRect) => void;
  onReset: () => void;
};

const CORNERS: { corner: Corner; label: string; className: string }[] = [
  { corner: 'nw', label: 'top-left', className: '-left-2 -top-2 cursor-nwse-resize' },
  { corner: 'ne', label: 'top-right', className: '-right-2 -top-2 cursor-nesw-resize' },
  { corner: 'sw', label: 'bottom-left', className: '-bottom-2 -left-2 cursor-nesw-resize' },
  { corner: 'se', label: 'bottom-right', className: '-bottom-2 -right-2 cursor-nwse-resize' },
];

const ARROWS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

const cornerPoint = (crop: CropRect, corner: Corner): Point => ({
  x: corner === 'nw' || corner === 'sw' ? crop.x : crop.x + crop.width,
  y: corner === 'nw' || corner === 'ne' ? crop.y : crop.y + crop.height,
});

export const ThirdsOverlay = () => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0">
    <div className="absolute inset-y-0 left-1/3 w-px bg-white/60" />
    <div className="absolute inset-y-0 left-2/3 w-px bg-white/60" />
    <div className="absolute inset-x-0 top-1/3 h-px bg-white/60" />
    <div className="absolute inset-x-0 top-2/3 h-px bg-white/60" />
  </div>
);

/** Movable, resizable crop rectangle. All geometry is in source pixels; `view` maps it to the screen. */
export const CropBox = ({ crop, bounds, aspect, view, containerRef, showThirds, onChange, onReset }: CropBoxProps) => {
  const drag = useRef<Drag | null>(null);

  const toSource = (event: PointerEvent): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    return screenToSource(view, { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>, kind: Drag['kind']) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    drag.current = { pointerId: event.pointerId, kind, start: toSource(event), startCrop: crop };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation();
    const point = toSource(event);
    if (current.kind === 'move') {
      onChange(moveCrop(current.startCrop, point.x - current.start.x, point.y - current.start.y, bounds));
      return;
    }
    onChange(resizeCropFromCorner(current.startCrop, current.kind, point, aspect, bounds));
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    event.stopPropagation();
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleBoxKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const arrow = ARROWS[event.key];
    if (arrow) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      onChange(moveCrop(crop, arrow.x * step, arrow.y * step, bounds));
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      onChange(scaleCropAroundCenter(crop, 1.02, bounds));
      return;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      onChange(scaleCropAroundCenter(crop, 1 / 1.02, bounds));
    }
  };

  const handleCornerKeyDown = (event: KeyboardEvent<HTMLDivElement>, corner: Corner) => {
    const arrow = ARROWS[event.key];
    if (!arrow) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    const point = cornerPoint(crop, corner);
    onChange(resizeCropFromCorner(crop, corner, { x: point.x + arrow.x * step, y: point.y + arrow.y * step }, aspect, bounds));
  };

  const left = view.offsetX + crop.x * view.scale;
  const top = view.offsetY + crop.y * view.scale;
  const width = crop.width * view.scale;
  const height = crop.height * view.scale;

  return (
    <div
      role="group"
      aria-roledescription="crop area"
      aria-label={`Crop ${Math.round(crop.width)} by ${Math.round(crop.height)} pixels at ${Math.round(crop.x)}, ${Math.round(crop.y)}. Arrow keys move, Shift for 10 pixels, plus and minus resize, R resets.`}
      tabIndex={0}
      onPointerDown={(event) => handlePointerDown(event, 'move')}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={onReset}
      onKeyDown={handleBoxKeyDown}
      className={cn(
        'absolute cursor-move touch-none border border-white shadow-[0_0_0_9999px_rgb(2_6_23/0.55)] outline-offset-4',
        focusRing,
      )}
      style={{ left, top, width, height }}
    >
      {showThirds ? <ThirdsOverlay /> : null}
      {CORNERS.map(({ corner, label, className }) => (
        <div
          key={corner}
          role="button"
          aria-roledescription="resize handle"
          aria-label={`Resize crop from the ${label} corner. Arrow keys move this corner.`}
          tabIndex={0}
          onPointerDown={(event) => handlePointerDown(event, corner)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={(event) => handleCornerKeyDown(event, corner)}
          className={cn('absolute size-4 touch-none rounded-sm border-2 border-sky-500 bg-white shadow', focusRing, className)}
        />
      ))}
    </div>
  );
};

import { useEffect, useMemo, useState } from 'react';
import type { Point } from '../../lib/cropMath';
import type { Rect } from '../../lib/inpaint';
import type { QueueItem } from '../../lib/types';
import { useApp } from '../../state/AppContext';
import type { FillMethod } from '../../worker/protocol';
import { HintChip, Stage, Toolbar, ToolbarDivider } from '../layout/Stage';
import { Button, Segmented } from '../ui/Button';
import { ColorInput } from '../ui/Field';
import { Icon, Spinner } from '../ui/Icon';
import { BrushToolbar } from './BrushToolbar';
import { createMaskCanvas, defaultBrushSize, MaskEditor, readMask, type BrushSettings } from './MaskEditor';

type RGB = [number, number, number];

const toHex = ([r, g, b]: RGB): string => `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;

const fromHex = (hex: string): RGB => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const sampleColor = (bitmap: ImageBitmap, point: Point): RGB | null => {
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(bitmap, x, y, 1, 1, 0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
};

/** Paints the original pixels back where the mask is set. */
const restoreOriginal = async (current: ImageBitmap, original: ImageBitmap, mask: HTMLCanvasElement): Promise<ImageBitmap> => {
  const patch = document.createElement('canvas');
  patch.width = current.width;
  patch.height = current.height;
  const patchContext = patch.getContext('2d');
  const canvas = document.createElement('canvas');
  canvas.width = current.width;
  canvas.height = current.height;
  const context = canvas.getContext('2d');
  if (!patchContext || !context) throw new Error('Canvas 2D is not available.');
  patchContext.drawImage(original, 0, 0);
  patchContext.globalCompositeOperation = 'destination-in';
  patchContext.drawImage(mask, 0, 0);
  context.drawImage(current, 0, 0);
  // Clear under the patch first, so restoring over transparency (a removed background) works too.
  context.globalCompositeOperation = 'destination-out';
  context.drawImage(mask, 0, 0);
  context.globalCompositeOperation = 'source-over';
  context.drawImage(patch, 0, 0);
  return createImageBitmap(canvas);
};

const METHOD_OPTIONS: { value: FillMethod; label: string; title: string }[] = [
  { value: 'smooth', label: 'Smooth', title: 'Recreates gradients and soft shadows from the surroundings' },
  { value: 'flat', label: 'Flat', title: 'Fills with one color' },
];

/** Retouch mode: every stroke is filled from its surroundings as soon as it ends. Each stroke is one undo step. */
export const RetouchPanel = ({ item }: { item: QueueItem }) => {
  const { processor, notify, dispatch, setEdit } = useApp();
  const bitmap = item.editedBitmap ?? item.sourceBitmap;
  const mask = useMemo(() => createMaskCanvas(bitmap.width, bitmap.height), [bitmap.width, bitmap.height]);
  const [version, setVersion] = useState(0);
  const [brush, setBrush] = useState<BrushSettings>(() => ({ size: defaultBrushSize(bitmap), erase: false, soft: false }));
  const [method, setMethod] = useState<FillMethod>('smooth');
  const [flatColor, setFlatColor] = useState<RGB | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const canRestore = item.editedBitmap !== null;
  const effectiveBrush = canRestore ? brush : { ...brush, erase: false };

  // A new image (after a fill, undo or redo) starts with an empty mask; the finished stroke vanishes with it.
  useEffect(() => {
    mask.getContext('2d')?.clearRect(0, 0, mask.width, mask.height);
    setVersion((value) => value + 1);
  }, [bitmap, mask]);

  const handlePick = (point: Point) => {
    const color = sampleColor(bitmap, point);
    setPicking(false);
    if (!color) return;
    setFlatColor(color);
    dispatch({ type: 'announce', message: `Fill color set to ${toHex(color)}.` });
  };

  const clearMask = () => {
    mask.getContext('2d')?.clearRect(0, 0, mask.width, mask.height);
    setVersion((value) => value + 1);
  };

  const handleStrokeEnd = async (_rect: Rect) => {
    setBusy(true);
    try {
      if (effectiveBrush.erase) {
        setEdit(item.id, await restoreOriginal(bitmap, item.sourceBitmap, mask));
        dispatch({ type: 'announce', message: 'Original restored under the stroke.' });
        return;
      }
      const values = readMask(mask);
      const result = await processor.fill({ bitmap, mask: values, method, color: method === 'flat' ? flatColor : null });
      setEdit(item.id, result.bitmap);
      if (result.color && method === 'flat' && !flatColor) setFlatColor(result.color);
      dispatch({ type: 'announce', message: 'Stroke filled.' });
    } catch (error) {
      clearMask();
      notify('error', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Toolbar label="Retouch tools">
        <BrushToolbar brush={effectiveBrush} onChange={setBrush} paintLabel="Paint" eraseLabel="Restore" eraseDisabled={!canRestore} />
        <ToolbarDivider />
        <Segmented<FillMethod> label="Fill method" value={method} options={METHOD_OPTIONS} onChange={setMethod} />
        {method === 'flat' ? (
          <>
            <ColorInput
              label="Flat fill color"
              className="ml-1.5"
              value={flatColor ? toHex(flatColor) : '#808080'}
              onChange={(value) => setFlatColor(fromHex(value))}
            />
            <Button variant="ghost" size="icon" pressed={picking} onClick={() => setPicking((value) => !value)} aria-label="Pick fill color from the image" title="Eyedropper">
              <Icon name="eyedropper" />
            </Button>
            <Button variant="ghost" size="sm" pressed={!flatColor} onClick={() => setFlatColor(null)} title="Median color of a 4 px ring around each stroke">
              Auto
            </Button>
          </>
        ) : null}
        <span className="min-w-4 flex-1" />
        <Button variant="ghost" size="sm" disabled={!item.editedBitmap} onClick={() => setEdit(item.id, null)} title="Go back to the original image (undoable)">
          Revert all
        </Button>
      </Toolbar>
      <Stage>
        <MaskEditor
          bitmap={bitmap}
          transform={item.transform}
          mask={mask}
          variant="mask"
          brush={effectiveBrush}
          onBrushChange={setBrush}
          version={version}
          onStrokeEnd={(rect) => void handleStrokeEnd(rect)}
          disabled={busy}
          onPick={picking ? handlePick : undefined}
          label="Retouch brush"
        />
        {busy ? (
          <HintChip tone="busy">
            <span className="flex items-center gap-2">
              <Spinner /> {effectiveBrush.erase ? 'Restoring…' : 'Filling…'}
            </span>
          </HintChip>
        ) : (
          <HintChip>
            {picking
              ? 'Click the image to pick the fill color.'
              : effectiveBrush.erase
                ? 'Brush over an area to bring back the original pixels.'
                : 'Paint over an object to remove it. Works best on plain or smoothly shaded backgrounds, not on textures like grass or text.'}
          </HintChip>
        )}
      </Stage>
    </>
  );
};

import { useMemo, useState } from 'react';
import { useMaskHistory } from '../../hooks/useMaskHistory';
import type { Point } from '../../lib/cropMath';
import type { QueueItem } from '../../lib/types';
import { useApp } from '../../state/AppContext';
import type { FillMethod } from '../../worker/protocol';
import { Button } from '../ui/Button';
import { Select } from '../ui/Field';
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

const METHOD_OPTIONS: { value: FillMethod; label: string }[] = [
  { value: 'smooth', label: 'Smooth fill (gradients, soft shadows)' },
  { value: 'flat', label: 'Flat fill (one color)' },
];

/** Retouch mode: paint over an object, then fill it from the surrounding background. */
export const RetouchPanel = ({ item }: { item: QueueItem }) => {
  const { processor, notify, dispatch, replaceEditedBitmap } = useApp();
  const bitmap = item.editedBitmap ?? item.sourceBitmap;
  const mask = useMemo(() => createMaskCanvas(bitmap.width, bitmap.height), [bitmap]);
  const history = useMaskHistory(mask);
  const [brush, setBrush] = useState<BrushSettings>(() => ({ size: defaultBrushSize(bitmap), erase: false, soft: false }));
  const [method, setMethod] = useState<FillMethod>('smooth');
  const [flatColor, setFlatColor] = useState<RGB | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const handlePick = (point: Point) => {
    const color = sampleColor(bitmap, point);
    setPicking(false);
    if (!color) return;
    setFlatColor(color);
    dispatch({ type: 'announce', message: `Fill color set to ${toHex(color)}.` });
  };

  const handleClear = () => {
    const context = mask.getContext('2d');
    if (!context) return;
    history.begin();
    context.clearRect(0, 0, mask.width, mask.height);
    history.commit({ x: 0, y: 0, width: mask.width, height: mask.height });
  };

  const handleApply = async () => {
    const values = readMask(mask);
    if (!values.some((value) => value > 0)) {
      notify('info', 'Paint over the object you want to remove first.');
      return;
    }
    setBusy(true);
    try {
      const result = await processor.fill({ bitmap, mask: values, method, color: method === 'flat' ? flatColor : null });
      replaceEditedBitmap(item.id, result.bitmap);
      if (result.color && method === 'flat' && !flatColor) setFlatColor(result.color);
      history.reset();
      dispatch({ type: 'announce', message: 'Fill applied.' });
    } catch (error) {
      notify('error', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <BrushToolbar brush={brush} onChange={setBrush} history={history} paintLabel="Paint" eraseLabel="Erase" />
        <div className="w-64">
          <Select<FillMethod> label="Fill method" value={method} options={METHOD_OPTIONS} onChange={setMethod} />
        </div>
        {method === 'flat' ? (
          <div className="flex items-end gap-1">
            <input
              type="color"
              aria-label="Flat fill color"
              value={flatColor ? toHex(flatColor) : '#808080'}
              onChange={(event) => setFlatColor(fromHex(event.target.value))}
              className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-900"
            />
            <Button size="sm" pressed={picking} onClick={() => setPicking((value) => !value)}>
              Eyedropper
            </Button>
            <Button size="sm" pressed={!flatColor} onClick={() => setFlatColor(null)} title="Median color of a 4 px ring around the mask">
              Auto
            </Button>
          </div>
        ) : null}
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={handleClear}>
            Clear mask
          </Button>
          <Button size="sm" variant="ghost" disabled={!item.editedBitmap} onClick={() => replaceEditedBitmap(item.id, null)}>
            Revert edits
          </Button>
          <Button size="sm" variant="primary" disabled={busy} aria-busy={busy} onClick={handleApply}>
            {busy ? 'Filling…' : 'Apply fill'}
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Paint over the object, then Apply. Works best on plain or smoothly shaded backgrounds (e.g. a logo on a gradient). It can’t recreate
        textures like grass, fabric or text.{method === 'flat' && !flatColor ? ' Flat fill uses the median color just outside the mask.' : ''}
        {picking ? ' Click the image to pick the fill color.' : ''}
      </p>
      <div className="min-h-72 flex-1 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-950">
        <MaskEditor
          bitmap={bitmap}
          transform={item.transform}
          mask={mask}
          variant="mask"
          brush={brush}
          onBrushChange={setBrush}
          history={history}
          onPick={picking ? handlePick : undefined}
          label="Retouch mask"
        />
      </div>
    </div>
  );
};

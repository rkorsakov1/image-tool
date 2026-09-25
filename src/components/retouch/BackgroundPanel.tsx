import { useEffect, useMemo, useState } from 'react';
import { useMaskHistory } from '../../hooks/useMaskHistory';
import { formatBytes } from '../../lib/format';
import type { QueueItem } from '../../lib/types';
import { getItemPreset } from '../../state/appReducer';
import { useApp } from '../../state/AppContext';
import { ORT_RUNTIME, SEGMENTATION_MODEL } from '../../worker/segmentationModel';
import { isModelCached, releaseSegmenter, segmentImage, type SegmentProgress } from '../../worker/segmentClient';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Toggle } from '../ui/Field';
import { BrushToolbar } from './BrushToolbar';
import { createMaskCanvas, defaultBrushSize, MaskEditor, readMask, type BrushSettings } from './MaskEditor';

type Cutout = { base: ImageBitmap; mask: HTMLCanvasElement; provider: 'webgpu' | 'wasm' };

const STAGE_LABEL: Record<SegmentProgress['stage'], string> = {
  runtime: 'Downloading the ONNX runtime',
  model: 'Downloading the model',
  session: 'Starting the model',
  inference: 'Finding the background',
};

const ProgressBar = ({ progress }: { progress: SegmentProgress }) => {
  const determinate = progress.total > 0;
  const percent = determinate ? Math.round((progress.loaded / progress.total) * 100) : 0;
  return (
    <div className="w-full max-w-md space-y-1.5">
      <p className="text-sm">
        {STAGE_LABEL[progress.stage]}
        {determinate ? ` — ${formatBytes(progress.loaded)} of ${formatBytes(progress.total)}` : '…'}
      </p>
      <div
        role="progressbar"
        aria-label={STAGE_LABEL[progress.stage]}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? percent : undefined}
        className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
      >
        {determinate ? (
          <div className="h-full bg-sky-500 transition-[width] motion-reduce:transition-none" style={{ width: `${percent}%` }} />
        ) : (
          <div className="h-full w-1/3 animate-pulse bg-sky-500 motion-reduce:animate-none" />
        )}
      </div>
    </div>
  );
};

/** Background mode: segment with the vendored model, refine with Restore/Erase, then apply. */
export const BackgroundPanel = ({ item }: { item: QueueItem }) => {
  const { state, dispatch, processor, notify, replaceEditedBitmap } = useApp();
  const bitmap = item.editedBitmap ?? item.sourceBitmap;
  const [cutout, setCutout] = useState<Cutout | null>(null);
  const [progress, setProgress] = useState<SegmentProgress | null>(null);
  const [cached, setCached] = useState<boolean | null>(null);
  const [brush, setBrush] = useState<BrushSettings>(() => ({ size: defaultBrushSize(bitmap), erase: false, soft: true }));
  const [replaceColor, setReplaceColor] = useState(false);
  const [color, setColor] = useState('#ffffff');
  const [busy, setBusy] = useState(false);
  const [jpegPrompt, setJpegPrompt] = useState(false);
  const placeholder = useMemo(() => createMaskCanvas(1, 1), []);
  const history = useMaskHistory(cutout?.mask ?? placeholder);
  const preset = getItemPreset(state, item);

  useEffect(() => {
    void isModelCached().then(setCached);
  }, []);

  // Leaving background mode releases the ONNX session and model memory.
  useEffect(() => () => releaseSegmenter(), []);

  // A different image (or new edits) invalidates an unapplied cut-out.
  useEffect(() => setCutout(null), [item.id, bitmap]);

  const handleRemove = async () => {
    setProgress({ stage: 'runtime', loaded: 0, total: 0 });
    try {
      const { alpha, provider } = await segmentImage(bitmap, setProgress);
      setCutout({ base: bitmap, mask: createMaskCanvas(bitmap.width, bitmap.height, alpha), provider });
      setCached(true);
      history.reset();
      dispatch({ type: 'announce', message: `Background found using ${provider === 'webgpu' ? 'WebGPU' : 'the CPU'}. Refine with Restore and Erase, then Apply.` });
    } catch (error) {
      notify('error', `Background removal failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setProgress(null);
    }
  };

  const apply = async (background: string | null) => {
    if (!cutout) return;
    setBusy(true);
    try {
      const result = await processor.compose({ bitmap: cutout.base, alpha: readMask(cutout.mask), background });
      replaceEditedBitmap(item.id, result.bitmap);
      setCutout(null);
      dispatch({ type: 'announce', message: background ? 'Background replaced.' : 'Background removed.' });
    } catch (error) {
      notify('error', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleApply = () => {
    if (!replaceColor && preset.format === 'jpeg') {
      setJpegPrompt(true);
      return;
    }
    void apply(replaceColor ? color : null);
  };

  const switchFormat = (format: 'webp' | 'png') => {
    dispatch({ type: 'setOverrides', id: item.id, patch: { format } });
    setJpegPrompt(false);
    void apply(null);
  };

  if (!cutout) {
    return (
      <div className="flex h-full min-h-72 flex-col items-center justify-center gap-4 rounded-lg bg-slate-100 p-6 text-center dark:bg-slate-950">
        {progress ? (
          <ProgressBar progress={progress} />
        ) : (
          <>
            <p className="max-w-md text-sm text-slate-600 dark:text-slate-300">
              Removes the background with an on-device AI model ({SEGMENTATION_MODEL.label}). The image never leaves your browser.
            </p>
            <Button variant="primary" onClick={handleRemove}>
              Remove background
            </Button>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {cached
                ? 'Model downloaded — works offline.'
                : `First use downloads about ${formatBytes(SEGMENTATION_MODEL.bytes + ORT_RUNTIME.wasmBytes)} once; it’s then cached for offline use.`}
            </p>
            {item.editedBitmap ? (
              <Button size="sm" variant="ghost" onClick={() => replaceEditedBitmap(item.id, null)}>
                Revert edits
              </Button>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <BrushToolbar brush={brush} onChange={setBrush} history={history} paintLabel="Restore" eraseLabel="Erase" />
        <div className="flex items-center gap-2">
          <Toggle label="Replace background with color" checked={replaceColor} onChange={setReplaceColor} />
          <input
            type="color"
            aria-label="Background color"
            value={color}
            disabled={!replaceColor}
            onChange={(event) => setColor(event.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white p-0.5 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900"
          />
        </div>
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setCutout(null)}>
            Discard
          </Button>
          <Button size="sm" variant="primary" disabled={busy} aria-busy={busy} onClick={handleApply}>
            {busy ? 'Applying…' : 'Apply'}
          </Button>
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Ran on {cutout.provider === 'webgpu' ? 'the GPU (WebGPU)' : 'the CPU (WebAssembly)'}. Restore brings pixels back, Erase removes them.
      </p>
      <div className="min-h-72 flex-1 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-950">
        <MaskEditor
          bitmap={cutout.base}
          transform={item.transform}
          mask={cutout.mask}
          variant="alpha"
          brush={brush}
          onBrushChange={setBrush}
          history={history}
          label="Background cut-out"
        />
      </div>

      <Dialog
        open={jpegPrompt}
        onClose={() => setJpegPrompt(false)}
        title="JPEG can’t keep transparency"
        footer={
          <>
            <Button onClick={() => switchFormat('webp')}>Switch to WebP</Button>
            <Button onClick={() => switchFormat('png')}>Switch to PNG</Button>
            <Button
              variant="primary"
              onClick={() => {
                setJpegPrompt(false);
                setReplaceColor(true);
                void apply(color);
              }}
            >
              Use background color
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Switch to WebP or PNG to keep transparency, or fill the background with a color ({color}) and stay with JPEG?
        </p>
      </Dialog>
    </div>
  );
};

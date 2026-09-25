import { useEffect, useMemo, useRef, useState } from 'react';
import { useViewTransform } from '../../hooks/useViewTransform';
import { transformedSize } from '../../lib/cropMath';
import { formatBytes } from '../../lib/format';
import type { Cutout, QueueItem } from '../../lib/types';
import { getItemPreset } from '../../state/appReducer';
import { useApp } from '../../state/AppContext';
import { ORT_RUNTIME, SEGMENTATION_MODEL } from '../../worker/segmentationModel';
import { isModelCached, releaseSegmenter, segmentImage, type SegmentProgress } from '../../worker/segmentClient';
import { ImageCanvas } from '../crop/ImageCanvas';
import { HintChip, Stage, Toolbar, ToolbarDivider } from '../layout/Stage';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ColorInput, Toggle } from '../ui/Field';
import { Icon, Spinner } from '../ui/Icon';
import { BrushToolbar } from './BrushToolbar';
import { createMaskCanvas, defaultBrushSize, MaskEditor, readMask, type BrushSettings } from './MaskEditor';

const STAGE_LABEL: Record<SegmentProgress['stage'], string> = {
  runtime: 'Downloading the runtime',
  model: 'Downloading the model',
  session: 'Starting the model',
  inference: 'Finding the subject',
};
const STAGE_STEP: Record<SegmentProgress['stage'], number> = { runtime: 1, model: 1, session: 2, inference: 3 };

/** The current image, fitted to the stage, with an optional scan line while the model runs. */
const ImageStage = ({ item, scanning }: { item: QueueItem; scanning: boolean }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bitmap = item.editedBitmap ?? item.sourceBitmap;
  const image = useMemo(() => transformedSize(bitmap, item.transform.rotation), [bitmap, item.transform.rotation]);
  const { view } = useViewTransform(containerRef, { image });
  return (
    <div ref={containerRef} className="absolute inset-0">
      {view ? (
        <>
          <ImageCanvas bitmap={bitmap} transform={item.transform} view={view} />
          {scanning ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute overflow-hidden"
              style={{ left: view.offsetX, top: view.offsetY, width: view.displayWidth, height: view.displayHeight }}
            >
              <div className="absolute inset-x-0 h-0.5 bg-accent shadow-[0_0_12px_2px_var(--color-accent)] [animation:lc-scan_1.6s_var(--ease-std)_infinite_alternate]" />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

const FloatingCard = ({ children }: { children: React.ReactNode }) => (
  <div className="absolute inset-x-3 bottom-3 z-10 mx-auto max-w-[27rem] rounded-lg bg-raised p-4 shadow-float [animation:lc-rise_.24s_var(--ease-out)]">{children}</div>
);

const ProgressCard = ({ progress }: { progress: SegmentProgress }) => {
  const determinate = progress.total > 0;
  const percent = determinate ? Math.round((progress.loaded / progress.total) * 100) : 0;
  return (
    <FloatingCard>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-semibold">{STAGE_LABEL[progress.stage]}</p>
        {determinate ? (
          <p className="font-mono text-[11px] text-ink-3">
            {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
          </p>
        ) : null}
      </div>
      <div
        role="progressbar"
        aria-label={STAGE_LABEL[progress.stage]}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? percent : undefined}
        className="mt-2.5 h-1 overflow-hidden rounded-full bg-sunken"
      >
        {determinate ? (
          <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${percent}%` }} />
        ) : (
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        )}
      </div>
      <p className="mt-2 text-xs text-ink-3">Step {STAGE_STEP[progress.stage]} of 3 · download, start, then find the subject</p>
    </FloatingCard>
  );
};

/** Background mode: segment with the on-device model; the cut-out is applied at once, and each Restore/Erase stroke updates it. */
export const BackgroundPanel = ({ item }: { item: QueueItem }) => {
  const { state, dispatch, processor, notify, setEdit } = useApp();
  const bitmap = item.editedBitmap ?? item.sourceBitmap;
  const cutout = item.cutout;
  const [progress, setProgress] = useState<SegmentProgress | null>(null);
  const [cached, setCached] = useState<boolean | null>(null);
  const [brush, setBrush] = useState<BrushSettings>(() => ({ size: defaultBrushSize(bitmap), erase: false, soft: true }));
  const [busy, setBusy] = useState(false);
  const [jpegPrompt, setJpegPrompt] = useState(false);
  const [lastColor, setLastColor] = useState('#ffffff');
  const [version, setVersion] = useState(0);
  const preset = getItemPreset(state, item);

  // Working mask canvas, kept in sync with the cut-out's (immutable) mask bitmap. Undo swaps the bitmap.
  const maskWidth = cutout?.mask.width ?? 0;
  const maskHeight = cutout?.mask.height ?? 0;
  const mask = useMemo(() => (maskWidth > 0 ? createMaskCanvas(maskWidth, maskHeight) : null), [maskWidth, maskHeight]);
  /** Which mask bitmap the canvas currently holds (strokes update both at once). */
  const synced = useRef<{ canvas: HTMLCanvasElement; bitmap: ImageBitmap } | null>(null);
  useEffect(() => {
    if (!cutout || !mask) return;
    if (synced.current?.canvas === mask && synced.current.bitmap === cutout.mask) return;
    const context = mask.getContext('2d');
    context?.clearRect(0, 0, mask.width, mask.height);
    context?.drawImage(cutout.mask, 0, 0);
    synced.current = { canvas: mask, bitmap: cutout.mask };
    setVersion((value) => value + 1);
  }, [cutout, mask]);

  useEffect(() => {
    void isModelCached().then(setCached);
  }, []);

  // Leaving background mode releases the ONNX session and model memory.
  useEffect(() => () => releaseSegmenter(), []);

  /** Composes `base` with the mask and stores it as one undoable step. */
  const commit = async (next: Omit<Cutout, 'mask'>, maskCanvas: HTMLCanvasElement, mergeKey?: string) => {
    const [maskBitmap, composed] = await Promise.all([
      createImageBitmap(maskCanvas),
      processor.compose({ bitmap: next.base, alpha: readMask(maskCanvas), background: next.background }),
    ]);
    synced.current = { canvas: maskCanvas, bitmap: maskBitmap };
    setEdit(item.id, composed.bitmap, { ...next, mask: maskBitmap }, mergeKey);
  };

  const handleRemove = async () => {
    setProgress({ stage: 'runtime', loaded: 0, total: 0 });
    try {
      const { alpha, provider } = await segmentImage(bitmap, setProgress);
      setCached(true);
      await commit({ base: bitmap, background: null, provider }, createMaskCanvas(bitmap.width, bitmap.height, alpha));
      dispatch({ type: 'announce', message: `Background removed using ${provider === 'webgpu' ? 'WebGPU' : 'the CPU'}. Refine with Restore and Erase.` });
      if (preset.format === 'jpeg') setJpegPrompt(true);
    } catch (error) {
      notify('error', `Background removal failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setProgress(null);
    }
  };

  const handleStrokeEnd = async () => {
    if (!cutout || !mask) return;
    setBusy(true);
    try {
      await commit(cutout, mask);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const setBackground = (background: string | null) => {
    if (!cutout || !mask) return;
    if (background) setLastColor(background);
    // Dragging through the color picker merges into one undo step.
    void commit({ ...cutout, background }, mask, 'background').catch((error: unknown) =>
      notify('error', error instanceof Error ? error.message : String(error)),
    );
  };

  const discard = () => {
    if (!cutout) return;
    setEdit(item.id, cutout.base === item.sourceBitmap ? null : cutout.base, null);
    dispatch({ type: 'announce', message: 'Background restored.' });
  };

  const switchFormat = (format: 'webp' | 'png') => {
    dispatch({ type: 'setOverrides', id: item.id, patch: { format } });
    setJpegPrompt(false);
  };

  return (
    <>
      {cutout && mask ? (
        <Toolbar label="Background tools">
          <BrushToolbar brush={brush} onChange={setBrush} paintLabel="Restore" eraseLabel="Erase" />
          <ToolbarDivider />
          <Toggle label="Replace background" checked={cutout.background !== null} onChange={(on) => setBackground(on ? lastColor : null)} />
          <ColorInput label="Background color" className="ml-1.5" value={cutout.background ?? lastColor} disabled={cutout.background === null} onChange={setBackground} />
          <span className="min-w-4 flex-1" />
          <Button variant="ghost" size="sm" onClick={discard} title="Put the original background back (undoable)">
            Discard cut-out
          </Button>
        </Toolbar>
      ) : (
        <Toolbar label="Background">
          <span className="text-xs text-ink-2">Cut out the subject with an on-device model. The brushes appear after it runs.</span>
          <span className="min-w-4 flex-1" />
          <span className="font-mono text-[11px] text-ink-3 max-lg:hidden">{SEGMENTATION_MODEL.label}</span>
        </Toolbar>
      )}

      <Stage>
        {cutout && mask ? (
          <>
            <MaskEditor
              bitmap={cutout.base}
              transform={item.transform}
              mask={mask}
              variant="alpha"
              backdrop={cutout.background}
              brush={brush}
              onBrushChange={setBrush}
              version={version}
              onStrokeEnd={() => void handleStrokeEnd()}
              disabled={busy}
              label="Background cut-out"
            />
            <HintChip tone={busy ? 'busy' : 'neutral'}>
              {busy ? (
                <span className="flex items-center gap-2">
                  <Spinner /> Updating the cut-out…
                </span>
              ) : (
                <>
                  <span aria-hidden="true" className="mr-1.5 inline-block size-1.5 rounded-full bg-success-bar align-middle" />
                  Ran on {cutout.provider === 'webgpu' ? 'the GPU (WebGPU)' : 'the CPU (WebAssembly)'} · Restore brings pixels back, Erase removes them
                </>
              )}
            </HintChip>
          </>
        ) : (
          <>
            <ImageStage item={item} scanning={progress?.stage === 'inference'} />
            {progress ? (
              <ProgressCard progress={progress} />
            ) : (
              <FloatingCard>
                <div className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold">Remove background</p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      Runs on this device.{' '}
                      {cached
                        ? 'The model is downloaded and works offline.'
                        : `The first run downloads ${formatBytes(SEGMENTATION_MODEL.bytes + ORT_RUNTIME.wasmBytes)} once; after that it works offline.`}
                    </p>
                  </div>
                  <Button variant="primary" onClick={() => void handleRemove()}>
                    <Icon name="spark" /> Remove
                  </Button>
                </div>
              </FloatingCard>
            )}
          </>
        )}
      </Stage>

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
                setBackground(lastColor);
              }}
            >
              Use a background color
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-2">
          The output format is JPEG, so transparent areas would be filled with the matte color ({preset.matteColor.toUpperCase()}). Switch to WebP or
          PNG to keep transparency, or pick a background color and stay with JPEG.
        </p>
      </Dialog>
    </>
  );
};

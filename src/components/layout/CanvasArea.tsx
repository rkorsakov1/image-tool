import type { KeyboardEvent } from 'react';
import { computeAutoCrop, resolveOutputGeometry, rotateTransform, targetAspect, transformedSize } from '../../lib/cropMath';
import { cn } from '../../lib/cn';
import type { Preset, QueueItem } from '../../lib/types';
import type { PreviewReference } from '../../hooks/useDebouncedEncode';
import { getItemPreset, type Mode } from '../../state/appReducer';
import { useApp } from '../../state/AppContext';
import { CropEditor } from '../crop/CropEditor';
import { EmptyDropZone } from '../input/DropZone';
import { CompareView } from '../preview/CompareView';
import { BackgroundPanel } from '../retouch/BackgroundPanel';
import { RetouchPanel } from '../retouch/RetouchPanel';
import { Button, focusRing } from '../ui/Button';
import { Icon } from '../ui/Icon';

export const MODES: { mode: Mode; label: string; key: string }[] = [
  { mode: 'crop', label: 'Crop', key: 'C' },
  { mode: 'retouch', label: 'Retouch', key: 'E' },
  { mode: 'background', label: 'Background', key: 'B' },
  { mode: 'compare', label: 'Compare', key: 'V' },
];

const ModeTabs = ({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = MODES.findIndex((entry) => entry.mode === mode);
    const offset = event.key === 'ArrowRight' ? 1 : -1;
    const next = MODES[(index + offset + MODES.length) % MODES.length];
    if (!next) return;
    onChange(next.mode);
    document.getElementById(`tab-${next.mode}`)?.focus();
  };

  return (
    <div role="tablist" aria-label="Editor mode" className="flex gap-1" onKeyDown={handleKeyDown}>
      {MODES.map((entry) => {
        const selected = entry.mode === mode;
        return (
          <button
            key={entry.mode}
            id={`tab-${entry.mode}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls="editor-panel"
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(entry.mode)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium',
              focusRing,
              {
                'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900': selected,
                'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800': !selected,
              },
            )}
          >
            {entry.label} <kbd className="ml-1 hidden text-[10px] opacity-60 sm:inline">{entry.key}</kbd>
          </button>
        );
      })}
    </div>
  );
};

const CropToolbar = ({ item, preset }: { item: QueueItem; preset: Preset }) => {
  const { state, dispatch } = useApp();
  const bitmap = item.editedBitmap ?? item.sourceBitmap;
  const image = transformedSize(bitmap, item.transform.rotation);
  const geometry = resolveOutputGeometry(image, item.crop, preset);
  const crop = item.crop ?? computeAutoCrop(image, targetAspect(preset));
  const contain = preset.fit === 'contain' && preset.width !== null && preset.height !== null;
  const setTransform = (transform: QueueItem['transform']) => dispatch({ type: 'setTransform', id: item.id, transform });

  return (
    <div className="space-y-1.5">
      <div role="toolbar" aria-label="Crop tools" className="flex flex-wrap items-center gap-1">
        <Button size="sm" variant="ghost" aria-label="Rotate 90° left" title="Rotate left" onClick={() => setTransform(rotateTransform(item.transform, 'left'))}>
          <Icon name="rotateLeft" />
        </Button>
        <Button size="sm" variant="ghost" aria-label="Rotate 90° right" title="Rotate right" onClick={() => setTransform(rotateTransform(item.transform, 'right'))}>
          <Icon name="rotateRight" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Flip horizontal"
          title="Flip horizontal"
          aria-pressed={item.transform.flipH}
          onClick={() => setTransform({ ...item.transform, flipH: !item.transform.flipH })}
        >
          <Icon name="flipH" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Flip vertical"
          title="Flip vertical"
          aria-pressed={item.transform.flipV}
          onClick={() => setTransform({ ...item.transform, flipV: !item.transform.flipV })}
        >
          <Icon name="flipV" />
        </Button>
        <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
        <Button
          size="sm"
          variant="ghost"
          aria-label="Rule-of-thirds overlay"
          title="Rule of thirds"
          aria-pressed={state.prefs.showThirds}
          disabled={contain}
          onClick={() => dispatch({ type: 'setPref', patch: { showThirds: !state.prefs.showThirds } })}
        >
          <Icon name="grid" />
        </Button>
        <Button size="sm" variant="ghost" disabled={contain || item.crop === null} onClick={() => dispatch({ type: 'setCrop', id: item.id, crop: null })}>
          <Icon name="reset" /> Reset crop <kbd className="text-[10px] opacity-60">R</kbd>
        </Button>
        <p className="ml-auto text-xs tabular-nums text-slate-600 dark:text-slate-300">
          {contain ? (
            <>Whole image {image.width} × {image.height}</>
          ) : (
            <>
              Crop {Math.round(crop.width)} × {Math.round(crop.height)}
            </>
          )}{' '}
          → <strong>{geometry.outWidth} × {geometry.outHeight}</strong>
        </p>
      </div>
      {geometry.upscaleCapped ? (
        <p className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          The {contain ? 'image' : 'crop'} is smaller than {geometry.requestedWidth} × {geometry.requestedHeight}, so the output is capped at{' '}
          {geometry.outWidth} × {geometry.outHeight} to avoid upscaling. Turn on “Allow upscaling” to enlarge it.
        </p>
      ) : null}
    </div>
  );
};

export const CanvasArea = ({ reference }: { reference: PreviewReference | null }) => {
  const { state, dispatch, selectedItem } = useApp();

  if (!selectedItem) return <EmptyDropZone />;

  const preset = getItemPreset(state, selectedItem);
  const mode = MODES.some((entry) => entry.mode === state.mode) ? state.mode : 'crop';

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ModeTabs mode={mode} onChange={(next) => dispatch({ type: 'setMode', mode: next })} />
        <p className="max-w-full truncate text-xs text-slate-500 dark:text-slate-400" title={selectedItem.sourceName}>
          {selectedItem.sourceName} · {selectedItem.sourceBitmap.width} × {selectedItem.sourceBitmap.height}
        </p>
      </div>
      <div id="editor-panel" role="tabpanel" aria-labelledby={`tab-${mode}`} className="flex min-h-72 flex-1 flex-col gap-2">
        {mode === 'crop' ? (
          <>
            <CropToolbar item={selectedItem} preset={preset} />
            <div className="min-h-72 flex-1 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-950">
              <CropEditor item={selectedItem} preset={preset} />
            </div>
          </>
        ) : null}
        {mode === 'retouch' ? <RetouchPanel key={selectedItem.id} item={selectedItem} /> : null}
        {mode === 'background' ? <BackgroundPanel key={selectedItem.id} item={selectedItem} /> : null}
        {mode === 'compare' ? (
          <div className="min-h-72 flex-1 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-950">
            <CompareView item={selectedItem} reference={reference} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

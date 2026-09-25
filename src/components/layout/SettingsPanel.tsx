import { useState } from 'react';
import { describeProgress, supportsDirectoryExport, useBatchExport } from '../../hooks/useBatchExport';
import { cn } from '../../lib/cn';
import { formatBytes } from '../../lib/format';
import { BUILTIN_PRESETS, findPreset, isBuiltinPreset } from '../../lib/presets';
import type { Preset, QueueItem } from '../../lib/types';
import { getItemPreset } from '../../state/appReducer';
import { useApp } from '../../state/AppContext';
import { canCopyImages, canShareImage, copyImageToClipboard, shareImage } from '../../state/clipboard';
import { clearDownloadedModels } from '../../worker/segmentClient';
import { OutputCard } from '../preview/OutputCard';
import { PresetForm } from '../presets/PresetForm';
import { PresetManagerDialog } from '../presets/PresetManagerDialog';
import { Button, focusRing } from '../ui/Button';
import { inputClass } from '../ui/Field';
import { Icon, Spinner } from '../ui/Icon';

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

type PresetSelectProps = { value: string; presets: readonly Preset[]; onChange: (id: string) => void; onManage: () => void };

const PresetSelect = ({ value, presets, onChange, onManage }: PresetSelectProps) => (
  <div className="flex items-center gap-2">
    <label htmlFor="preset-select" className="sr-only">
      Preset
    </label>
    <div className="relative min-w-0 flex-1">
      <select id="preset-select" value={value} onChange={(event) => onChange(event.target.value)} className={cn(inputClass, 'appearance-none pr-8 font-medium')}>
        <optgroup label="Built-in">
          {BUILTIN_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </optgroup>
        {presets.length > 0 ? (
          <optgroup label="Yours">
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
      <Icon name="chevronDown" className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3" />
    </div>
    <Button variant="ghost" onClick={onManage}>
      Manage
    </Button>
  </div>
);

const ModifiedBar = ({ item, onSaveAsNew }: { item: QueueItem; onSaveAsNew: () => void }) => {
  const { dispatch } = useApp();
  const builtin = isBuiltinPreset(item.presetId);
  return (
    <div className="rounded-[9px] bg-raised p-2.5 ring-1 ring-line-strong">
      <p className="mb-2 flex items-center gap-2 text-[13px] font-medium">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
        Modified for this image
        <span className="truncate text-xs font-normal text-ink-3">· {Object.keys(item.overrides).length} change{Object.keys(item.overrides).length === 1 ? '' : 's'}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          disabled={builtin}
          title={builtin ? 'Built-in presets are read-only. Use “Save as new”.' : undefined}
          onClick={() => {
            dispatch({ type: 'saveOverridesToPreset', id: item.id });
            dispatch({ type: 'announce', message: 'Preset updated.' });
          }}
        >
          Save to preset
        </Button>
        <Button size="sm" onClick={onSaveAsNew}>
          Save as new
        </Button>
        <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'resetOverrides', id: item.id })}>
          Reset
        </Button>
      </div>
    </div>
  );
};

const SaveAsNewForm = ({ item, defaultName, onDone }: { item: QueueItem; defaultName: string; onDone: () => void }) => {
  const { dispatch } = useApp();
  const [name, setName] = useState(defaultName);
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        dispatch({ type: 'saveOverridesAsNewPreset', id: item.id, name, newPresetId: crypto.randomUUID() });
        dispatch({ type: 'announce', message: `Saved preset ${name}.` });
        onDone();
      }}
    >
      <input autoFocus value={name} onChange={(event) => setName(event.target.value)} aria-label="New preset name" className={inputClass} />
      <Button type="submit" variant="primary" disabled={!name.trim()}>
        Save
      </Button>
      <Button variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </form>
  );
};

/** Preset choice, per-image overrides and the "about the output" notes. */
export const SettingsForm = () => {
  const { state, dispatch, selectedItem, notify } = useApp();
  const [managerOpen, setManagerOpen] = useState(false);
  const [savingAsNew, setSavingAsNew] = useState(false);

  const presetId = selectedItem?.presetId ?? state.lastPresetId;
  const basePreset = findPreset(state.presets, presetId);
  const preset = selectedItem ? getItemPreset(state, selectedItem) : basePreset;
  const modified = selectedItem !== null && Object.keys(selectedItem.overrides).length > 0;

  const handleChange = (patch: Partial<Preset>) => {
    if (!selectedItem) {
      notify('info', 'Add an image first. Settings apply to the selected image.');
      return;
    }
    dispatch({ type: 'setOverrides', id: selectedItem.id, patch });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <PresetSelect
          value={presetId}
          presets={state.presets}
          onManage={() => setManagerOpen(true)}
          onChange={(id) => {
            if (selectedItem) dispatch({ type: 'setItemPreset', id: selectedItem.id, presetId: id });
            else dispatch({ type: 'applyPresetToAll', presetId: id });
          }}
        />
        {selectedItem && modified && !savingAsNew ? <ModifiedBar item={selectedItem} onSaveAsNew={() => setSavingAsNew(true)} /> : null}
        {selectedItem && savingAsNew ? (
          <SaveAsNewForm item={selectedItem} defaultName={`${basePreset.name} (custom)`} onDone={() => setSavingAsNew(false)} />
        ) : null}
      </div>

      <PresetForm preset={preset} item={selectedItem} queueLength={state.items.length} onChange={handleChange} />

      <details className="group border-t border-line pt-3 text-xs text-ink-3">
        <summary className={cn('flex cursor-pointer list-none items-center gap-1.5 rounded select-none hover:text-ink', focusRing)}>
          <Icon name="info" className="size-3.5" />
          About the output
          <Icon name="chevron" className="ml-auto size-3.5 transition-transform group-open:rotate-90" />
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          <li>Images are processed entirely in your browser. Nothing is uploaded.</li>
          <li>EXIF, XMP, IPTC and GPS metadata are removed: the output is built from decoded pixels.</li>
          <li>Colors are converted to sRGB. Wide-gamut (Display P3) sources may shift slightly.</li>
          <li>The size shown is the exact size of the file you download.</li>
        </ul>
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 -ml-2.5"
          onClick={async () => {
            const cleared = await clearDownloadedModels();
            notify('info', cleared ? 'Downloaded models cleared.' : 'No downloaded models to clear.');
          }}
        >
          Clear downloaded models
        </Button>
      </details>

      <PresetManagerDialog open={managerOpen} onClose={() => setManagerOpen(false)} />
    </div>
  );
};

/** Copy as PNG, falling back to the share sheet where images can't go on the clipboard (iOS). */
const useCopyOutput = () => {
  const { notify, outputFilename } = useApp();
  return async (item: QueueItem) => {
    const output = item.output;
    if (!output) return;
    const share = () => void shareImage(output.blob, outputFilename(item)).catch(() => undefined);
    if (!canCopyImages()) {
      if (canShareImage(output.blob, outputFilename(item))) share();
      else notify('error', "This browser can't copy images. Use Download instead.");
      return;
    }
    try {
      await copyImageToClipboard(output.blob);
      notify('success', 'Copied to the clipboard as PNG.');
    } catch (error) {
      if (canShareImage(output.blob, outputFilename(item))) {
        notify('info', 'This browser blocked copying the image. Share it instead, then choose Copy.', { label: 'Share', run: share });
        return;
      }
      notify('error', error instanceof Error ? error.message : String(error));
    }
  };
};

const BatchExport = () => {
  const { state } = useApp();
  const { exportZip, exportToFolder, progress } = useBatchExport();
  const count = state.items.length;
  if (count < 2) return null;

  if (progress) {
    const fraction = progress.total > 0 ? progress.done / progress.total : 0;
    return (
      <div aria-live="polite" className="space-y-1.5">
        <p className="flex items-center justify-between text-xs font-medium">
          <span className="flex items-center gap-1.5">
            <Spinner /> {describeProgress(progress)}
          </span>
          <span className="font-mono text-ink-3">
            {progress.done}/{progress.total}
          </span>
        </p>
        <div className="h-1 overflow-hidden rounded-full bg-sunken">
          <div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${fraction * 100}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="flex-1 text-xs text-ink-3">
        All images · <span className="font-mono">{count}</span>
      </span>
      <Button size="sm" onClick={exportZip} title="Each image uses its own preset, crop and edits.">
        Export ZIP
      </Button>
      {supportsDirectoryExport() ? (
        <Button size="sm" variant="ghost" onClick={exportToFolder}>
          Save to folder
        </Button>
      ) : null}
    </div>
  );
};

/** The output card, Download/Copy and batch export. Pinned at the bottom of the settings column. */
export const OutputDock = ({ showActions = true }: { showActions?: boolean }) => {
  const { state, selectedItem, downloadItem } = useApp();
  const copy = useCopyOutput();
  const preset = selectedItem ? getItemPreset(state, selectedItem) : findPreset(state.presets, state.lastPresetId);
  const upToDate = selectedItem !== null && selectedItem.output !== null && selectedItem.outputRevision === selectedItem.revision;

  return (
    <div className="space-y-3">
      <OutputCard item={selectedItem} preset={preset} />
      {showActions ? (
        <div className="flex gap-2">
          <Button variant="primary" size="lg" className="flex-1" disabled={!upToDate} onClick={() => selectedItem && downloadItem(selectedItem)}>
            <Icon name="download" /> Download
            <kbd aria-hidden="true" className="ml-auto rounded-sm bg-on-primary/15 px-1.5 py-0.5 font-mono text-[11px] font-medium">
              {IS_MAC ? '⌘S' : 'Ctrl S'}
            </kbd>
          </Button>
          <Button
            size="icon-lg"
            disabled={!upToDate}
            onClick={() => selectedItem && void copy(selectedItem)}
            aria-label="Copy image"
            title="Copy as PNG (browsers only reliably accept PNG on the clipboard)"
          >
            <Icon name="copy" />
          </Button>
        </div>
      ) : null}
      <BatchExport />
    </div>
  );
};

/** Mobile: size + Settings + Download, stuck to the bottom above the home indicator and keyboard. */
export const MobileDownloadBar = ({ onOpenSettings }: { onOpenSettings: () => void }) => {
  const { selectedItem, downloadItem } = useApp();
  const copy = useCopyOutput();
  if (!selectedItem) return null;
  const output = selectedItem.output;
  const upToDate = output !== null && selectedItem.outputRevision === selectedItem.revision;

  return (
    <div className="sticky bottom-0 z-20 flex items-center gap-2 border-t border-line bg-raised px-4 pt-2.5 pb-[max(.625rem,env(safe-area-inset-bottom))]">
      <div className="min-w-0 flex-1">
        <p className={cn('font-mono text-lg leading-tight font-semibold', { 'text-ink-3': !upToDate })}>{output ? formatBytes(output.blob.size) : '—'}</p>
        <p className="truncate font-mono text-[11px] text-ink-3">
          {output ? `${output.width} × ${output.height}` : 'Encoding…'}
          {!upToDate && output ? ' · updating' : ''}
        </p>
      </div>
      <Button size="icon" onClick={onOpenSettings} aria-label="Settings" title="Settings">
        <Icon name="sliders" />
      </Button>
      <Button size="icon" disabled={!upToDate} onClick={() => void copy(selectedItem)} aria-label="Copy image">
        <Icon name="copy" />
      </Button>
      <Button variant="primary" size="lg" disabled={!upToDate} onClick={() => downloadItem(selectedItem)}>
        <Icon name="download" /> Download
      </Button>
    </div>
  );
};


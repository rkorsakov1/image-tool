import { useState } from 'react';
import { describeProgress, supportsDirectoryExport, useBatchExport } from '../../hooks/useBatchExport';
import { BUILTIN_PRESETS, findPreset, isBuiltinPreset } from '../../lib/presets';
import type { Preset, QueueItem } from '../../lib/types';
import { getItemPreset } from '../../state/appReducer';
import { useApp } from '../../state/AppContext';
import { canCopyImages, copyImageToClipboard } from '../../state/clipboard';
import { clearDownloadedModels } from '../../worker/segmentClient';
import { OutputCard } from '../preview/OutputCard';
import { PresetForm } from '../presets/PresetForm';
import { PresetManagerDialog } from '../presets/PresetManagerDialog';
import { Button } from '../ui/Button';
import { Field, inputClass } from '../ui/Field';
import { Icon } from '../ui/Icon';

type PresetSelectProps = { value: string; presets: readonly Preset[]; onChange: (id: string) => void; onManage: () => void };

export const PresetSelect = ({ value, presets, onChange, onManage }: PresetSelectProps) => (
  <Field label="Preset">
    {(id) => (
      <div className="flex gap-2">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
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
        <Button onClick={onManage}>Manage…</Button>
      </div>
    )}
  </Field>
);

const ModifiedBar = ({ item, onSaveAsNew }: { item: QueueItem; onSaveAsNew: () => void }) => {
  const { dispatch } = useApp();
  const builtin = isBuiltinPreset(item.presetId);
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm dark:border-amber-700 dark:bg-amber-950/40">
      <p className="mb-2 font-medium text-amber-900 dark:text-amber-100">Modified</p>
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          disabled={builtin}
          title={builtin ? 'Built-in presets are read-only. Use “Save as new preset”.' : undefined}
          onClick={() => {
            dispatch({ type: 'saveOverridesToPreset', id: item.id });
            dispatch({ type: 'announce', message: 'Preset updated.' });
          }}
        >
          Save to preset
        </Button>
        <Button size="sm" onClick={onSaveAsNew}>
          Save as new preset
        </Button>
        <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'resetOverrides', id: item.id })}>
          Reset
        </Button>
      </div>
    </div>
  );
};

const BatchExport = () => {
  const { state } = useApp();
  const { exportZip, exportToFolder, progress } = useBatchExport();
  const count = state.items.length;
  if (count < 2) return null;
  return (
    <section aria-labelledby="batch-heading" className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <h3 id="batch-heading" className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        All images ({count})
      </h3>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" className="flex-1" disabled={progress !== null} onClick={exportZip}>
          <Icon name="zip" /> Export all as ZIP
        </Button>
        {supportsDirectoryExport() ? (
          <Button className="flex-1" disabled={progress !== null} onClick={exportToFolder}>
            <Icon name="folder" /> Save to folder…
          </Button>
        ) : null}
      </div>
      <p aria-live="polite" className="text-xs text-slate-500 dark:text-slate-400">
        {progress ? describeProgress(progress) : 'Each image uses its own preset, crop and edits.'}
      </p>
    </section>
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
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="New preset name"
        className={inputClass}
      />
      <Button type="submit" variant="primary" disabled={!name.trim()}>
        Save
      </Button>
      <Button variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </form>
  );
};

export const SettingsPanel = () => {
  const { state, dispatch, selectedItem, downloadItem, notify } = useApp();
  const [managerOpen, setManagerOpen] = useState(false);
  const [savingAsNew, setSavingAsNew] = useState(false);

  const presetId = selectedItem?.presetId ?? state.lastPresetId;
  const basePreset = findPreset(state.presets, presetId);
  const preset = selectedItem ? getItemPreset(state, selectedItem) : basePreset;
  const modified = selectedItem !== null && Object.keys(selectedItem.overrides).length > 0;
  const upToDate = selectedItem !== null && selectedItem.output !== null && selectedItem.outputRevision === selectedItem.revision;

  const handleChange = (patch: Partial<Preset>) => {
    if (!selectedItem) {
      notify('info', 'Add an image first. Settings apply to the selected image.');
      return;
    }
    dispatch({ type: 'setOverrides', id: selectedItem.id, patch });
  };

  const handleCopy = async () => {
    if (!selectedItem?.output) return;
    try {
      await copyImageToClipboard(selectedItem.output.blob);
      dispatch({ type: 'announce', message: 'Copied to the clipboard as PNG.' });
    } catch (error) {
      notify('error', error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-4">
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

      <PresetForm preset={preset} item={selectedItem} queueLength={state.items.length} onChange={handleChange} />

      {selectedItem ? (
        <>
          <OutputCard item={selectedItem} preset={preset} />
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" disabled={!upToDate} onClick={() => downloadItem(selectedItem)}>
              <Icon name="download" /> Download
            </Button>
            <Button
              disabled={!upToDate || !canCopyImages()}
              onClick={handleCopy}
              title="Copies as PNG: browsers only reliably accept PNG images on the clipboard."
            >
              <Icon name="copy" /> Copy
            </Button>
          </div>
          <BatchExport />
        </>
      ) : null}

      <details className="text-xs text-slate-500 dark:text-slate-400">
        <summary className="cursor-pointer rounded select-none focus-visible:outline-2 focus-visible:outline-sky-500">
          <Icon name="info" className="mr-1 inline size-3.5 align-[-2px]" />
          About the output
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
          className="mt-2"
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

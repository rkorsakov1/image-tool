import { useEffect, useRef, useState } from 'react';
import { DEFAULT_FILENAME_TEMPLATE } from '../../lib/filenameTemplate';
import { BUILTIN_PRESETS, uniquePresetName } from '../../lib/presets';
import { createShareHash } from '../../lib/presetShare';
import { createPresetFile, describeMergeSummary, mergePresets, validatePresetFile } from '../../lib/presetValidation';
import { FORMAT_LABELS } from '../../lib/format';
import type { Preset } from '../../lib/types';
import { triggerDownload, useApp } from '../../state/AppContext';
import { cn } from '../../lib/cn';
import { Button, sectionLabelClass } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { inputClass } from '../ui/Field';
import { Icon } from '../ui/Icon';

export const describePreset = (preset: Preset): string => {
  const size = preset.width || preset.height ? `${preset.width ?? 'auto'}×${preset.height ?? 'auto'}` : 'original size';
  const quality = preset.format === 'png' ? '' : ` q${preset.quality}`;
  const target = preset.targetMaxBytes ? ` ≤${Math.round(preset.targetMaxBytes / 1000)} KB` : '';
  return `${size} · ${preset.fit} · ${FORMAT_LABELS[preset.format]}${quality}${target}`;
};

const newPreset = (existing: readonly Preset[]): Preset => ({
  id: crypto.randomUUID(),
  name: uniquePresetName('New preset', existing),
  width: 1600,
  height: null,
  fit: 'cover',
  format: 'webp',
  quality: 80,
  targetMaxBytes: null,
  matteColor: '#ffffff',
  allowUpscale: false,
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  sharpen: 0,
});

type PendingImport = { presets: Preset[]; summary: string };

type RowProps = {
  preset: Preset;
  builtin: boolean;
  selected: boolean;
  first: boolean;
  last: boolean;
  onToggleSelected: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (offset: 1 | -1) => void;
  onShare?: () => void;
};

const PresetRow = ({ preset, builtin, selected, first, last, onToggleSelected, onRename, onDuplicate, onDelete, onMove, onShare }: RowProps) => {
  const [name, setName] = useState(preset.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => setName(preset.name), [preset.name]);

  const commitName = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(preset.name);
      return;
    }
    if (trimmed !== preset.name) onRename(trimmed);
  };

  if (builtin) {
    return (
      <li className="flex min-h-11 items-center gap-3 py-1.5">
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{preset.name}</p>
        <p className="hidden truncate font-mono text-[11px] text-ink-3 sm:block">{describePreset(preset)}</p>
        <Button size="sm" onClick={onDuplicate} aria-label={`Duplicate ${preset.name}`}>
          Duplicate
        </Button>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center gap-2.5 py-2">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelected}
        aria-label={`Select ${preset.name} for export`}
        className="size-4 shrink-0 accent-primary"
      />
      <div className="min-w-0 flex-1">
        <input
          value={name}
          aria-label={`Name of preset ${preset.name}`}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitName();
          }}
          className={cn(inputClass, 'h-7 border-transparent bg-transparent px-1.5 font-medium hover:border-line-strong focus:border-line-strong focus:bg-raised')}
        />
        <p className="mt-0.5 truncate pl-1.5 font-mono text-[11px] text-ink-3">{describePreset(preset)}</p>
      </div>
      {confirmingDelete ? (
        <div role="group" aria-label={`Confirm deleting ${preset.name}`} className="flex items-center gap-1 rounded-md bg-danger-bg py-1 pr-1 pl-2.5 text-xs text-danger">
          <span className="mr-1">Delete “{preset.name}”?</span>
          <Button size="xs" variant="ghost" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </Button>
          <Button size="xs" variant="danger" autoFocus onClick={onDelete}>
            Delete
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          <Button size="icon-sm" variant="ghost" disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${preset.name} up`}>
            <Icon name="up" />
          </Button>
          <Button size="icon-sm" variant="ghost" disabled={last} onClick={() => onMove(1)} aria-label={`Move ${preset.name} down`}>
            <Icon name="down" />
          </Button>
          {onShare ? (
            <Button size="icon-sm" variant="ghost" onClick={onShare} aria-label={`Copy a share link for ${preset.name}`} title="Copy a link that imports this preset">
              <Icon name="link" />
            </Button>
          ) : null}
          <Button size="icon-sm" variant="ghost" onClick={onDuplicate} aria-label={`Duplicate ${preset.name}`} title="Duplicate">
            <Icon name="duplicate" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setConfirmingDelete(true)} aria-label={`Delete ${preset.name}`} title="Delete">
            <Icon name="trash" />
          </Button>
        </div>
      )}
    </li>
  );
};

type PresetManagerDialogProps = { open: boolean; onClose: () => void };

export const PresetManagerDialog = ({ open, onClose }: PresetManagerDialogProps) => {
  const { state, dispatch, notify } = useApp();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const allNames = [...BUILTIN_PRESETS, ...state.presets];

  const handleDuplicate = (preset: Preset) => {
    const copy: Preset = { ...preset, id: crypto.randomUUID(), name: uniquePresetName(`${preset.name} copy`, allNames) };
    dispatch({ type: 'upsertPreset', preset: copy });
    dispatch({ type: 'announce', message: `Created ${copy.name}.` });
  };

  const handleShare = async (preset: Preset) => {
    const url = `${window.location.origin}${window.location.pathname}${createShareHash([preset])}`;
    try {
      await navigator.clipboard.writeText(url);
      notify('info', `Share link for ${preset.name} copied. Opening it offers to import the preset.`);
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  const handleExport = () => {
    const chosen = selected.size > 0 ? state.presets.filter((preset) => selected.has(preset.id)) : state.presets;
    if (chosen.length === 0) {
      notify('info', 'There are no custom presets to export yet. Duplicate a built-in or save one first.');
      return;
    }
    const json = JSON.stringify(createPresetFile(chosen), null, 2);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerDownload(new Blob([json], { type: 'application/json' }), `localcrop-presets-${stamp}.json`);
    dispatch({ type: 'announce', message: `Exported ${chosen.length} preset${chosen.length === 1 ? '' : 's'}.` });
  };

  const handleImportFile = async (file: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      notify('error', `${file.name} isn't valid JSON.`);
      return;
    }
    const validation = validatePresetFile(parsed);
    if (!validation.ok) {
      notify('error', `${file.name}: ${validation.reason}`);
      return;
    }
    const merged = mergePresets(state.presets, validation.presets);
    setPendingImport({ presets: merged.presets, summary: describeMergeSummary(merged.summary, validation.rejected) });
  };

  const handleConfirmImport = () => {
    if (!pendingImport) return;
    dispatch({ type: 'replacePresets', presets: pendingImport.presets });
    dispatch({ type: 'announce', message: `Imported presets: ${pendingImport.summary}.` });
    setPendingImport(null);
  };

  const toggleSelected = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Manage presets"
      footer={
        <>
          <Button onClick={() => fileInput.current?.click()} className="mr-auto">
            Import…
          </Button>
          <Button onClick={handleExport}>{selected.size > 0 ? `Export ${selected.size} selected` : 'Export all'}</Button>
          <Button
            variant="primary"
            onClick={() => {
              const preset = newPreset(allNames);
              dispatch({ type: 'upsertPreset', preset });
            }}
          >
            <Icon name="plus" /> New preset
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label="Import presets file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void handleImportFile(file);
            }}
          />
        </>
      }
    >
      {pendingImport ? (
        <div role="alert" className="mb-4 rounded-md bg-success-bg p-3 text-[13px] text-success">
          <p className="font-medium">Import: {pendingImport.summary}.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="primary" onClick={handleConfirmImport}>
              Merge into my presets
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingImport(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <h3 className={sectionLabelClass}>
        Yours · <span className="font-mono">{state.presets.length}</span>
      </h3>
      {state.presets.length === 0 ? (
        <p className="py-3 text-[13px] text-ink-3">
          None yet. Duplicate a built-in, use “Save as new preset” in the settings panel, or import a file.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {state.presets.map((preset, index) => (
            <PresetRow
              key={preset.id}
              preset={preset}
              builtin={false}
              selected={selected.has(preset.id)}
              first={index === 0}
              last={index === state.presets.length - 1}
              onToggleSelected={() => toggleSelected(preset.id)}
              onRename={(name) => dispatch({ type: 'upsertPreset', preset: { ...preset, name: uniquePresetName(name, allNames.filter((other) => other.id !== preset.id)) } })}
              onDuplicate={() => handleDuplicate(preset)}
              onDelete={() => {
                dispatch({ type: 'deletePreset', id: preset.id });
                setSelected((previous) => {
                  const next = new Set(previous);
                  next.delete(preset.id);
                  return next;
                });
                dispatch({ type: 'announce', message: `Deleted ${preset.name}.` });
              }}
              onMove={(offset) => dispatch({ type: 'movePreset', id: preset.id, offset })}
              onShare={() => void handleShare(preset)}
            />
          ))}
        </ul>
      )}

      <h3 className={cn(sectionLabelClass, 'mt-5')}>Built-in · read-only</h3>
      <ul className="divide-y divide-line">
        {BUILTIN_PRESETS.map((preset) => (
          <PresetRow
            key={preset.id}
            preset={preset}
            builtin
            selected={false}
            first
            last
            onToggleSelected={() => undefined}
            onRename={() => undefined}
            onDuplicate={() => handleDuplicate(preset)}
            onDelete={() => undefined}
            onMove={() => undefined}
          />
        ))}
      </ul>
    </Dialog>
  );
};

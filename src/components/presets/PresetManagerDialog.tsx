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
import { messages, presetLabel, translateError } from '../../i18n';
import { useT } from '../../i18n/useT';

export const describePreset = (preset: Preset): string => {
  const t = messages();
  const size = preset.width || preset.height ? `${preset.width ?? t.form.auto}×${preset.height ?? t.form.auto}` : t.presets.originalSize;
  const quality = preset.format === 'png' ? '' : ` q${preset.quality}`;
  const target = preset.targetMaxBytes ? ` ≤${Math.round(preset.targetMaxBytes / 1000)} KB` : '';
  return `${size} · ${t.presets.fits[preset.fit]} · ${FORMAT_LABELS[preset.format]}${quality}${target}`;
};

const newPreset = (existing: readonly Preset[]): Preset => ({
  id: crypto.randomUUID(),
  name: uniquePresetName(messages().presets.newName, existing),
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
  const t = useT();
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
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{presetLabel(preset)}</p>
        <p className="hidden truncate font-mono text-[11px] text-ink-3 sm:block">{describePreset(preset)}</p>
        <Button size="sm" onClick={onDuplicate} aria-label={t.presets.duplicateNamed(presetLabel(preset))}>
          {t.presets.duplicate}
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
        aria-label={t.presets.select(preset.name)}
        className="size-4 shrink-0 accent-primary"
      />
      <div className="min-w-0 flex-1">
        <input
          value={name}
          aria-label={t.presets.nameOf(preset.name)}
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
        <div role="group" aria-label={t.presets.confirmDelete(preset.name)} className="flex items-center gap-1 rounded-md bg-danger-bg py-1 pr-1 pl-2.5 text-xs text-danger">
          <span className="mr-1">{t.presets.deleteQuestion(preset.name)}</span>
          <Button size="xs" variant="ghost" onClick={() => setConfirmingDelete(false)}>
            {t.presets.cancel}
          </Button>
          <Button size="xs" variant="danger" autoFocus onClick={onDelete}>
            {t.presets.delete}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-0.5">
          <Button size="icon-sm" variant="ghost" disabled={first} onClick={() => onMove(-1)} aria-label={t.presets.moveUp(preset.name)}>
            <Icon name="up" />
          </Button>
          <Button size="icon-sm" variant="ghost" disabled={last} onClick={() => onMove(1)} aria-label={t.presets.moveDown(preset.name)}>
            <Icon name="down" />
          </Button>
          {onShare ? (
            <Button size="icon-sm" variant="ghost" onClick={onShare} aria-label={t.presets.shareNamed(preset.name)} title={t.presets.shareTitle}>
              <Icon name="link" />
            </Button>
          ) : null}
          <Button size="icon-sm" variant="ghost" onClick={onDuplicate} aria-label={t.presets.duplicateNamed(preset.name)} title={t.presets.duplicate}>
            <Icon name="duplicate" />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => setConfirmingDelete(true)} aria-label={t.presets.deleteNamed(preset.name)} title={t.presets.delete}>
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
  const t = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const allNames = [...BUILTIN_PRESETS, ...state.presets];

  const handleDuplicate = (preset: Preset) => {
    const copy: Preset = { ...preset, id: crypto.randomUUID(), name: uniquePresetName(t.presets.copyName(presetLabel(preset)), allNames) };
    dispatch({ type: 'upsertPreset', preset: copy });
    dispatch({ type: 'announce', message: t.presets.created(copy.name) });
  };

  const handleShare = async (preset: Preset) => {
    const url = `${window.location.origin}${window.location.pathname}${createShareHash([preset])}`;
    try {
      await navigator.clipboard.writeText(url);
      notify('info', t.presets.linkCopied(preset.name));
    } catch {
      window.prompt(t.presets.copyLink, url);
    }
  };

  const handleExport = () => {
    const chosen = selected.size > 0 ? state.presets.filter((preset) => selected.has(preset.id)) : state.presets;
    if (chosen.length === 0) {
      notify('info', t.presets.nothingToExport);
      return;
    }
    const json = JSON.stringify(createPresetFile(chosen), null, 2);
    const stamp = new Date().toISOString().slice(0, 10);
    triggerDownload(new Blob([json], { type: 'application/json' }), `localcrop-presets-${stamp}.json`);
    dispatch({ type: 'announce', message: t.presets.exported(chosen.length) });
  };

  const handleImportFile = async (file: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      notify('error', t.presets.invalidJson(file.name));
      return;
    }
    const validation = validatePresetFile(parsed);
    if (!validation.ok) {
      notify('error', `${file.name}: ${translateError(validation.reason)}`);
      return;
    }
    const merged = mergePresets(state.presets, validation.presets);
    setPendingImport({ presets: merged.presets, summary: describeMergeSummary(merged.summary, validation.rejected) });
  };

  const handleConfirmImport = () => {
    if (!pendingImport) return;
    dispatch({ type: 'replacePresets', presets: pendingImport.presets });
    dispatch({ type: 'announce', message: t.presets.imported(pendingImport.summary) });
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
      title={t.presets.title}
      footer={
        <>
          <Button onClick={() => fileInput.current?.click()} className="mr-auto">
            {t.presets.import}
          </Button>
          <Button onClick={handleExport}>{selected.size > 0 ? t.presets.exportSelected(selected.size) : t.presets.exportAll}</Button>
          <Button
            variant="primary"
            onClick={() => {
              const preset = newPreset(allNames);
              dispatch({ type: 'upsertPreset', preset });
            }}
          >
            <Icon name="plus" /> {t.presets.new}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            aria-label={t.presets.importFile}
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
          <p className="font-medium">{t.presets.importSummary(pendingImport.summary)}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="primary" onClick={handleConfirmImport}>
              {t.presets.merge}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingImport(null)}>
              {t.presets.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      <h3 className={sectionLabelClass}>
        {t.presets.yours} · <span className="font-mono">{state.presets.length}</span>
      </h3>
      {state.presets.length === 0 ? (
        <p className="py-3 text-[13px] text-ink-3">
          {t.presets.none}
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
                dispatch({ type: 'announce', message: t.presets.deleted(preset.name) });
              }}
              onMove={(offset) => dispatch({ type: 'movePreset', id: preset.id, offset })}
              onShare={() => void handleShare(preset)}
            />
          ))}
        </ul>
      )}

      <h3 className={cn(sectionLabelClass, 'mt-5')}>{t.presets.builtIn}</h3>
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

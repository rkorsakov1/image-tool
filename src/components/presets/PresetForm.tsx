import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';
import { renderFilename } from '../../lib/filenameTemplate';
import { formatBytes, FORMAT_LABELS, parseByteSize } from '../../lib/format';
import type { FitMode, OutputFormat, Preset, QueueItem } from '../../lib/types';
import { Field, inputClass, NumberField, Select, Slider, Toggle } from '../ui/Field';

type PresetFormProps = {
  preset: Preset;
  item: QueueItem | null;
  queueLength: number;
  onChange: (patch: Partial<Preset>) => void;
};

const FORMAT_OPTIONS = (['jpeg', 'webp', 'avif', 'png'] as const).map((value) => ({ value, label: FORMAT_LABELS[value] }));
const FIT_OPTIONS: { value: FitMode; label: string }[] = [
  { value: 'cover', label: 'Cover (crop to fill)' },
  { value: 'contain', label: 'Contain (fit and pad)' },
];

/** Target size, typed as "200 KB". Empty = off. Commits on blur/Enter. */
const TargetSizeField = ({ value, onChange, disabled }: { value: number | null; onChange: (value: number | null) => void; disabled: boolean }) => {
  const [draft, setDraft] = useState(value ? formatBytes(value) : '');
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDraft(value ? formatBytes(value) : '');
    setInvalid(false);
  }, [value]);

  const commit = () => {
    if (draft.trim() === '') {
      setInvalid(false);
      if (value !== null) onChange(null);
      return;
    }
    const parsed = parseByteSize(draft);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (parsed !== value) onChange(parsed);
  };

  return (
    <Field
      label="Target max size"
      hint={invalid ? <span className="text-red-600 dark:text-red-400">Use a size like 200 KB or 1.5 MB.</span> : 'Optional. Finds the highest quality that fits.'}
    >
      {(id) => (
        <input
          id={id}
          type="text"
          placeholder={disabled ? 'n/a for PNG' : 'off, e.g. 200 KB'}
          value={draft}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
          className={inputClass}
        />
      )}
    </Field>
  );
};

const TemplateField = ({ preset, item, queueLength, onChange }: PresetFormProps) => {
  const [draft, setDraft] = useState(preset.filenameTemplate);
  useEffect(() => setDraft(preset.filenameTemplate), [preset.filenameTemplate]);

  const example = renderFilename(draft || preset.filenameTemplate, {
    sourceName: item?.sourceName ?? 'photo.jpg',
    width: item?.output?.width ?? preset.width ?? 1600,
    height: item?.output?.height ?? preset.height ?? 900,
    presetName: preset.name,
    index: 1,
    queueLength: Math.max(1, queueLength),
    format: preset.format,
  });

  const commit = () => {
    const next = draft.trim() || preset.filenameTemplate;
    setDraft(next);
    if (next !== preset.filenameTemplate) onChange({ filenameTemplate: next });
  };

  return (
    <Field
      label="Filename template"
      hint={
        <>
          <span className="block truncate" title={example}>
            → <span className="font-mono">{example}</span>
          </span>
          <span className="block">
            Tokens: <code>{'{name}'}</code> <code>{'{w}'}</code> <code>{'{h}'}</code> <code>{'{preset}'}</code> <code>{'{i}'}</code>{' '}
            <code>{'{ext}'}</code>
          </span>
        </>
      }
    >
      {(id) => (
        <input
          id={id}
          type="text"
          spellCheck={false}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
          className={cn(inputClass, 'font-mono')}
        />
      )}
    </Field>
  );
};

/** All per-image output settings. Edits become overrides until saved to a preset. */
export const PresetForm = ({ preset, item, queueLength, onChange }: PresetFormProps) => {
  const isPng = preset.format === 'png';
  const bothDimensions = preset.width !== null && preset.height !== null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Width" value={preset.width} onChange={(width) => onChange({ width })} />
        <NumberField label="Height" value={preset.height} onChange={(height) => onChange({ height })} />
      </div>
      <p className="-mt-1 text-xs text-slate-500 dark:text-slate-400">Leave one empty to keep the aspect ratio; both empty keeps the original size.</p>

      <Select<FitMode>
        label="Fit"
        value={preset.fit}
        options={FIT_OPTIONS}
        onChange={(fit) => onChange({ fit })}
        disabled={!bothDimensions}
      />

      <Select<OutputFormat> label="Format" value={preset.format} options={FORMAT_OPTIONS} onChange={(format) => onChange({ format })} />

      <Slider
        label="Quality"
        min={0}
        max={100}
        value={preset.quality}
        disabled={isPng || preset.targetMaxBytes !== null}
        valueLabel={isPng ? 'lossless' : preset.targetMaxBytes !== null ? 'auto' : String(preset.quality)}
        onChange={(quality) => onChange({ quality })}
      />

      <TargetSizeField value={preset.targetMaxBytes} disabled={isPng} onChange={(targetMaxBytes) => onChange({ targetMaxBytes })} />

      <Field label="Matte color" hint="Padding in contain mode, and the background for transparency in JPEG.">
        {(id) => (
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="color"
              value={preset.matteColor}
              onChange={(event) => onChange({ matteColor: event.target.value })}
              className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-900"
            />
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{preset.matteColor}</span>
          </div>
        )}
      </Field>

      <Toggle
        label="Allow upscaling"
        checked={preset.allowUpscale}
        onChange={(allowUpscale) => onChange({ allowUpscale })}
        hint="Off: small crops are exported at their own size instead of being enlarged."
      />

      <Slider
        label="Sharpen after downscaling"
        min={0}
        max={100}
        value={preset.sharpen}
        valueLabel={preset.sharpen === 0 ? 'off' : String(preset.sharpen)}
        onChange={(sharpen) => onChange({ sharpen })}
      />

      <TemplateField preset={preset} item={item} queueLength={queueLength} onChange={onChange} />
    </div>
  );
};

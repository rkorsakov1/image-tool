import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';
import { renderFilename } from '../../lib/filenameTemplate';
import { formatBytes, FORMAT_LABELS, parseByteSize } from '../../lib/format';
import type { FitMode, OutputFormat, Preset, QueueItem } from '../../lib/types';
import { focusRing, Segmented, sectionLabelClass } from '../ui/Button';
import { ColorInput, Field, inputClass, NumberField, Slider, Toggle } from '../ui/Field';
import { Icon } from '../ui/Icon';

type PresetFormProps = {
  preset: Preset;
  item: QueueItem | null;
  queueLength: number;
  onChange: (patch: Partial<Preset>) => void;
};

const FORMAT_OPTIONS = (['jpeg', 'webp', 'avif', 'png'] as const).map((value) => ({ value, label: FORMAT_LABELS[value] }));
const FIT_OPTIONS: { value: FitMode; label: string; title: string }[] = [
  { value: 'cover', label: 'Cover · crop to fill', title: 'Crop the image to fill the output exactly' },
  { value: 'contain', label: 'Contain · pad', title: 'Fit the whole image and pad with the matte color' },
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
      inline
      label="Target max size"
      hint={invalid ? <span className="text-danger">Use a size like 200 KB or 1.5 MB.</span> : undefined}
    >
      {(id) => (
        <input
          id={id}
          type="text"
          placeholder={disabled ? 'n/a' : 'off'}
          title="Optional. Finds the highest quality that fits, e.g. 200 KB."
          value={draft}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
          className={cn(inputClass, 'w-24 font-mono max-lg:w-32')}
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

const summaryParts = (preset: Preset): string[] => [
  preset.allowUpscale ? 'Upscaling' : 'No upscaling',
  preset.sharpen === 0 ? 'Sharpen off' : `Sharpen ${preset.sharpen}`,
];

/** All per-image output settings. Edits become overrides until saved to a preset. */
export const PresetForm = ({ preset, item, queueLength, onChange }: PresetFormProps) => {
  const isPng = preset.format === 'png';
  const bothDimensions = preset.width !== null && preset.height !== null;
  const free = bothDimensions && preset.fit === 'free';

  return (
    <div className="space-y-5">
      <section aria-labelledby="size-heading" className="space-y-2.5">
        <h3 id="size-heading" className={sectionLabelClass}>
          Size &amp; fit
        </h3>
        <div className="flex items-center gap-1">
          <NumberField label="Width" prefix="W" suffix="px" value={preset.width} onChange={(width) => onChange({ width })} />
          <button
            type="button"
            aria-pressed={bothDimensions && !free}
            disabled={!bothDimensions}
            onClick={() => onChange({ fit: free ? 'cover' : 'free' })}
            aria-label={free ? 'Lock the crop to the width and height ratio' : 'Unlock the ratio for a free-form crop'}
            title={free ? 'Aspect unlocked: free-form crop. Click to lock.' : 'Aspect locked. Click to unlock for a free-form crop.'}
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink disabled:opacity-45 max-lg:size-11',
              'aria-pressed:text-ink',
              focusRing,
            )}
          >
            <Icon name={free ? 'unlink' : 'link'} />
          </button>
          <NumberField label="Height" prefix="H" suffix="px" value={preset.height} onChange={(height) => onChange({ height })} />
        </div>
        {free ? (
          <p className="flex min-h-9 items-center rounded-[9px] bg-sunken px-3 text-xs text-ink-2 max-lg:min-h-11">
            Free-form crop · the output fits within{' '}
            <span className="ml-1 font-mono">
              {preset.width} × {preset.height}
            </span>
          </p>
        ) : (
          <Segmented<FitMode>
            label="Fit"
            value={preset.fit}
            options={FIT_OPTIONS}
            onChange={(fit) => onChange({ fit })}
            disabled={!bothDimensions}
            className="flex w-full"
          />
        )}
        {!bothDimensions ? <p className="text-xs text-ink-3">Leave one side empty to keep the aspect ratio, both empty for the original size. The crop is free-form.</p> : null}
      </section>

      <section aria-labelledby="format-heading" className="space-y-2.5">
        <h3 id="format-heading" className={sectionLabelClass}>
          Format &amp; quality
        </h3>
        <Segmented<OutputFormat> label="Format" value={preset.format} options={FORMAT_OPTIONS} onChange={(format) => onChange({ format })} className="flex w-full" />
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
      </section>

      <details className="group">
        <summary className={cn('cursor-pointer list-none rounded select-none [&::-webkit-details-marker]:hidden', focusRing)}>
          <span className={cn(sectionLabelClass, 'flex items-center justify-between')}>
            Advanced
            <Icon name="chevron" className="size-3.5 transition-transform group-open:rotate-90" />
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-3 group-open:hidden">
            <span className="flex items-center gap-1">
              <span aria-hidden="true" className="size-2.5 rounded-[3px] ring-1 ring-line-strong" style={{ backgroundColor: preset.matteColor }} />
              Matte {preset.matteColor.toUpperCase()}
            </span>
            {summaryParts(preset).map((part) => (
              <span key={part}>{part}</span>
            ))}
            <span className="w-full truncate font-mono">{preset.filenameTemplate}</span>
          </span>
        </summary>
        <div className="mt-3 space-y-3.5">
          <Field inline label="Matte color" hint="Padding in contain mode, and the background for transparency in JPEG.">
            {(id) => (
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-ink-3">{preset.matteColor.toUpperCase()}</span>
                <ColorInput id={id} label="Matte color" value={preset.matteColor} onChange={(matteColor) => onChange({ matteColor })} />
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
      </details>
    </div>
  );
};

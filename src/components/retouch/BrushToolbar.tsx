import { useId } from 'react';
import { cn } from '../../lib/cn';
import { Button, focusRing, Keycap, Segmented } from '../ui/Button';
import { MAX_BRUSH, MIN_BRUSH, type BrushSettings } from './MaskEditor';

type BrushToolbarProps = {
  brush: BrushSettings;
  onChange: (brush: BrushSettings) => void;
  paintLabel: string;
  eraseLabel: string;
  /** Disables the erase/restore side (e.g. nothing to restore yet). */
  eraseDisabled?: boolean;
};

// The slider is logarithmic so small brushes stay precise.
const toSlider = (size: number) => Math.round((Math.log(size / MIN_BRUSH) / Math.log(MAX_BRUSH / MIN_BRUSH)) * 100);
const fromSlider = (value: number) => Math.round(MIN_BRUSH * (MAX_BRUSH / MIN_BRUSH) ** (value / 100));

/** Brush size, paint/erase and soft edge. Shared by Retouch and Background modes. */
export const BrushToolbar = ({ brush, onChange, paintLabel, eraseLabel, eraseDisabled = false }: BrushToolbarProps) => {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="mr-1 text-xs text-ink-2">
        Brush
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        value={toSlider(brush.size)}
        aria-valuetext={`${brush.size} pixels`}
        aria-keyshortcuts="[ ]"
        onChange={(event) => onChange({ ...brush, size: fromSlider(Number(event.target.value)) })}
        className={cn('h-5 w-24 shrink-0 accent-primary max-lg:h-8', focusRing)}
      />
      <span className="w-14 shrink-0 text-right font-mono text-xs text-ink-2">{brush.size} px</span>
      <Segmented<'paint' | 'erase'>
        label="Brush mode (X)"
        className="ml-2"
        value={brush.erase && !eraseDisabled ? 'erase' : 'paint'}
        onChange={(mode) => onChange({ ...brush, erase: mode === 'erase' })}
        options={[
          {
            value: 'paint',
            label: (
              <>
                <span aria-hidden="true" className="size-2 rounded-full bg-accent" /> {paintLabel}
              </>
            ),
          },
          {
            value: 'erase',
            label: (
              <>
                {eraseLabel} <Keycap className="max-lg:hidden">X</Keycap>
              </>
            ),
          },
        ]}
      />
      <Button variant="ghost" size="sm" pressed={brush.soft} onClick={() => onChange({ ...brush, soft: !brush.soft })} className="ml-1">
        Soft edge
      </Button>
    </>
  );
};

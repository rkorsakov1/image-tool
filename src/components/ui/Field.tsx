import { useEffect, useId, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { focusRing } from './Button';

export const inputClass = cn(
  'h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 placeholder:text-slate-400',
  'disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500',
  focusRing,
);

export const labelClass = 'block text-xs font-medium text-slate-600 dark:text-slate-300';

type FieldProps = { label: string; hint?: ReactNode; children: (id: string) => ReactNode; className?: string };

/** Label + control + optional hint, wired together by id. */
export const Field = ({ label, hint, children, className }: FieldProps) => {
  const id = useId();
  return (
    <div className={cn('space-y-1', className)}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children(id)}
      {hint ? <div className="text-xs text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </div>
  );
};

type NumberFieldProps = {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  hint?: ReactNode;
  disabled?: boolean;
};

/** Integer input where an empty value means null ("auto"). Commits on blur/Enter so typing isn't interrupted. */
export const NumberField = ({ label, value, onChange, min = 1, max = 16384, placeholder = 'auto', hint, disabled }: NumberFieldProps) => {
  const [draft, setDraft] = useState(value === null ? '' : String(value));

  useEffect(() => {
    setDraft(value === null ? '' : String(value));
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === '') {
      if (value !== null) onChange(null);
      return;
    }
    const parsed = Math.round(Number(trimmed));
    if (!Number.isFinite(parsed)) {
      setDraft(value === null ? '' : String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <Field label={label} hint={hint}>
      {(id) => (
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          placeholder={placeholder}
          value={draft}
          disabled={disabled}
          className={inputClass}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
          }}
        />
      )}
    </Field>
  );
};

type SliderProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  valueLabel?: string;
};

export const Slider = ({ label, value, onChange, min, max, step = 1, disabled, valueLabel }: SliderProps) => {
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{valueLabel ?? value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className={cn('w-full accent-sky-600 disabled:opacity-50 dark:accent-sky-400', focusRing)}
      />
    </div>
  );
};

type SelectProps<T extends string> = {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
};

export const Select = <T extends string>({ label, value, options, onChange, disabled }: SelectProps<T>) => (
  <Field label={label}>
    {(id) => (
      <select id={id} value={value} disabled={disabled} className={inputClass} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )}
  </Field>
);

type ToggleProps = { label: string; checked: boolean; onChange: (checked: boolean) => void; hint?: ReactNode };

export const Toggle = ({ label, checked, onChange, hint }: ToggleProps) => {
  const id = useId();
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className={cn('size-4 rounded accent-sky-600 dark:accent-sky-400', focusRing)}
        />
        <label htmlFor={id} className="text-sm text-slate-700 dark:text-slate-200">
          {label}
        </label>
      </div>
      {hint ? <div className="pl-6 text-xs text-slate-500 dark:text-slate-400">{hint}</div> : null}
    </div>
  );
};

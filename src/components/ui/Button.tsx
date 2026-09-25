import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; pressed?: boolean };

export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export const Button = ({ variant = 'secondary', size = 'md', pressed, className, type = 'button', ...props }: ButtonProps) => (
  <button
    type={type}
    aria-pressed={pressed}
    className={cn(
      'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md whitespace-nowrap transition-colors duration-150',
      'disabled:cursor-not-allowed disabled:opacity-45',
      focusRing,
      {
        'h-6.5 px-2 text-xs font-medium': size === 'xs',
        'h-7.5 px-2.5 text-[13px] font-medium max-lg:h-10': size === 'sm',
        'h-8 px-3 text-[13px] font-medium max-lg:h-11': size === 'md',
        'h-11 px-4 text-sm font-semibold': size === 'lg',
        'size-8 max-lg:size-11': size === 'icon',
        'size-7 max-lg:size-11': size === 'icon-sm',
        'size-11': size === 'icon-lg',
        'bg-primary text-on-primary font-semibold hover:bg-primary-hover disabled:hover:bg-primary': variant === 'primary',
        'border border-line-strong bg-raised text-ink hover:bg-sunken/60 aria-pressed:bg-sunken': variant === 'secondary',
        'text-ink-2 hover:bg-sunken hover:text-ink aria-pressed:bg-sunken aria-pressed:text-ink': variant === 'ghost',
        'bg-danger-solid text-on-primary font-semibold hover:opacity-90': variant === 'danger',
      },
      className,
    )}
    {...props}
  />
);

/** A keyboard key hint. Decorative: the shortcut is also described in the accessible name or help dialog. */
export const Keycap = ({ children, className }: { children: ReactNode; className?: string }) => (
  <kbd
    aria-hidden="true"
    className={cn(
      'inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-sm border border-b-2 border-line-strong bg-raised px-1 font-mono text-[11px] leading-none font-medium text-ink-2',
      className,
    )}
  >
    {children}
  </kbd>
);

type SegmentedOption<T> = { value: T; label: ReactNode; title?: string; ariaLabel?: string };

type SegmentedProps<T> = {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
};

/** Segmented control: a group of toggle buttons where exactly one is pressed. */
export const Segmented = <T extends string | number>({ label, value, options, onChange, disabled, className }: SegmentedProps<T>) => (
  <div role="group" aria-label={label} className={cn('inline-flex shrink-0 rounded-[9px] bg-sunken p-0.75', { 'opacity-45': disabled }, className)}>
    {options.map((option) => {
      const selected = option.value === value;
      return (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={selected}
          aria-label={option.ariaLabel}
          title={option.title}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex h-7.5 flex-1 items-center justify-center gap-1.5 rounded-[7px] px-2.5 text-[13px] whitespace-nowrap transition-colors duration-150 max-lg:h-9',
            'disabled:cursor-not-allowed',
            focusRing,
            {
              'bg-raised font-semibold text-ink ring-1 ring-line-strong': selected,
              'text-ink-2 hover:text-ink': !selected,
            },
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

/** Small uppercase heading used for panel sections. */
export const sectionLabelClass = 'text-[11px] font-semibold tracking-[.07em] text-ink-3 uppercase';

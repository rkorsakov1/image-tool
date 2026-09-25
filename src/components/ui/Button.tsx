import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; pressed?: boolean };

export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:focus-visible:outline-sky-400';

export const Button = ({ variant = 'secondary', size = 'md', pressed, className, type = 'button', ...props }: ButtonProps) => (
  <button
    type={type}
    aria-pressed={pressed}
    className={cn(
      'inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors motion-reduce:transition-none',
      'disabled:cursor-not-allowed disabled:opacity-50',
      focusRing,
      {
        'h-8 px-2.5 text-xs': size === 'sm',
        'h-9 px-3.5 text-sm': size === 'md',
        'bg-sky-600 text-white hover:bg-sky-700 disabled:hover:bg-sky-600 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400':
          variant === 'primary',
        'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700':
          variant === 'secondary' && !pressed,
        'border border-sky-500 bg-sky-50 text-sky-900 dark:border-sky-400 dark:bg-sky-950 dark:text-sky-100':
          variant === 'secondary' && Boolean(pressed),
        'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800': variant === 'ghost',
        'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400': variant === 'danger',
      },
      className,
    )}
    {...props}
  />
);

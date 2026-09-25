import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Row 2 of the canvas column: one fixed-height toolbar per mode that scrolls sideways instead of wrapping. */
export const Toolbar = ({ label, children, className }: { label: string; children: ReactNode; className?: string }) => (
  <div
    role="toolbar"
    aria-label={label}
    className={cn(
      'flex h-10 shrink-0 items-center gap-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] max-lg:h-12 max-lg:px-4 [&::-webkit-scrollbar]:hidden',
      className,
    )}
  >
    {children}
  </div>
);

export const ToolbarDivider = () => <span aria-hidden="true" className="mx-1.5 h-5 w-px shrink-0 bg-line-strong" />;

/** The canvas stage: sunken surface with a dot grid. Pointer drags inside never scroll the page. */
export const Stage = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div
    className={cn(
      'relative min-h-72 flex-1 touch-none overflow-hidden rounded-lg bg-sunken bg-[radial-gradient(var(--color-dot)_1px,transparent_1px)] bg-size-[16px_16px] select-none',
      'max-lg:min-h-[56vh] max-lg:rounded-none',
      className,
    )}
  >
    {children}
  </div>
);

/** A small note floating at the bottom-left of the stage. */
export const HintChip = ({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'busy' }) => (
  <p
    aria-live="polite"
    className={cn(
      'pointer-events-none absolute bottom-3 left-3 z-10 max-w-[min(26rem,calc(100%-1.5rem))] rounded-md px-2.5 py-1.5 text-xs shadow-float',
      tone === 'busy' ? 'bg-primary text-on-primary' : 'bg-raised text-ink-2',
    )}
  >
    {children}
  </p>
);

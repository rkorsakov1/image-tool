import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/** Native modal <dialog>: focus trapping, Escape and ::backdrop come from the browser. */
export const Dialog = ({ open, onClose, title, children, footer, className }: DialogProps) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        'm-auto max-h-[85vh] w-[min(40rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl',
        'backdrop:bg-slate-950/50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
        className,
      )}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog">
              ✕
            </Button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">{footer}</footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
};

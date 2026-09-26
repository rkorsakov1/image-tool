import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from 'react';
import { useScrollLock } from '../../hooks/useScrollLock';
import { cn } from '../../lib/cn';
import { Button } from './Button';
import { Icon } from './Icon';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Below 1024px, show as a bottom sheet that closes on swipe-down or a tap outside. */
  sheet?: boolean;
};

const SWIPE_CLOSE_PX = 80;

/** Native modal <dialog>: focus trapping, Escape and ::backdrop come from the browser. */
export const Dialog = ({ open, onClose, title, children, footer, className, sheet = false }: DialogProps) => {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ pointerId: number; startY: number; dy: number } | null>(null);
  const titleId = useId();
  useScrollLock(open);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const setOffset = (dy: number) => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.style.translate = dy > 0 ? `0 ${dy}px` : '';
    dialog.style.transition = dy > 0 ? 'none' : '';
  };

  const handleSwipeDown = (event: PointerEvent<HTMLElement>) => {
    if (!sheet || event.pointerType === 'mouse') return;
    // Only start from the grab area, or from the body when it's scrolled to the top.
    const fromBody = bodyRef.current?.contains(event.target as Node) ?? false;
    if (fromBody && (bodyRef.current?.scrollTop ?? 0) > 0) return;
    swipe.current = { pointerId: event.pointerId, startY: event.clientY, dy: 0 };
  };

  const handleSwipeMove = (event: PointerEvent<HTMLElement>) => {
    const current = swipe.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.dy = Math.max(0, event.clientY - current.startY);
    if (current.dy > 6) setOffset(current.dy);
  };

  const handleSwipeEnd = (event: PointerEvent<HTMLElement>) => {
    const current = swipe.current;
    if (!current || current.pointerId !== event.pointerId) return;
    swipe.current = null;
    setOffset(0);
    if (current.dy > SWIPE_CLOSE_PX) onClose();
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click whose target is the <dialog> itself landed on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        'm-auto max-h-[85dvh] w-[min(40rem,calc(100vw-2rem))] overflow-hidden rounded-xl bg-panel p-0 text-ink shadow-dialog',
        'backdrop:bg-[rgb(24_24_22/.4)] backdrop:backdrop-blur-[1px]',
        {
          'max-lg:mt-auto max-lg:mb-[var(--kb,0px)] max-lg:w-full max-lg:max-w-none max-lg:rounded-b-none max-lg:[animation:lc-sheet_.24s_var(--ease-out)]':
            sheet,
        },
        className,
      )}
    >
      {open ? (
        <div
          className={cn('flex max-h-[85dvh] flex-col', { 'max-lg:max-h-[calc(85dvh-var(--kb,0px))]': sheet })}
          onPointerDown={handleSwipeDown}
          onPointerMove={handleSwipeMove}
          onPointerUp={handleSwipeEnd}
          onPointerCancel={handleSwipeEnd}
        >
          {sheet ? <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line-strong lg:hidden" /> : null}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-line pr-2 pl-5">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog">
              <Icon name="close" />
            </Button>
          </header>
          <div
            ref={bodyRef}
            // On phones, keep the focused field visible once the on-screen keyboard has opened.
            onFocus={(event) => {
              const target = event.target;
              if (!sheet || !(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
              setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
            }}
            className={cn('overflow-y-auto overscroll-contain px-5 py-4 [-webkit-overflow-scrolling:touch]', {
              'max-lg:pb-[max(1rem,env(safe-area-inset-bottom))]': sheet && !footer,
            })}
          >
            {children}
          </div>
          {footer ? (
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-app px-5 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
};

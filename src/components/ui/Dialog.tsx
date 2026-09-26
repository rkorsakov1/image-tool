import { useEffect, useId, useRef, type ReactNode } from 'react';
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
  const titleId = useId();
  useScrollLock(open);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Swipe down to close (bottom sheet only). Native, non-passive touch listeners: React's touch
  // handlers are passive, so they couldn't stop the sheet's content from scrolling instead.
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const panel = panelRef.current;
    const dialog = ref.current;
    if (!open || !sheet || !panel || !dialog) return;
    let start: { y: number; time: number; fromBody: boolean } | null = null;
    let dy = 0;
    const setOffset = (offset: number, animate: boolean) => {
      dialog.style.transition = animate ? 'translate .2s var(--ease-out)' : 'none';
      dialog.style.translate = offset > 0 ? `0 ${offset}px` : '';
    };
    const handleStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || window.matchMedia('(min-width: 1024px)').matches) return;
      const body = bodyRef.current;
      const fromBody = body?.contains(event.target as Node) ?? false;
      start = { y: event.touches[0]?.clientY ?? 0, time: event.timeStamp, fromBody };
      dy = 0;
    };
    const handleMove = (event: TouchEvent) => {
      if (!start) return;
      const next = (event.touches[0]?.clientY ?? 0) - start.y;
      // From the content, only take over when it's scrolled to the top and the finger moves down.
      if (start.fromBody && ((bodyRef.current?.scrollTop ?? 0) > 0 || (dy === 0 && next <= 0))) {
        start = null;
        return;
      }
      if (next <= 0 && dy === 0) return;
      event.preventDefault();
      dy = Math.max(0, next);
      setOffset(dy, false);
    };
    const handleEnd = (event: TouchEvent) => {
      if (!start) return;
      const velocity = dy / Math.max(1, event.timeStamp - start.time);
      start = null;
      if (dy > SWIPE_CLOSE_PX || (dy > 30 && velocity > 0.5)) {
        setOffset(0, false);
        onCloseRef.current();
      } else {
        setOffset(0, true);
      }
      dy = 0;
    };
    panel.addEventListener('touchstart', handleStart, { passive: true });
    panel.addEventListener('touchmove', handleMove, { passive: false });
    panel.addEventListener('touchend', handleEnd);
    panel.addEventListener('touchcancel', handleEnd);
    return () => {
      panel.removeEventListener('touchstart', handleStart);
      panel.removeEventListener('touchmove', handleMove);
      panel.removeEventListener('touchend', handleEnd);
      panel.removeEventListener('touchcancel', handleEnd);
      dialog.style.translate = '';
    };
  }, [open, sheet]);

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
        <div ref={panelRef} className={cn('flex max-h-[85dvh] flex-col', { 'max-lg:max-h-[calc(85dvh-var(--kb,0px))]': sheet })}>
          {sheet ? (
            // Grab handle: a tall, invisible touch area around the small visible bar.
            <div aria-hidden="true" className="flex h-5 shrink-0 touch-none items-end justify-center lg:hidden">
              <span className="h-1 w-9 rounded-full bg-line-strong" />
            </div>
          ) : null}
          <header className={cn('flex h-14 shrink-0 items-center justify-between border-b border-line pr-2 pl-5', { 'max-lg:touch-none': sheet })}>
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

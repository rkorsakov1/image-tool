import { useEffect } from 'react';
import { cn } from '../../lib/cn';
import type { Notice } from '../../state/appReducer';
import { useApp } from '../../state/AppContext';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';

const AUTO_DISMISS_MS = 6000;

const KIND: Record<Notice['tone'], { title: string; icon: IconName; badge: string }> = {
  success: { title: 'Done', icon: 'check', badge: 'bg-success-bg text-success' },
  info: { title: 'Note', icon: 'info', badge: 'bg-sunken text-ink-2' },
  warning: { title: 'Warning', icon: 'warn', badge: 'bg-warning-bg text-warning' },
  error: { title: 'Error', icon: 'warn', badge: 'bg-danger-bg text-danger' },
};

/** Toast-style notices plus the polite live region every status update goes through. */
export const Notices = () => {
  const { state, dispatch } = useApp();

  useEffect(() => {
    const timers = state.notices
      .filter((notice) => notice.tone !== 'error' && !notice.persistent)
      .map((notice) => setTimeout(() => dispatch({ type: 'dismissNotice', id: notice.id }), AUTO_DISMISS_MS));
    return () => timers.forEach(clearTimeout);
  }, [state.notices, dispatch]);

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {state.announcement}
      </div>
      <div
        className={cn(
          'pointer-events-none fixed z-40 flex flex-col gap-2',
          // Desktop: bottom-right above the footer, left of the settings column. Mobile: above the download bar.
          'right-[calc(340px+1rem)] bottom-12 w-[360px] max-lg:inset-x-4 max-lg:right-4 max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-lg:w-auto',
        )}
      >
        {state.notices.map((notice) => {
          const kind = KIND[notice.tone];
          return (
            <div
              key={notice.id}
              role={notice.tone === 'error' ? 'alert' : undefined}
              className="pointer-events-auto flex items-start gap-3 rounded-lg bg-raised p-3 shadow-float [animation:lc-rise_.24s_var(--ease-out)]"
            >
              <span aria-hidden="true" className={cn('flex size-6 shrink-0 items-center justify-center rounded-full', kind.badge)}>
                <Icon name={kind.icon} className="size-3.5" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-xs font-semibold">{kind.title}</p>
                <p className="text-[13px] break-words text-ink-2">{notice.message}</p>
                {notice.action ? (
                  <Button
                    size="sm"
                    variant="primary"
                    className="mt-2"
                    onClick={() => {
                      notice.action?.run();
                      dispatch({ type: 'dismissNotice', id: notice.id });
                    }}
                  >
                    {notice.action.label}
                  </Button>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dispatch({ type: 'dismissNotice', id: notice.id })}
                className="-m-1 flex size-7 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-accent max-lg:size-10"
              >
                <Icon name="close" />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
};

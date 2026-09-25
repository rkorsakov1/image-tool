import { useEffect } from 'react';
import { cn } from '../../lib/cn';
import { useApp } from '../../state/AppContext';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

const AUTO_DISMISS_MS = 8000;

/** Toast-style notices plus the polite live region every status update goes through. */
export const Notices = () => {
  const { state, dispatch } = useApp();

  useEffect(() => {
    const timers = state.notices
      .filter((notice) => notice.tone !== 'error' && !notice.action)
      .map((notice) => setTimeout(() => dispatch({ type: 'dismissNotice', id: notice.id }), AUTO_DISMISS_MS));
    return () => timers.forEach(clearTimeout);
  }, [state.notices, dispatch]);

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {state.announcement}
      </div>
      <div className="pointer-events-none fixed right-4 bottom-12 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {state.notices.map((notice) => (
          <div
            key={notice.id}
            className={cn('pointer-events-auto flex items-start gap-2 rounded-lg border p-3 text-sm shadow-lg', {
              'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100': notice.tone === 'error',
              'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100': notice.tone === 'warning',
              'border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100': notice.tone === 'info',
            })}
          >
            <p className="flex-1">{notice.message}</p>
            {notice.action ? (
              <Button size="sm" variant="primary" onClick={notice.action.run}>
                {notice.action.label}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" aria-label="Dismiss" onClick={() => dispatch({ type: 'dismissNotice', id: notice.id })}>
              <Icon name="close" />
            </Button>
          </div>
        ))}
      </div>
    </>
  );
};

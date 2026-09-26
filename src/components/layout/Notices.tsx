import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/cn';
import type { Notice } from '../../state/appReducer';
import { useApp } from '../../state/AppContext';
import { Button } from '../ui/Button';
import { Icon, type IconName } from '../ui/Icon';
import { TOAST_ANCHOR_ID } from './SettingsPanel';
import { useT } from '../../i18n/useT';

const AUTO_DISMISS_MS = 6000;

const KIND: Record<Notice['tone'], { icon: IconName; badge: string }> = {
  success: { icon: 'check', badge: 'bg-success-bg text-success' },
  info: { icon: 'info', badge: 'bg-sunken text-ink-2' },
  warning: { icon: 'warn', badge: 'bg-warning-bg text-warning' },
  error: { icon: 'warn', badge: 'bg-danger-bg text-danger' },
};

/** Toast-style notices plus the polite live region every status update goes through. */
export const Notices = () => {
  const { state, dispatch } = useApp();
  const t = useT();

  useEffect(() => {
    const timers = state.notices
      .filter((notice) => notice.tone !== 'error' && !notice.persistent)
      .map((notice) => setTimeout(() => dispatch({ type: 'dismissNotice', id: notice.id }), AUTO_DISMISS_MS));
    return () => timers.forEach(clearTimeout);
  }, [state.notices, dispatch]);

  // Phones: attach to the sticky Download bar when it's there, so toasts never hide behind it.
  const desktop = useIsDesktop();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (desktop) {
      setAnchor(null);
      return;
    }
    const find = () => setAnchor(document.getElementById(TOAST_ANCHOR_ID));
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [desktop]);

  const stack = (
    <div
      className={cn('pointer-events-none z-40 flex flex-col gap-2', {
        // Desktop: bottom-right above the footer, left of the settings column.
        'fixed right-[calc(340px+1rem)] bottom-12 w-[360px]': desktop,
        'absolute inset-x-4 bottom-2': !desktop && anchor !== null,
        'fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))]': !desktop && !anchor,
      })}
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
                <p className="text-xs font-semibold">{t.notices[notice.tone]}</p>
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
                aria-label={t.app.dismiss}
                onClick={() => dispatch({ type: 'dismissNotice', id: notice.id })}
                className="-m-1 flex size-7 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-accent max-lg:size-10"
              >
                <Icon name="close" />
              </button>
            </div>
          );
        })}
    </div>
  );

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {state.announcement}
      </div>
      {anchor ? createPortal(stack, anchor) : stack}
    </>
  );
};

import { formatBytes } from '../../lib/format';
import { useApp } from '../../state/AppContext';
import { focusRing, Keycap } from '../ui/Button';
import { useT } from '../../i18n/useT';

export const REPO_URL = 'https://github.com/rkorsakov1/localcrop';

export const Footer = ({ onShowShortcuts }: { onShowShortcuts: () => void }) => {
  const { state } = useApp();
  const t = useT();
  const { bytes, count } = state.savings;
  const lifetime = state.prefs.lifetime;

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-line bg-panel px-4 text-xs text-ink-3 max-lg:hidden">
      <span key={count} className="font-mono [animation:lc-rise_.3s_var(--ease-out)]">
        {count > 0 ? t.footer.saved(formatBytes(bytes), count) : t.footer.none}
      </span>
      {lifetime.count > count ? (
        <span className="font-mono max-xl:hidden" title={t.footer.allTimeTitle}>
          {t.footer.allTime(formatBytes(lifetime.bytes), lifetime.count)}
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-4">
        <button type="button" onClick={onShowShortcuts} className={`flex items-center gap-1.5 rounded hover:text-ink ${focusRing}`}>
          {t.footer.shortcuts} <Keycap>?</Keycap>
        </button>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className={`rounded hover:text-ink ${focusRing}`}>
          {t.footer.source}
        </a>
      </span>
    </footer>
  );
};

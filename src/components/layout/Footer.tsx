import { formatBytes } from '../../lib/format';
import { useApp } from '../../state/AppContext';
import { focusRing, Keycap } from '../ui/Button';

export const REPO_URL = 'https://github.com/rkorsakov1/localcrop';

export const Footer = ({ onShowShortcuts }: { onShowShortcuts: () => void }) => {
  const { state } = useApp();
  const { bytes, count } = state.savings;

  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-line bg-panel px-4 text-xs text-ink-3 max-lg:hidden">
      <span key={count} className="font-mono [animation:lc-rise_.3s_var(--ease-out)]">
        {count > 0 ? `Saved ${formatBytes(bytes)} across ${count} image${count === 1 ? '' : 's'}` : 'No exports yet this session'}
      </span>
      <span className="ml-auto flex items-center gap-4">
        <button type="button" onClick={onShowShortcuts} className={`flex items-center gap-1.5 rounded hover:text-ink ${focusRing}`}>
          Shortcuts <Keycap>?</Keycap>
        </button>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className={`rounded hover:text-ink ${focusRing}`}>
          Source on GitHub
        </a>
      </span>
    </footer>
  );
};

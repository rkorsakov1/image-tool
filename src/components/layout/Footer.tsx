import { formatBytes } from '../../lib/format';
import { useApp } from '../../state/AppContext';
import { Button, focusRing } from '../ui/Button';
import { Icon } from '../ui/Icon';

export const REPO_URL = 'https://github.com/rkorsakov1/image-tool';

export const Footer = ({ onShowShortcuts }: { onShowShortcuts: () => void }) => {
  const { state } = useApp();
  const { bytes, count } = state.savings;

  return (
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <span className="tabular-nums">
        {count > 0 ? `Saved ${formatBytes(bytes)} across ${count} image${count === 1 ? '' : 's'}` : 'No exports yet this session'}
      </span>
      <span>Runs entirely in your browser — images never leave your device.</span>
      <span className="ml-auto flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onShowShortcuts} aria-label="Keyboard shortcuts">
          <Icon name="keyboard" /> <kbd>?</kbd>
        </Button>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className={`rounded underline-offset-2 hover:underline ${focusRing}`}>
          Source on GitHub
        </a>
      </span>
    </footer>
  );
};

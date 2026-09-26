import { Keycap } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { IS_MAC } from './SettingsPanel';

const MOD = IS_MAC ? '⌘' : 'Ctrl';

const SHORTCUTS: [string[][], string][] = [
  [[[MOD, 'V']], 'Paste image or URL'],
  [[[MOD, 'S'], ['Enter']], 'Download output'],
  [[[MOD, '⇧', 'C']], 'Copy output'],
  [[['N'], ['P']], 'Next / previous image'],
  [[['C'], ['E'], ['B'], ['V']], 'Crop · Retouch · Background · Compare'],
  [[['R']], 'Reset crop'],
  [[['←↑↓→']], 'Nudge crop (Shift: 10 px)'],
  [[['+'], ['−']], 'Resize crop around center'],
  [[['['], [']']], 'Brush size'],
  [[['X']], 'Toggle paint / erase'],
  [[[MOD, 'Z']], 'Undo'],
  [[[MOD, '⇧', 'Z']], 'Redo'],
  [[['?']], 'This help'],
];

export const ShortcutsDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" className="lg:w-[min(46rem,calc(100vw-2rem))]">
    <dl className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
      {SHORTCUTS.map(([combos, action]) => (
        <div key={action} className="flex min-h-9 items-center justify-between gap-4 border-b border-line py-1.5">
          <dt className="text-[13px] text-ink-2">{action}</dt>
          <dd className="flex shrink-0 items-center gap-1.5">
            <span className="sr-only">{combos.map((combo) => combo.join('+')).join(' or ')}</span>
            {combos.map((combo) => (
              <span key={combo.join('+')} className="flex items-center gap-0.5">
                {combo.map((key) => (
                  <Keycap key={key}>{key}</Keycap>
                ))}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
    <p className="mt-3 text-xs text-ink-3">Shortcuts pause while you type in a text field.</p>
  </Dialog>
);

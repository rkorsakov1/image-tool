import { Dialog } from '../ui/Dialog';

const SHORTCUTS: [string, string][] = [
  ['Ctrl/Cmd+V', 'Paste an image or image URL'],
  ['Ctrl/Cmd+S or Enter', 'Download current output'],
  ['N / P', 'Next / previous image'],
  ['R', 'Reset crop'],
  ['C / E / B / V', 'Crop / Retouch (Edit) / Background / Compare mode'],
  ['Arrows, Shift+arrows', 'Nudge crop (1 px / 10 px) when the crop box has focus'],
  ['+ / −', 'Resize crop around its center'],
  ['[ / ]', 'Brush size'],
  ['X', 'Toggle paint / erase'],
  ['Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z', 'Undo / redo (mask)'],
  ['?', 'This help'],
];

export const ShortcutsDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
    <table className="w-full text-sm">
      <thead className="sr-only">
        <tr>
          <th>Key</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
        {SHORTCUTS.map(([keys, action]) => (
          <tr key={keys}>
            <td className="py-1.5 pr-4 font-mono text-xs whitespace-nowrap">{keys}</td>
            <td className="py-1.5">{action}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Shortcuts are disabled while typing in a text field.</p>
  </Dialog>
);

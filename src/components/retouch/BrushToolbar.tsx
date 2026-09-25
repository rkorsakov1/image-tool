import type { MaskHistory } from '../../hooks/useMaskHistory';
import { Button } from '../ui/Button';
import { Slider } from '../ui/Field';
import { MAX_BRUSH, MIN_BRUSH, type BrushSettings } from './MaskEditor';

type BrushToolbarProps = {
  brush: BrushSettings;
  onChange: (brush: BrushSettings) => void;
  history: MaskHistory;
  paintLabel: string;
  eraseLabel: string;
};

/** Brush size, paint/erase, soft edge, undo/redo — shared by Retouch and Background modes. */
export const BrushToolbar = ({ brush, onChange, history, paintLabel, eraseLabel }: BrushToolbarProps) => (
  <div role="toolbar" aria-label="Brush" className="flex flex-wrap items-end gap-2">
    <div className="w-40">
      <Slider
        label="Brush size ([ ])"
        min={MIN_BRUSH}
        max={MAX_BRUSH}
        value={brush.size}
        valueLabel={`${brush.size} px`}
        onChange={(size) => onChange({ ...brush, size })}
      />
    </div>
    <div className="flex gap-1" role="group" aria-label="Brush mode (X)">
      <Button size="sm" pressed={!brush.erase} onClick={() => onChange({ ...brush, erase: false })}>
        {paintLabel}
      </Button>
      <Button size="sm" pressed={brush.erase} onClick={() => onChange({ ...brush, erase: true })}>
        {eraseLabel}
      </Button>
    </div>
    <Button size="sm" pressed={brush.soft} onClick={() => onChange({ ...brush, soft: !brush.soft })}>
      Soft edge
    </Button>
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" disabled={!history.canUndo} onClick={history.undo} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl/Cmd+Z)">
        ↶ Undo
      </Button>
      <Button size="sm" variant="ghost" disabled={!history.canRedo} onClick={history.redo} aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl/Cmd+Shift+Z)">
        ↷ Redo
      </Button>
    </div>
  </div>
);

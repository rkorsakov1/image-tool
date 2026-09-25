import { useCallback, useMemo, useRef, useState } from 'react';
import type { Rect } from '../lib/inpaint';

export const MAX_HISTORY = 20;

type Entry = { rect: Rect; before: ImageData; after: ImageData };

export type MaskHistory = {
  /** Call when a stroke starts: remembers the mask so the stroke's area can be restored. */
  begin: () => void;
  /** Call when the stroke ends with the area it touched (source pixels). */
  commit: (rect: Rect) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Changes whenever the mask changes through the history, so views can redraw. */
  version: number;
};

const clampRect = (rect: Rect, width: number, height: number): Rect | null => {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(height, Math.ceil(rect.y + rect.height));
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
};

/**
 * Undo/redo for a mask canvas. Each entry stores only the stroke's bounding box (before and
 * after), up to MAX_HISTORY entries, so memory stays small even for large images.
 */
export const useMaskHistory = (mask: HTMLCanvasElement): MaskHistory => {
  const undoStack = useRef<Entry[]>([]);
  const redoStack = useRef<Entry[]>([]);
  const snapshot = useRef<HTMLCanvasElement | null>(null);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((value) => value + 1);

  const context = useMemo(() => mask.getContext('2d', { willReadFrequently: true }), [mask]);

  const begin = useCallback(() => {
    // A GPU-side copy of the whole mask; only the stroke's box is read back on commit.
    const copy = snapshot.current ?? document.createElement('canvas');
    copy.width = mask.width;
    copy.height = mask.height;
    copy.getContext('2d')?.drawImage(mask, 0, 0);
    snapshot.current = copy;
  }, [mask]);

  const commit = useCallback(
    (rect: Rect) => {
      const copy = snapshot.current;
      const area = clampRect(rect, mask.width, mask.height);
      if (!copy || !context || !area) return;
      const before = copy.getContext('2d', { willReadFrequently: true })?.getImageData(area.x, area.y, area.width, area.height);
      if (!before) return;
      const after = context.getImageData(area.x, area.y, area.width, area.height);
      undoStack.current = [...undoStack.current.slice(-(MAX_HISTORY - 1)), { rect: area, before, after }];
      redoStack.current = [];
      bump();
    },
    [mask, context],
  );

  const undo = useCallback(() => {
    const entry = undoStack.current.at(-1);
    if (!entry || !context) return;
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [...redoStack.current, entry];
    context.putImageData(entry.before, entry.rect.x, entry.rect.y);
    bump();
  }, [context]);

  const redo = useCallback(() => {
    const entry = redoStack.current.at(-1);
    if (!entry || !context) return;
    redoStack.current = redoStack.current.slice(0, -1);
    undoStack.current = [...undoStack.current, entry];
    context.putImageData(entry.after, entry.rect.x, entry.rect.y);
    bump();
  }, [context]);

  const reset = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    bump();
  }, []);

  return {
    begin,
    commit,
    undo,
    redo,
    reset,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    version,
  };
};

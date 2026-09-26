import { useEffect, useRef } from 'react';

export type ShortcutHandlers = {
  download?: () => void;
  copy?: () => void;
  next?: () => void;
  previous?: () => void;
  resetCrop?: () => void;
  setMode?: (mode: 'crop' | 'retouch' | 'background' | 'compare') => void;
  help?: () => void;
};

/** True when typing should not trigger shortcuts. */
export const isTextEntryTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  const nonText = ['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file'];
  return !nonText.includes(target.type);
};

/** Elements where Enter already means "activate this", so it mustn't also download. */
const isActivatableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && target.closest('button, a, summary, input, select, textarea, [role="slider"], [role="button"], dialog') !== null;

const MODE_KEYS: Record<string, 'crop' | 'retouch' | 'background' | 'compare'> = {
  c: 'crop',
  e: 'retouch',
  b: 'background',
  v: 'compare',
};

/**
 * Global shortcuts (see the help dialog). Disabled while focus is in a text field or a modal
 * dialog. Arrow keys, +/- and brush keys are handled by the focused editor components.
 */
export const useKeyboardShortcuts = (handlers: ShortcutHandlers): void => {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTextEntryTarget(event.target)) return;
      if (document.querySelector('dialog[open]')) return;
      const current = handlersRef.current;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (modifier && key === 's') {
        event.preventDefault();
        current.download?.();
        return;
      }
      if (modifier && event.shiftKey && key === 'c' && !window.getSelection()?.toString()) {
        event.preventDefault();
        current.copy?.();
        return;
      }
      if (modifier || event.altKey) return;

      if (key === 'enter') {
        if (isActivatableTarget(event.target)) return;
        event.preventDefault();
        current.download?.();
        return;
      }
      if (event.key === '?') {
        event.preventDefault();
        current.help?.();
        return;
      }
      if (key === 'n') {
        current.next?.();
        return;
      }
      if (key === 'p') {
        current.previous?.();
        return;
      }
      if (key === 'r') {
        current.resetCrop?.();
        return;
      }
      const mode = MODE_KEYS[key];
      if (mode && current.setMode) current.setMode(mode);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
};

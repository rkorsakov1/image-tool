import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { useApp } from '../../state/AppContext';
import { collectDroppedFiles, compareFilePaths, looksLikeImageFile } from '../../state/ingest';
import { Button, focusRing } from '../ui/Button';
import { Icon } from '../ui/Icon';

const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes('Files');

/** Accepts file/folder drops anywhere in the window and shows an overlay while dragging. */
export const WindowDropTarget = () => {
  const { addFiles, notify } = useApp();
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const handleDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const handleDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };
    const handleDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const handleDrop = async (event: DragEvent) => {
      if (!hasFiles(event) || !event.dataTransfer) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      try {
        const files = await collectDroppedFiles(event.dataTransfer);
        if (files.length === 0) {
          notify('warning', 'No images found in what you dropped.');
          return;
        }
        await addFiles(files);
      } catch (error) {
        notify('error', `Couldn't read the dropped items: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [addFiles, notify]);

  if (!dragging) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-sky-500/15 p-6 backdrop-blur-[1px]">
      <div className="rounded-2xl border-2 border-dashed border-sky-500 bg-white/90 px-10 py-8 text-lg font-medium text-sky-900 dark:bg-slate-900/90 dark:text-sky-100">
        Drop images or folders to add them
      </div>
    </div>
  );
};

type FilePickersProps = { compact?: boolean };

/** "Choose files" and "Choose folder" buttons. */
export const FilePickers = ({ compact = false }: FilePickersProps) => {
  const { addFiles } = useApp();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Not in React's DOM typings; set as attributes so the picker selects folders.
    folderInput.current?.setAttribute('webkitdirectory', '');
    folderInput.current?.setAttribute('directory', '');
  }, []);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []).filter(looksLikeImageFile).sort(compareFilePaths);
    input.value = '';
    if (files.length > 0) await addFiles(files);
  };

  return (
    <div className={cn('flex gap-2', { 'flex-col sm:flex-row': !compact })}>
      <Button variant={compact ? 'secondary' : 'primary'} onClick={() => fileInput.current?.click()} className="flex-1">
        <Icon name="upload" /> Add files
      </Button>
      <Button onClick={() => folderInput.current?.click()} className="flex-1">
        <Icon name="folder" /> Add folder
      </Button>
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={handleChange} aria-label="Choose image files" />
      <input ref={folderInput} type="file" multiple hidden onChange={handleChange} aria-label="Choose a folder of images" />
    </div>
  );
};

/** The big empty-state drop zone. Clicking or pressing Enter opens the file picker. */
export const EmptyDropZone = () => {
  const { addFiles } = useApp();
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full min-h-80 items-center justify-center p-4 sm:p-8">
      <div
        role="button"
        tabIndex={0}
        aria-label="Add images: drop, paste, or press Enter to pick files"
        onClick={() => input.current?.click()}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          input.current?.click();
        }}
        className={cn(
          'flex w-full max-w-2xl cursor-pointer flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-slate-300 px-6 py-16 text-center',
          'hover:border-sky-400 hover:bg-sky-50/50 dark:border-slate-600 dark:hover:border-sky-500 dark:hover:bg-sky-950/30',
          focusRing,
        )}
      >
        <Icon name="upload" className="size-10 text-slate-400" />
        <p className="text-lg font-medium text-slate-800 dark:text-slate-100">Drop, paste, or pick images. Nothing leaves your device.</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">JPEG, PNG, WebP, AVIF, GIF, BMP · folders work too · Ctrl/Cmd+V to paste an image or URL</p>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="Choose image files"
          onChange={async (event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = '';
            if (files.length > 0) await addFiles(files);
          }}
        />
      </div>
    </div>
  );
};

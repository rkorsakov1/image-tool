import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { cn } from '../../lib/cn';
import { useApp } from '../../state/AppContext';
import { collectDroppedFiles, compareFilePaths, FILE_INPUT_ACCEPT, looksLikeImageFile, SUPPORTED_FORMAT_LABELS } from '../../state/ingest';
import { Button, Keycap } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { UrlInput } from './UrlInput';

type CornerMotion = 'breathe' | 'snap' | 'none';

const CORNER_POSITIONS = [
  { key: 'nw', className: 'top-0 left-0 border-t-4 border-l-4', dx: 1, dy: 1 },
  { key: 'ne', className: 'top-0 right-0 border-t-4 border-r-4', dx: -1, dy: 1 },
  { key: 'sw', className: 'bottom-0 left-0 border-b-4 border-l-4', dx: 1, dy: -1 },
  { key: 'se', className: 'right-0 bottom-0 border-r-4 border-b-4', dx: -1, dy: -1 },
] as const;

/** The crop-mark motif: four accent L-corners. `breathe` drifts them inward, `snap` flies them in. */
export const CropCorners = ({ motion, inset = 24, size = 40 }: { motion: CornerMotion; inset?: number; size?: number }) => (
  <div aria-hidden="true" className="pointer-events-none absolute" style={{ inset }}>
    {CORNER_POSITIONS.map((corner) => {
      // Breathe drifts 6px inward; snap starts 40px outside.
      const distance = motion === 'snap' ? -40 : 6;
      const style = {
        width: size,
        height: size,
        '--dx': `${corner.dx * distance}px`,
        '--dy': `${corner.dy * distance}px`,
        animation:
          motion === 'breathe'
            ? 'lc-breathe 3.2s var(--ease-std) infinite'
            : motion === 'snap'
              ? 'lc-snap .32s var(--ease-out) both'
              : undefined,
      } as CSSProperties;
      return <span key={corner.key} className={cn('absolute border-accent', corner.className)} style={style} />;
    })}
  </div>
);

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
    <div className="pointer-events-none fixed inset-0 z-50 bg-app/90 backdrop-blur-[2px]">
      <CropCorners motion="snap" inset={16} size={48} />
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center [animation:lc-rise_.32s_var(--ease-out)]">
        <p className="text-[52px] leading-none font-[650] tracking-[-.035em] max-lg:text-4xl">Drop to add images</p>
        <p className="flex items-center gap-1.5 text-sm text-ink-2">
          <Icon name="lock" className="size-3.5 text-success" /> Files and folders are read locally — nothing is uploaded.
        </p>
      </div>
    </div>
  );
};

type FilePickersProps = { variant?: 'hero' | 'header' | 'icons' };

/** "Add files" and "Add folder" buttons with their hidden inputs. */
export const FilePickers = ({ variant = 'hero' }: FilePickersProps) => {
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

  const inputs = (
    <>
      <input ref={fileInput} type="file" accept={FILE_INPUT_ACCEPT} multiple hidden onChange={handleChange} aria-label="Choose image files" />
      <input ref={folderInput} type="file" multiple hidden onChange={handleChange} aria-label="Choose a folder of images" />
    </>
  );

  if (variant === 'icons') {
    return (
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" onClick={() => fileInput.current?.click()} aria-label="Add files">
          <Icon name="upload" />
        </Button>
        {inputs}
      </div>
    );
  }

  const header = variant === 'header';
  return (
    <div className="flex gap-2">
      <Button variant={header ? 'secondary' : 'primary'} size={header ? 'md' : 'lg'} onClick={() => fileInput.current?.click()}>
        <Icon name="upload" /> Add files
      </Button>
      <Button size={header ? 'md' : 'lg'} onClick={() => folderInput.current?.click()} className={cn({ 'max-sm:hidden': !header })}>
        <Icon name="folder" /> Add folder
      </Button>
      {inputs}
    </div>
  );
};

/** The empty state: the whole stage is the drop zone, framed by breathing crop corners. */
export const EmptyDropZone = () => (
  <div className="relative flex min-h-[56vh] flex-1 items-center overflow-hidden rounded-lg bg-sunken bg-[radial-gradient(var(--color-dot)_1px,transparent_1px)] bg-size-[16px_16px] max-lg:rounded-none">
    <CropCorners motion="breathe" inset={24} />
    <div className="mx-auto w-full max-w-xl px-10 py-16 max-lg:px-8">
      <h2 className="text-[52px] leading-[1.02] font-[650] tracking-[-.035em] max-lg:text-[38px]">
        Drop, paste, or pick images.
        <br />
        <span className="text-ink-3">Nothing leaves your device.</span>
      </h2>
      <div className="mt-8 flex flex-wrap items-center gap-2">
        <FilePickers variant="hero" />
        <UrlInput variant="hero" />
      </div>
      <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-3">
        <span className="flex items-center gap-1.5 max-lg:hidden">
          <Keycap>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘V' : 'Ctrl V'}</Keycap> paste an image or URL
        </span>
        <span>Folders work too</span>
        <span className="font-mono">{SUPPORTED_FORMAT_LABELS.join(' · ')}</span>
      </p>
    </div>
  </div>
);

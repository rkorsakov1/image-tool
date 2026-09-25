import { useEffect, useRef } from 'react';
import { cn } from '../../lib/cn';
import { formatBytes } from '../../lib/format';
import type { QueueItem } from '../../lib/types';
import { useApp } from '../../state/AppContext';
import { FilePickers } from '../input/DropZone';
import { UrlInput } from '../input/UrlInput';
import { Button, focusRing } from '../ui/Button';
import { Icon } from '../ui/Icon';

const THUMB_SIZE = 44;

const Thumbnail = ({ bitmap }: { bitmap: ImageBitmap }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const ratio = window.devicePixelRatio || 1;
    const scale = Math.min((THUMB_SIZE * ratio) / bitmap.width, (THUMB_SIZE * ratio) / bitmap.height);
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }, [bitmap]);
  return <canvas ref={canvasRef} aria-hidden="true" className="max-h-11 max-w-11 rounded-sm" />;
};

const STATUS_LABEL: Record<QueueItem['status'], string> = {
  idle: 'Waiting',
  encoding: 'Encoding…',
  ready: 'Ready',
  error: 'Error',
};

const statusText = (item: QueueItem): string => {
  if (item.status === 'error') return item.error ?? 'Error';
  if (item.output && item.outputRevision === item.revision) return formatBytes(item.output.blob.size);
  if (item.output) return `${formatBytes(item.output.blob.size)} (outdated)`;
  return STATUS_LABEL[item.status];
};

export const QueuePanel = () => {
  const { state, dispatch, removeItem } = useApp();

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <FilePickers compact />
      <UrlInput />

      {state.items.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Images ({state.items.length})
            </h2>
            <span className="text-[11px] text-slate-400">
              <kbd>N</kbd>/<kbd>P</kbd> next/prev
            </span>
          </div>
          <ul aria-label="Image queue" className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1 py-1">
            {state.items.map((item, index) => {
              const selected = item.id === state.selectedId;
              return (
                <li key={item.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    aria-current={selected ? 'true' : undefined}
                    aria-label={`${index + 1}. ${item.sourceName}, ${statusText(item)}`}
                    onClick={() => dispatch({ type: 'selectItem', id: item.id })}
                    className={cn('flex min-w-0 flex-1 items-center gap-2 rounded-md p-1.5 text-left', focusRing, {
                      'bg-sky-100 dark:bg-sky-900/50': selected,
                      'hover:bg-slate-100 dark:hover:bg-slate-800': !selected,
                    })}
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center">
                      <Thumbnail bitmap={item.editedBitmap ?? item.sourceBitmap} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{item.sourceName}</span>
                      <span
                        className={cn('block truncate text-xs tabular-nums', {
                          'text-red-600 dark:text-red-400': item.status === 'error',
                          'text-slate-500 dark:text-slate-400': item.status !== 'error',
                        })}
                      >
                        {statusText(item)}
                      </span>
                    </span>
                  </button>
                  <Button size="sm" variant="ghost" aria-label={`Remove ${item.sourceName}`} onClick={() => removeItem(item.id)}>
                    <Icon name="close" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">Drop images or folders anywhere, or paste with Ctrl/Cmd+V.</p>
      )}
    </div>
  );
};

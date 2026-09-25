import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { renderFilename } from '../lib/filenameTemplate';
import { formatBytes } from '../lib/format';
import type { EncodedOutput, QueueItem } from '../lib/types';
import { createWorkerClient, type Processor } from '../worker/workerClient';
import { appReducer, createInitialState, getItemPreset, type AppAction, type AppState, type Notice } from './appReducer';
import { decodeImage, LARGE_IMAGE_PIXELS, type DecodeFailure } from './ingest';
import { loadPersistedState, savePersistedState } from './storage';

type AppContextValue = {
  state: AppState;
  dispatch: (action: AppAction) => void;
  processor: Processor;
  selectedItem: QueueItem | null;
  addFiles: (files: readonly (File | { blob: Blob; name: string })[]) => Promise<void>;
  removeItem: (id: string) => void;
  notify: (tone: Notice['tone'], message: string, action?: Notice['action']) => void;
  /** Filename from the preset's template; pass `output` when it isn't stored on the item yet. */
  outputFilename: (item: QueueItem, output?: EncodedOutput | null) => string;
  downloadItem: (item: QueueItem) => void;
  /** Sets (or with null, reverts) an item's retouched image and frees the previous one. */
  replaceEditedBitmap: (id: string, bitmap: ImageBitmap | null) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export const useApp = (): AppContextValue => {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>.');
  return value;
};

const releaseItem = (item: QueueItem): void => {
  if (item.output) URL.revokeObjectURL(item.output.url);
  item.sourceBitmap.close();
  item.editedBitmap?.close();
};

export const triggerDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(appReducer, undefined, () => createInitialState(loadPersistedState()));
  const processor = useMemo(() => createWorkerClient(), []);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const saved = savePersistedState({ presets: state.presets, lastPresetId: state.lastPresetId, prefs: state.prefs });
    if (!saved) console.warn('Could not save presets to localStorage.');
  }, [state.presets, state.lastPresetId, state.prefs]);

  // Release everything still held when the app unmounts.
  useEffect(() => () => stateRef.current.items.forEach(releaseItem), []);

  const notify = useCallback((tone: Notice['tone'], message: string, action?: Notice['action']) => {
    dispatch({ type: 'notify', notice: { id: crypto.randomUUID(), tone, message, action } });
  }, []);

  const addFiles = useCallback<AppContextValue['addFiles']>(
    async (files) => {
      const failures: DecodeFailure[] = [];
      const decoded = await Promise.all(
        files.map(async (file) => {
          const blob = file instanceof File ? file : file.blob;
          const name = file.name;
          try {
            return await decodeImage(blob, name);
          } catch (error) {
            failures.push({ name, message: error instanceof Error ? error.message : String(error) });
            return null;
          }
        }),
      );

      const items = decoded.flatMap((image) => {
        if (!image) return [];
        if (image.bitmap.width * image.bitmap.height > LARGE_IMAGE_PIXELS) {
          const megapixels = Math.round((image.bitmap.width * image.bitmap.height) / 1_000_000);
          notify('warning', `${image.name} is ${megapixels} MP. Very large images may hit browser memory limits.`);
        }
        return [
          { id: crypto.randomUUID(), sourceName: image.name, sourceBytes: image.bytes, sourceType: image.type, sourceBitmap: image.bitmap },
        ];
      });

      dispatch({ type: 'addItems', items });
      for (const failure of failures) notify('error', `${failure.name}: ${failure.message}`);
      if (items.length > 0) {
        dispatch({ type: 'announce', message: `Added ${items.length} image${items.length === 1 ? '' : 's'}.` });
      }
    },
    [notify],
  );

  const removeItem = useCallback((id: string) => {
    const item = stateRef.current.items.find((candidate) => candidate.id === id);
    if (!item) return;
    dispatch({ type: 'removeItem', id });
    releaseItem(item);
  }, []);

  const outputFilename = useCallback((item: QueueItem, output: EncodedOutput | null = item.output): string => {
    const current = stateRef.current;
    const preset = getItemPreset(current, item);
    const index = current.items.findIndex((candidate) => candidate.id === item.id);
    return renderFilename(preset.filenameTemplate, {
      sourceName: item.sourceName,
      width: output?.width ?? preset.width ?? item.sourceBitmap.width,
      height: output?.height ?? preset.height ?? item.sourceBitmap.height,
      presetName: preset.name,
      index: index + 1,
      queueLength: current.items.length,
      format: preset.format,
    });
  }, []);

  const downloadItem = useCallback(
    (item: QueueItem) => {
      if (!item.output || item.outputRevision !== item.revision) return;
      const filename = outputFilename(item);
      triggerDownload(item.output.blob, filename);
      dispatch({ type: 'addSavings', before: item.sourceBytes, after: item.output.blob.size, count: 1 });
      dispatch({ type: 'announce', message: `Downloaded ${filename}, ${formatBytes(item.output.blob.size)}.` });
    },
    [outputFilename],
  );

  const replaceEditedBitmap = useCallback((id: string, bitmap: ImageBitmap | null) => {
    const previous = stateRef.current.items.find((item) => item.id === id)?.editedBitmap ?? null;
    dispatch({ type: 'setEditedBitmap', id, bitmap });
    // Close after React has re-rendered with the new bitmap, so nothing draws a closed one.
    if (previous && previous !== bitmap) setTimeout(() => previous.close(), 1000);
  }, []);

  const selectedItem = state.items.find((item) => item.id === state.selectedId) ?? null;

  const value = useMemo<AppContextValue>(
    () => ({ state, dispatch, processor, selectedItem, addFiles, removeItem, notify, outputFilename, downloadItem, replaceEditedBitmap }),
    [state, processor, selectedItem, addFiles, removeItem, notify, outputFilename, downloadItem, replaceEditedBitmap],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

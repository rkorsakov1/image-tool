import { useEffect, useState } from 'react';
import { CanvasArea, MODES } from './components/layout/CanvasArea';
import { Footer } from './components/layout/Footer';
import { Notices } from './components/layout/Notices';
import { QueuePanel } from './components/layout/QueuePanel';
import { SettingsPanel } from './components/layout/SettingsPanel';
import { ShortcutsDialog } from './components/layout/ShortcutsDialog';
import { WindowDropTarget } from './components/input/DropZone';
import { PasteListener } from './components/input/PasteListener';
import { SharedPresetDialog } from './components/presets/SharedPresetDialog';
import { Button } from './components/ui/Button';
import { useDebouncedEncode } from './hooks/useDebouncedEncode';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { cn } from './lib/cn';
import { consumeLaunchedFiles, registerServiceWorker } from './pwa/registerServiceWorker';
import { AppProvider, useApp } from './state/AppContext';

const Shell = () => {
  const { state, dispatch, selectedItem, downloadItem, addFiles, notify } = useApp();
  const reference = useDebouncedEncode();
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    registerServiceWorker((activate) => notify('info', 'A new version of LocalCrop is available.', { label: 'Reload', run: activate }));
    consumeLaunchedFiles((files) => void addFiles(files));
  }, [addFiles, notify]);

  useKeyboardShortcuts({
    download: () => {
      if (selectedItem) downloadItem(selectedItem);
    },
    next: () => dispatch({ type: 'selectRelative', offset: 1 }),
    previous: () => dispatch({ type: 'selectRelative', offset: -1 }),
    resetCrop: () => {
      if (selectedItem) dispatch({ type: 'setCrop', id: selectedItem.id, crop: null });
    },
    setMode: (mode) => {
      if (MODES.some((entry) => entry.mode === mode)) dispatch({ type: 'setMode', mode });
    },
    help: () => setHelpOpen(true),
  });

  const hasItems = state.items.length > 0;

  return (
    <div className="flex min-h-dvh flex-col bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100 lg:h-dvh">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
        <h1 className="text-base font-semibold tracking-tight">LocalCrop</h1>
        <p className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">Crop, resize and compress images — privately, in your browser.</p>
      </header>

      <main
        className={cn('grid min-h-0 flex-1 gap-4 p-4', {
          'lg:grid-cols-[16rem_minmax(0,1fr)_20rem]': hasItems,
          'lg:grid-cols-[16rem_minmax(0,1fr)]': !hasItems,
        })}
      >
        <section aria-label="Images" className="min-h-0 lg:overflow-hidden">
          <QueuePanel />
        </section>

        <section aria-label="Editor" className="min-h-[60vh] lg:min-h-0">
          <CanvasArea reference={reference} />
        </section>

        {hasItems ? (
          <section aria-label="Output settings" className="min-h-0 lg:overflow-y-auto lg:pr-1">
            <Button
              className="mb-3 w-full lg:hidden"
              aria-expanded={settingsOpen}
              aria-controls="settings-body"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              {settingsOpen ? 'Hide settings' : 'Show settings'}
            </Button>
            <div id="settings-body" className={cn('lg:block', { hidden: !settingsOpen })}>
              <SettingsPanel />
            </div>
          </section>
        ) : null}
      </main>

      <Footer onShowShortcuts={() => setHelpOpen(true)} />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <SharedPresetDialog />
      <Notices />
      <WindowDropTarget />
      <PasteListener />
    </div>
  );
};

export const App = () => (
  <AppProvider>
    <Shell />
  </AppProvider>
);

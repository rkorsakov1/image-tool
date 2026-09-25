import { useEffect } from 'react';
import { isTextEntryTarget } from '../../hooks/useKeyboardShortcuts';
import { useApp } from '../../state/AppContext';
import { looksLikeUrl } from '../../state/ingest';
import { useUrlLoader } from './UrlInput';

const extensionFor = (type: string): string => type.split('/')[1]?.replace('jpeg', 'jpg').replace('+xml', '') ?? 'png';

/** Global Ctrl/Cmd+V: image data is added to the queue; a pasted URL is fetched. */
export const PasteListener = () => {
  const { addFiles } = useApp();
  const { load } = useUrlLoader();

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      if (isTextEntryTarget(event.target)) return;
      const data = event.clipboardData;
      if (!data) return;

      const images = Array.from(data.items)
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (images.length > 0) {
        event.preventDefault();
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        void addFiles(
          images.map((file, index) => ({
            blob: file,
            // Clipboard images are usually called "image.png"; give them a distinguishable name.
            name: file.name && file.name !== 'image.png' ? file.name : `pasted-${stamp}${images.length > 1 ? `-${index + 1}` : ''}.${extensionFor(file.type)}`,
          })),
        );
        return;
      }

      const text = data.getData('text/plain').trim();
      if (looksLikeUrl(text)) {
        event.preventDefault();
        void load(text);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [addFiles, load]);

  return null;
};

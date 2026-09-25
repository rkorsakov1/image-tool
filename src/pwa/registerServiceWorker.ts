/**
 * Registers /sw.js in production builds. When a new version has installed while this page is
 * open, `onUpdateReady` gets a function that activates it and reloads.
 */
export const registerServiceWorker = (onUpdateReady: (activate: () => void) => void): void => {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  const activate = (worker: ServiceWorker) => () => {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    worker.postMessage('skip-waiting');
  };

  const watch = (registration: ServiceWorkerRegistration) => {
    if (registration.waiting && navigator.serviceWorker.controller) onUpdateReady(activate(registration.waiting));
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        // Only an *update* if a previous worker controls the page; the first install needs no prompt.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) onUpdateReady(activate(installing));
      });
    });
  };

  const register = () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then(watch)
      .catch((error: unknown) => console.warn('Service worker registration failed; offline use is unavailable.', error));
  };

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
};

type LaunchParams = { files: readonly FileSystemFileHandle[] };
type WindowWithLaunchQueue = Window & { launchQueue?: { setConsumer: (consumer: (params: LaunchParams) => void) => void } };

/** Receives files opened with the installed app ("Open with…", manifest file_handlers; Chromium). */
export const consumeLaunchedFiles = (onFiles: (files: File[]) => void): void => {
  const queue = (window as WindowWithLaunchQueue).launchQueue;
  if (!queue) return;
  queue.setConsumer((params) => {
    if (params.files.length === 0) return;
    void Promise.all(params.files.map((handle) => handle.getFile())).then(onFiles);
  });
};

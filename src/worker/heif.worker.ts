/// <reference lib="webworker" />
// Decodes HEIC/HEIF with the vendored libheif build (public/vendor/libheif@…). Runs in a worker
// because Chrome refuses to compile a large WebAssembly module synchronously on the main thread.

declare const self: DedicatedWorkerGlobalScope;

export const LIBHEIF_PATH = 'vendor/libheif@1.23.2/libheif-bundle.mjs';

type HeifImage = {
  get_width: () => number;
  get_height: () => number;
  display: (target: { data: Uint8ClampedArray; width: number; height: number }, done: (result: unknown) => void) => void;
  free?: () => void;
};
type Libheif = { HeifDecoder: new () => { decode: (data: Uint8Array) => HeifImage[] } };

export type HeifRequest = { id: number; buffer: ArrayBuffer };
export type HeifResponse = { id: number; width: number; height: number; data: ArrayBuffer } | { id: number; error: string };

let libheif: Promise<Libheif> | null = null;

const load = (): Promise<Libheif> => {
  libheif ??= (async () => {
    const url = new URL(LIBHEIF_PATH, new URL(import.meta.env.BASE_URL, self.location.origin)).href;
    const module = (await import(/* @vite-ignore */ url)) as { default: (options?: object) => Libheif | Promise<Libheif> };
    const instance = await module.default();
    // Emscripten modules may expose `ready` until the runtime is initialized.
    const ready = (instance as unknown as { ready?: Promise<unknown> }).ready;
    if (ready) await ready;
    return instance;
  })();
  return libheif;
};

self.addEventListener('message', async (event: MessageEvent<HeifRequest>) => {
  const { id, buffer } = event.data;
  try {
    const lib = await load();
    const images = new lib.HeifDecoder().decode(new Uint8Array(buffer));
    const image = images[0];
    if (!image) throw new Error('No image found in the HEIF file.');
    const width = image.get_width();
    const height = image.get_height();
    const pixels = new Uint8ClampedArray(width * height * 4);
    await new Promise<void>((resolve, reject) =>
      image.display({ data: pixels, width, height }, (result) => (result ? resolve() : reject(new Error('HEIF decoding failed.')))),
    );
    for (const entry of images) entry.free?.();
    self.postMessage({ id, width, height, data: pixels.buffer } satisfies HeifResponse, [pixels.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) } satisfies HeifResponse);
  }
});

// Getting images into the app: decoding, folder traversal, URL fetch.

const IMAGE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp', 'png', 'apng', 'webp', 'avif', 'gif', 'bmp', 'dib', 'ico', 'cur', 'svg',
  'tif', 'tiff', 'tga', 'pbm', 'pgm', 'ppm', 'pnm', 'pam', 'qoi', 'heic', 'heif', 'jxl',
]);

/** For <input type=file accept>: image/* alone hides .tga, .qoi, .pnm and (on some systems) .heic. */
export const FILE_INPUT_ACCEPT = ['image/*', ...[...IMAGE_EXTENSIONS].map((extension) => `.${extension}`)].join(',');

/** Shown in the empty state. */
export const SUPPORTED_FORMAT_LABELS = ['JPEG', 'PNG', 'WebP', 'AVIF', 'HEIC', 'GIF', 'TIFF', 'BMP', 'SVG', 'ICO', 'TGA', 'QOI', 'PNM'];
export const LARGE_IMAGE_PIXELS = 50_000_000;

export type Decoded = { bitmap: ImageBitmap; name: string; bytes: number; type: string };
export type DecodeFailure = { name: string; message: string };

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return '';
  return name.slice(dot + 1).toLowerCase();
};

/** Quick filter for folder contents: skips obvious non-images like .DS_Store or .txt. */
export const looksLikeImageFile = (file: File): boolean =>
  file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(extensionOf(file.name));

const unsupportedMessage = (name: string, type: string): string => {
  const extension = extensionOf(name);
  if (type.includes('heic') || type.includes('heif') || extension === 'heic' || extension === 'heif') {
    return 'HEIC images can only be opened in Safari. Convert to JPEG first, or use Safari.';
  }
  return 'Unsupported format. Supported: JPEG, PNG, WebP, AVIF, GIF (first frame), BMP.';
};

/** Decodes with EXIF orientation applied. GIFs decode their first frame. */
export const decodeImage = async (blob: Blob, name: string): Promise<Decoded> => {
  if (blob.type && !blob.type.startsWith('image/')) throw new Error(unsupportedMessage(name, blob.type));
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    return { bitmap, name, bytes: blob.size, type: blob.type };
  } catch {
    throw new Error(unsupportedMessage(name, blob.type));
  }
};

const readEntries = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
  new Promise((resolve, reject) => reader.readEntries(resolve, reject));

const entryToFile = (entry: FileSystemFileEntry): Promise<File> => new Promise((resolve, reject) => entry.file(resolve, reject));

const walkEntry = async (entry: FileSystemEntry): Promise<File[]> => {
  if (entry.isFile) {
    const file = await entryToFile(entry as FileSystemFileEntry);
    return looksLikeImageFile(file) ? [file] : [];
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const files: File[] = [];
  // readEntries returns results in batches; keep reading until it returns none.
  for (;;) {
    const batch = await readEntries(reader);
    if (batch.length === 0) break;
    for (const child of batch) files.push(...(await walkEntry(child)));
  }
  return files;
};

/** Natural order by folder path then name, so "Frame 2" comes before "Frame 10". */
export const compareFilePaths = (a: File, b: File): number =>
  (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true });

/** Files from a drop, recursing into dropped folders. Sorted by path within each folder. */
export const collectDroppedFiles = async (dataTransfer: DataTransfer): Promise<File[]> => {
  const items = Array.from(dataTransfer.items).filter((item) => item.kind === 'file');
  const entries = items.map((item) => item.webkitGetAsEntry?.() ?? null);
  if (entries.every((entry) => entry === null)) return Array.from(dataTransfer.files);

  const files: File[] = [];
  for (const [index, entry] of entries.entries()) {
    if (entry) {
      const found = await walkEntry(entry);
      if (entry.isDirectory) found.sort(compareFilePaths);
      files.push(...found);
      continue;
    }
    const file = items[index]?.getAsFile();
    if (file) files.push(file);
  }
  return files;
};

export const looksLikeUrl = (text: string): boolean => {
  const trimmed = text.trim();
  if (!/^https?:\/\//i.test(trimmed) || /\s/.test(trimmed)) return false;
  try {
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
};

export const CORS_FAILURE_MESSAGE =
  "This site doesn't allow direct loading. Right-click the image → Copy image, then paste here.";

const nameFromUrl = (url: URL, type: string): string => {
  const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
  if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return last;
  const extension = type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'img';
  return `${last || url.hostname}.${extension}`;
};

/** Best-effort fetch. Most sites block cross-origin reads; the caller shows CORS_FAILURE_MESSAGE. */
export const fetchImageFromUrl = async (input: string): Promise<{ blob: Blob; name: string }> => {
  const url = new URL(input.trim());
  let response: Response;
  try {
    response = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
  } catch {
    throw new Error(CORS_FAILURE_MESSAGE);
  }
  if (!response.ok) throw new Error(`The server answered ${response.status} ${response.statusText}.`.trim());
  const blob = await response.blob();
  if (blob.type && !blob.type.startsWith('image/')) throw new Error(`That URL returned ${blob.type}, not an image.`);
  return { blob, name: nameFromUrl(url, blob.type) };
};

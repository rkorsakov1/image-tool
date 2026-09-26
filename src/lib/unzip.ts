// ZIP reader for "drop a .zip of images": stored and deflate entries, ZIP64 sizes/offsets.
// Deflate uses the browser's DecompressionStream, so no dependency is needed.

export type UnzippedFile = { path: string; data: Uint8Array };

/** Limits against zip bombs: per entry and in total, uncompressed. */
export const MAX_ENTRY_BYTES = 512 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export const isZip = (head: Uint8Array): boolean => head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;

const decodeName = (bytes: Uint8Array, utf8: boolean): string => {
  try {
    return new TextDecoder('utf-8', { fatal: !utf8 }).decode(bytes);
  } catch {
    // Not UTF-8 and not flagged: old tools write CP437; Latin-1 keeps ASCII names intact.
    return new TextDecoder('latin1').decode(bytes);
  }
};

const inflateRaw = async (data: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** Reads 64-bit little-endian values that fit in a double (up to 2^53). */
const getUint64 = (view: DataView, offset: number): number => view.getUint32(offset, true) + view.getUint32(offset + 4, true) * 2 ** 32;

type CentralEntry = { path: string; method: number; compressed: number; size: number; offset: number; encrypted: boolean };

const readCentralDirectory = (view: DataView): CentralEntry[] => {
  // The end-of-central-directory record is in the last 64 KB + 22 bytes (after an optional comment).
  let eocd = -1;
  for (let at = view.byteLength - 22; at >= Math.max(0, view.byteLength - 65_557); at -= 1) {
    if (view.getUint32(at, true) === EOCD) {
      eocd = at;
      break;
    }
  }
  if (eocd === -1) throw new Error('This isn’t a valid ZIP file.');

  let count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (eocd >= 20 && view.getUint32(eocd - 20, true) === ZIP64_LOCATOR) {
    const record = getUint64(view, eocd - 12);
    if (view.getUint32(record, true) === ZIP64_EOCD) {
      count = getUint64(view, record + 32);
      offset = getUint64(view, record + 48);
    }
  }

  const entries: CentralEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL) throw new Error('The ZIP file is damaged.');
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    let compressed = view.getUint32(offset + 20, true);
    let size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    let localOffset = view.getUint32(offset + 42, true);
    const name = new Uint8Array(view.buffer, view.byteOffset + offset + 46, nameLength);

    // ZIP64 extra field (0x0001) holds whichever values overflowed 32 bits, in this order.
    let extra = offset + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = view.getUint16(extra, true);
      const length = view.getUint16(extra + 2, true);
      if (id === 0x0001) {
        let field = extra + 4;
        if (size === 0xffffffff) {
          size = getUint64(view, field);
          field += 8;
        }
        if (compressed === 0xffffffff) {
          compressed = getUint64(view, field);
          field += 8;
        }
        if (localOffset === 0xffffffff) localOffset = getUint64(view, field);
      }
      extra += 4 + length;
    }

    entries.push({ path: decodeName(name, (flags & 0x0800) !== 0), method, compressed, size, offset: localOffset, encrypted: (flags & 1) !== 0 });
    offset = extraEnd + commentLength;
  }
  return entries;
};

/** Skips folders, macOS resource forks and hidden files. */
const isJunk = (path: string): boolean => path.endsWith('/') || path.startsWith('__MACOSX/') || path.split('/').some((part) => part.startsWith('.'));

/** Unpacks the entries that `keep` accepts (by path), in archive order. */
export const unzip = async (buffer: ArrayBuffer, keep: (path: string) => boolean = () => true): Promise<UnzippedFile[]> => {
  const view = new DataView(buffer);
  const files: UnzippedFile[] = [];
  let total = 0;
  for (const entry of readCentralDirectory(view)) {
    if (isJunk(entry.path) || !keep(entry.path)) continue;
    if (entry.encrypted) throw new Error(`${entry.path} is password-protected, which isn’t supported.`);
    if (entry.size > MAX_ENTRY_BYTES || (total += entry.size) > MAX_TOTAL_BYTES) throw new Error('This ZIP unpacks to more than the browser can safely hold.');
    const at = entry.offset;
    if (view.getUint32(at, true) !== LOCAL) throw new Error('The ZIP file is damaged.');
    const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
    const raw = new Uint8Array(buffer, start, entry.compressed);
    if (entry.method === 0) files.push({ path: entry.path, data: raw.slice() });
    else if (entry.method === 8) files.push({ path: entry.path, data: await inflateRaw(raw) });
    else throw new Error(`${entry.path} uses a compression method (${entry.method}) that isn’t supported.`);
  }
  return files;
};

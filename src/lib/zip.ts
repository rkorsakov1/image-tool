// Store-only (method 0) ZIP writer. Images are already compressed, so deflate would only cost time.
// Layout: [local header + name + data]… [central directory entries]… [end of central directory].

import { crc32 } from './crc32';
import { dedupeFilenames } from './filenameTemplate';

export type ZipEntry = { name: string; data: Uint8Array };

const ZIP32_LIMIT = 0xffffffff;
const MAX_ENTRIES = 0xffff;
const UTF8_FLAG = 0x0800;
const VERSION = 20; // 2.0: needed for folders/UTF-8 flag; store needs 1.0 but 2.0 is what tools expect.

/** MS-DOS date/time (local time, 2-second resolution, years 1980–2107). */
export const toDosDateTime = (date: Date): { time: number; date: number } => {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
};

const localHeader = (name: Uint8Array, crc: number, size: number, dos: { time: number; date: number }): Uint8Array => {
  const header = new Uint8Array(30 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, VERSION, true);
  view.setUint16(6, UTF8_FLAG, true);
  view.setUint16(8, 0, true); // method: store
  view.setUint16(10, dos.time, true);
  view.setUint16(12, dos.date, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true); // compressed size
  view.setUint32(22, size, true); // uncompressed size
  view.setUint16(26, name.length, true);
  view.setUint16(28, 0, true); // extra length
  header.set(name, 30);
  return header;
};

const centralHeader = (
  name: Uint8Array,
  crc: number,
  size: number,
  offset: number,
  dos: { time: number; date: number },
): Uint8Array => {
  const header = new Uint8Array(46 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, VERSION, true); // version made by (MS-DOS attributes)
  view.setUint16(6, VERSION, true); // version needed
  view.setUint16(8, UTF8_FLAG, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, dos.time, true);
  view.setUint16(14, dos.date, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, name.length, true);
  view.setUint16(30, 0, true); // extra
  view.setUint16(32, 0, true); // comment
  view.setUint16(34, 0, true); // disk number
  view.setUint16(36, 0, true); // internal attributes
  view.setUint32(38, 0, true); // external attributes
  view.setUint32(42, offset, true);
  header.set(name, 46);
  return header;
};

const endOfCentralDirectory = (count: number, size: number, offset: number): Uint8Array => {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, size, true);
  view.setUint32(16, offset, true);
  return record;
};

/** Returns the ZIP as parts (useful for tests) — see createZip for a Blob. */
export const createZipParts = (entries: readonly ZipEntry[], modified = new Date()): Uint8Array[] => {
  if (entries.length > MAX_ENTRIES) throw new Error(`Too many files for a ZIP (${entries.length}; the limit is ${MAX_ENTRIES}).`);
  const encoder = new TextEncoder();
  const dos = toDosDateTime(modified);
  const names = dedupeFilenames(entries.map((entry) => entry.name.replace(/\\/g, '/').replace(/^\/+/, '')));

  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry, index) => {
    const name = encoder.encode(names[index] as string);
    const crc = crc32(entry.data);
    const header = localHeader(name, crc, entry.data.length, dos);
    if (offset + header.length + entry.data.length > ZIP32_LIMIT) {
      throw new Error('The export is larger than 4 GB, which a standard ZIP can’t hold. Export fewer images at a time.');
    }
    central.push(centralHeader(name, crc, entry.data.length, offset, dos));
    parts.push(header, entry.data);
    offset += header.length + entry.data.length;
  });

  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  if (offset + centralSize > ZIP32_LIMIT) {
    throw new Error('The export is larger than 4 GB, which a standard ZIP can’t hold. Export fewer images at a time.');
  }
  return [...parts, ...central, endOfCentralDirectory(entries.length, centralSize, offset)];
};

export const createZip = (entries: readonly ZipEntry[], modified = new Date()): Blob =>
  new Blob(createZipParts(entries, modified) as BlobPart[], { type: 'application/zip' });

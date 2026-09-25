import { describe, expect, it } from 'vitest';
import { crc32 } from './crc32';
import { createZipParts, toDosDateTime } from './zip';

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

/** Minimal reader that walks the central directory the way unzip tools do. */
const readZip = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const files: { name: string; data: Uint8Array; crc: number; flags: number }[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    expect(view.getUint32(cursor, true)).toBe(0x02014b50);
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    expect(method).toBe(0);
    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const dataStart = localOffset + 30 + localNameLength;
    files.push({ name, data: bytes.subarray(dataStart, dataStart + size), crc, flags });
    cursor += 46 + nameLength;
  }
  return files;
};

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32('123456789')).toBe(0xcbf43926);
  });

  it('is 0 for empty input', () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('createZipParts', () => {
  it('writes readable store-only entries with CRCs and UTF-8 names', () => {
    const entries = [
      { name: 'a.jpg', data: new Uint8Array([1, 2, 3]) },
      { name: 'ümlaut-日本.webp', data: new TextEncoder().encode('hello') },
    ];
    const files = readZip(concat(createZipParts(entries, new Date(2024, 4, 1, 10, 30, 12))));
    expect(files.map((file) => file.name)).toEqual(['a.jpg', 'ümlaut-日本.webp']);
    expect(Array.from(files[0]?.data ?? [])).toEqual([1, 2, 3]);
    expect(files[1]?.crc).toBe(crc32('hello'));
    expect(files.every((file) => (file.flags & 0x0800) !== 0)).toBe(true);
  });

  it('deduplicates names', () => {
    const entries = [
      { name: 'x.png', data: new Uint8Array([1]) },
      { name: 'x.png', data: new Uint8Array([2]) },
    ];
    expect(readZip(concat(createZipParts(entries))).map((file) => file.name)).toEqual(['x.png', 'x-2.png']);
  });

  it('handles an empty archive', () => {
    const bytes = concat(createZipParts([]));
    expect(bytes.length).toBe(22);
    expect(readZip(bytes)).toEqual([]);
  });
});

describe('toDosDateTime', () => {
  it('packs date and time', () => {
    const { date, time } = toDosDateTime(new Date(2024, 4, 1, 10, 30, 12));
    expect(date).toBe(((2024 - 1980) << 9) | (5 << 5) | 1);
    expect(time).toBe((10 << 11) | (30 << 5) | 6);
  });
});

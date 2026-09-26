import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { isZip, unzip } from './unzip';
import { createZip } from './zip';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('unzip', () => {
  it('round-trips our own (stored) ZIP writer', async () => {
    const blob = createZip([
      { name: 'one.jpg', data: bytes('first') },
      { name: 'dir/two.png', data: bytes('second') },
    ]);
    const files = await unzip(await blob.arrayBuffer());
    expect(files.map((file) => [file.path, new TextDecoder().decode(file.data)])).toEqual([
      ['one.jpg', 'first'],
      ['dir/two.png', 'second'],
    ]);
  });

  it('reads deflate entries and UTF-8 names from Python’s zipfile, skipping junk', async () => {
    const file = await readFile(new URL('./decoders/fixtures/images.zip', import.meta.url));
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    expect(isZip(new Uint8Array(buffer))).toBe(true);
    const files = await unzip(buffer, (path) => path.endsWith('.png'));
    expect(files.map((entry) => entry.path)).toEqual(['photos/a.png', 'photos/Ünïcode 2.png']);
    // Both are the same PNG; the deflated one must inflate to identical bytes.
    expect(files[1]?.data).toEqual(files[0]?.data);
  });
});

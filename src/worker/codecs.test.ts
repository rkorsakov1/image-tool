import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { encodeRaw, setWasmBinaryLoader } from './codecs';

beforeAll(() => {
  // In Node the glue can't fetch bundler asset URLs; hand it the bytes from disk instead.
  setWasmBinaryLoader(async (vendorPath) => {
    const bytes = await readFile(new URL(`../vendor/jsquash/${vendorPath}`, import.meta.url));
    return bytes.slice().buffer;
  });
});

const gradient = (width: number, height: number) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = (x * 255) / width;
      data[offset + 1] = (y * 255) / height;
      data[offset + 2] = 128;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
};

/** Lists the JPEG marker bytes (0xFFxx) of every segment before the scan data. */
const jpegMarkers = (bytes: Uint8Array): number[] => {
  const markers: number[] = [];
  let offset = 2; // skip SOI
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error(`Bad marker at ${offset}`);
    const marker = bytes[offset + 1] as number;
    markers.push(marker);
    if (marker === 0xda) break; // SOS: entropy-coded data follows
    const length = ((bytes[offset + 2] as number) << 8) | (bytes[offset + 3] as number);
    offset += 2 + length;
  }
  return markers;
};

describe('MozJPEG output', () => {
  it('contains no APP1 (EXIF/XMP) segment', async () => {
    const buffer = await encodeRaw('jpeg', gradient(64, 48), 80);
    const bytes = new Uint8Array(buffer);
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
    const markers = jpegMarkers(bytes);
    expect(markers).toContain(0xda);
    expect(markers).not.toContain(0xe1);
    expect(markers).not.toContain(0xed); // APP13 (IPTC)
  });

  it('gets smaller at lower quality', async () => {
    const image = gradient(128, 96);
    const high = await encodeRaw('jpeg', image, 95);
    const low = await encodeRaw('jpeg', image, 30);
    expect(low.byteLength).toBeLessThan(high.byteLength);
  });
});

// QOI, "The Quite OK Image Format" (qoiformat.org).

import type { RawImage } from './types';

export const isQoi = (bytes: Uint8Array): boolean => bytes[0] === 0x71 && bytes[1] === 0x6f && bytes[2] === 0x69 && bytes[3] === 0x66;

export const decodeQoi = (buffer: ArrayBuffer): RawImage => {
  const bytes = new Uint8Array(buffer);
  if (!isQoi(bytes) || bytes.length < 22) throw new Error('Not a QOI file.');
  const view = new DataView(buffer);
  const width = view.getUint32(4);
  const height = view.getUint32(8);
  if (width === 0 || height === 0 || width * height > 400_000_000) throw new Error('Corrupt QOI header.');
  const data = new Uint8ClampedArray(width * height * 4);
  const seen = new Uint8Array(64 * 4);
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 255;
  let position = 14;
  let run = 0;
  const end = bytes.length - 8;

  for (let out = 0; out < data.length; out += 4) {
    if (run > 0) {
      run -= 1;
    } else if (position < end) {
      const op = bytes[position++] as number;
      if (op === 0xfe) {
        r = bytes[position++] as number;
        g = bytes[position++] as number;
        b = bytes[position++] as number;
      } else if (op === 0xff) {
        r = bytes[position++] as number;
        g = bytes[position++] as number;
        b = bytes[position++] as number;
        a = bytes[position++] as number;
      } else if ((op & 0xc0) === 0x00) {
        const index = op * 4;
        r = seen[index] as number;
        g = seen[index + 1] as number;
        b = seen[index + 2] as number;
        a = seen[index + 3] as number;
      } else if ((op & 0xc0) === 0x40) {
        r = (r + ((op >> 4) & 3) - 2) & 255;
        g = (g + ((op >> 2) & 3) - 2) & 255;
        b = (b + (op & 3) - 2) & 255;
      } else if ((op & 0xc0) === 0x80) {
        const second = bytes[position++] as number;
        const dg = (op & 0x3f) - 32;
        r = (r + dg - 8 + ((second >> 4) & 15)) & 255;
        g = (g + dg) & 255;
        b = (b + dg - 8 + (second & 15)) & 255;
      } else {
        run = op & 0x3f;
      }
      const hash = ((r * 3 + g * 5 + b * 7 + a * 11) % 64) * 4;
      seen[hash] = r;
      seen[hash + 1] = g;
      seen[hash + 2] = b;
      seen[hash + 3] = a;
    }
    data[out] = r;
    data[out + 1] = g;
    data[out + 2] = b;
    data[out + 3] = a;
  }
  return { width, height, data };
};

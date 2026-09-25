// Truevision TGA: color-mapped (1/9), truecolor (2/10) and grayscale (3/11), raw or RLE; 8/15/16/24/32 bits.

import type { RawImage } from './types';

type Color = [number, number, number, number];

export const decodeTga = (buffer: ArrayBuffer): RawImage => {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 18) throw new Error('Not a TGA file.');
  const idLength = bytes[0] as number;
  const hasMap = bytes[1] === 1;
  const type = bytes[2] as number;
  const mapFirst = (bytes[3] as number) | ((bytes[4] as number) << 8);
  const mapLength = (bytes[5] as number) | ((bytes[6] as number) << 8);
  const mapDepth = bytes[7] as number;
  const width = (bytes[12] as number) | ((bytes[13] as number) << 8);
  const height = (bytes[14] as number) | ((bytes[15] as number) << 8);
  const depth = bytes[16] as number;
  const descriptor = bytes[17] as number;
  if (![1, 2, 3, 9, 10, 11].includes(type) || width === 0 || height === 0) throw new Error('Not a supported TGA file.');

  let offset = 18 + idLength;
  const readColor = (at: number, bits: number): Color => {
    if (bits === 8) return [bytes[at] as number, bytes[at] as number, bytes[at] as number, 255];
    if (bits === 15 || bits === 16) {
      const value = (bytes[at] as number) | ((bytes[at + 1] as number) << 8);
      const scale = (v: number) => (v << 3) | (v >> 2);
      return [scale((value >> 10) & 31), scale((value >> 5) & 31), scale(value & 31), 255];
    }
    return [bytes[at + 2] as number, bytes[at + 1] as number, bytes[at] as number, bits === 32 ? (bytes[at + 3] as number) : 255];
  };

  const palette: Color[] = [];
  if (hasMap) {
    const entryBytes = Math.ceil(mapDepth / 8);
    for (let index = 0; index < mapLength; index += 1) palette.push(readColor(offset + index * entryBytes, mapDepth));
    offset += mapLength * entryBytes;
  }

  const pixelBytes = Math.ceil(depth / 8);
  const count = width * height;
  const pixels: Color[] = new Array<Color>(count);
  const pixelAt = (at: number): Color => {
    if (type === 1 || type === 9) {
      const index = pixelBytes === 2 ? (bytes[at] as number) | ((bytes[at + 1] as number) << 8) : (bytes[at] as number);
      return palette[index - mapFirst] ?? [0, 0, 0, 255];
    }
    return readColor(at, type === 3 || type === 11 ? 8 : depth);
  };

  if (type >= 9) {
    let written = 0;
    while (written < count && offset < bytes.length) {
      const header = bytes[offset++] as number;
      const run = (header & 127) + 1;
      if (header & 128) {
        const color = pixelAt(offset);
        offset += pixelBytes;
        for (let index = 0; index < run && written < count; index += 1) pixels[written++] = color;
      } else {
        for (let index = 0; index < run && written < count; index += 1) {
          pixels[written++] = pixelAt(offset);
          offset += pixelBytes;
        }
      }
    }
  } else {
    for (let index = 0; index < count; index += 1) pixels[index] = pixelAt(offset + index * pixelBytes);
  }

  // Descriptor bit 5: top-left origin (otherwise bottom-left). Bit 4: right-to-left. Bits 0–3: alpha bits.
  const topDown = (descriptor & 0x20) !== 0;
  const rightToLeft = (descriptor & 0x10) !== 0;
  const alphaBits = descriptor & 0x0f;
  const data = new Uint8ClampedArray(count * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = pixels[y * width + x] ?? [0, 0, 0, 255];
      const outX = rightToLeft ? width - 1 - x : x;
      const outY = topDown ? y : height - 1 - y;
      const out = (outY * width + outX) * 4;
      data[out] = color[0];
      data[out + 1] = color[1];
      data[out + 2] = color[2];
      // Many writers leave the alpha bits at 0 in 32-bit files; treat "no alpha bits" as opaque.
      data[out + 3] = depth === 32 && alphaBits > 0 ? color[3] : 255;
    }
  }
  return { width, height, data };
};

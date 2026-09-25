// Netpbm: P1–P6 (PBM/PGM/PPM, ASCII and binary) and P7 (PAM).

import type { RawImage } from './types';

const isSpace = (byte: number) => byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;

export const isPnm = (bytes: Uint8Array): boolean =>
  bytes[0] === 0x50 && (bytes[1] ?? 0) >= 0x31 && (bytes[1] ?? 0) <= 0x37 && isSpace(bytes[2] ?? 0);

export const decodePnm = (buffer: ArrayBuffer): RawImage => {
  const bytes = new Uint8Array(buffer);
  if (!isPnm(bytes)) throw new Error('Not a PNM file.');
  const kind = (bytes[1] as number) - 0x30;
  let position = 2;

  const token = (): string => {
    for (;;) {
      while (position < bytes.length && isSpace(bytes[position] as number)) position += 1;
      if (bytes[position] !== 0x23) break; // # comment
      while (position < bytes.length && bytes[position] !== 0x0a) position += 1;
    }
    let text = '';
    while (position < bytes.length && !isSpace(bytes[position] as number)) text += String.fromCharCode(bytes[position++] as number);
    return text;
  };

  let width = 0;
  let height = 0;
  let maxValue = 1;
  let channels = 1;
  if (kind === 7) {
    for (;;) {
      const key = token();
      if (key === 'ENDHDR' || key === '') break;
      if (key === 'TUPLTYPE') {
        while (position < bytes.length && bytes[position] !== 0x0a) position += 1;
        continue;
      }
      const value = Number(token());
      if (key === 'WIDTH') width = value;
      else if (key === 'HEIGHT') height = value;
      else if (key === 'DEPTH') channels = value;
      else if (key === 'MAXVAL') maxValue = value;
    }
  } else {
    width = Number(token());
    height = Number(token());
    if (kind !== 1 && kind !== 4) maxValue = Number(token());
    channels = kind === 3 || kind === 6 ? 3 : 1;
  }
  position += 1; // the single whitespace before binary data
  if (!(width > 0 && height > 0 && maxValue > 0)) throw new Error('Corrupt PNM header.');

  const count = width * height;
  const data = new Uint8ClampedArray(count * 4);

  if (kind === 4) {
    const rowBytes = Math.ceil(width / 8);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const bit = ((bytes[position + y * rowBytes + (x >> 3)] as number) >> (7 - (x & 7))) & 1;
        const out = (y * width + x) * 4;
        data.fill(bit ? 0 : 255, out, out + 3);
        data[out + 3] = 255;
      }
    }
    return { width, height, data };
  }

  const wide = maxValue > 255;
  const scale = 255 / maxValue;
  let binaryAt = position;
  const next = (): number => {
    if (kind <= 3) return Number(token());
    if (wide) {
      const value = ((bytes[binaryAt] as number) << 8) | (bytes[binaryAt + 1] as number);
      binaryAt += 2;
      return value;
    }
    return bytes[binaryAt++] as number;
  };

  for (let index = 0; index < count; index += 1) {
    const out = index * 4;
    if (kind === 1) {
      const value = next() ? 0 : 255;
      data.fill(value, out, out + 3);
      data[out + 3] = 255;
      continue;
    }
    const values = Array.from({ length: channels }, () => next() * scale);
    const [first = 0, second = first, third = first, fourth = 255] = values;
    if (channels <= 2) {
      data.fill(first, out, out + 3);
      data[out + 3] = channels === 2 ? second : 255;
    } else {
      data[out] = first;
      data[out + 1] = second;
      data[out + 2] = third;
      data[out + 3] = channels >= 4 ? fourth : 255;
    }
  }
  return { width, height, data };
};

// Baseline TIFF decoder: the first image of a file, chunky (interleaved) samples in strips or tiles.
// Compression: none, PackBits, LZW, Deflate (via DecompressionStream). Predictor 2 is supported.
// Photometric: bilevel/grayscale, RGB, palette, CMYK; 1/4/8/16 bits per sample; optional alpha.

import type { RawImage } from './types';

type Ifd = Map<number, number[]>;

const TAG = {
  width: 256,
  height: 257,
  bitsPerSample: 258,
  compression: 259,
  photometric: 262,
  stripOffsets: 273,
  samplesPerPixel: 277,
  rowsPerStrip: 278,
  stripByteCounts: 279,
  planarConfig: 284,
  predictor: 317,
  colorMap: 320,
  tileWidth: 322,
  tileLength: 323,
  tileOffsets: 324,
  tileByteCounts: 325,
  extraSamples: 338,
  sampleFormat: 339,
} as const;

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };

export const isTiff = (bytes: Uint8Array): boolean =>
  (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 42 && bytes[3] === 0) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 42);

const readIfd = (view: DataView, offset: number, little: boolean): Ifd => {
  const ifd: Ifd = new Map();
  const count = view.getUint16(offset, little);
  for (let index = 0; index < count; index += 1) {
    const entry = offset + 2 + index * 12;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const valueCount = view.getUint32(entry + 4, little);
    const size = (TYPE_SIZE[type] ?? 1) * valueCount;
    const valueOffset = size <= 4 ? entry + 8 : view.getUint32(entry + 8, little);
    const values: number[] = [];
    for (let item = 0; item < valueCount; item += 1) {
      const at = valueOffset + item * (TYPE_SIZE[type] ?? 1);
      if (at >= view.byteLength) break;
      if (type === 3 || type === 8) values.push(view.getUint16(at, little));
      else if (type === 4 || type === 9 || type === 13) values.push(view.getUint32(at, little));
      else if (type === 5) values.push(view.getUint32(at, little) / Math.max(1, view.getUint32(at + 4, little)));
      else values.push(view.getUint8(at));
    }
    ifd.set(tag, values);
  }
  return ifd;
};

const packBits = (input: Uint8Array, expected: number): Uint8Array => {
  const output = new Uint8Array(expected);
  let read = 0;
  let write = 0;
  while (read < input.length && write < expected) {
    const header = (input[read++] as number) << 24 >> 24;
    if (header >= 0) {
      for (let index = 0; index <= header && write < expected; index += 1) output[write++] = input[read++] as number;
    } else if (header !== -128) {
      const value = input[read++] as number;
      for (let index = 0; index < 1 - header && write < expected; index += 1) output[write++] = value;
    }
  }
  return output;
};

/** TIFF LZW (MSB-first codes, early change). */
const lzw = (input: Uint8Array, expected: number): Uint8Array => {
  const output = new Uint8Array(expected);
  let write = 0;
  const table: Uint8Array[] = [];
  const reset = () => {
    table.length = 0;
    for (let code = 0; code < 256; code += 1) table.push(Uint8Array.of(code));
    table.push(new Uint8Array(0), new Uint8Array(0)); // 256 clear, 257 end
  };
  reset();
  let bitPosition = 0;
  let codeLength = 9;
  let previous: Uint8Array | null = null;
  const readCode = (): number => {
    let code = 0;
    for (let bit = 0; bit < codeLength; bit += 1) {
      const byte = input[(bitPosition + bit) >> 3] ?? 0;
      code = (code << 1) | ((byte >> (7 - ((bitPosition + bit) & 7))) & 1);
    }
    bitPosition += codeLength;
    return code;
  };
  const emit = (chunk: Uint8Array) => {
    const room = Math.min(chunk.length, expected - write);
    output.set(chunk.subarray(0, room), write);
    write += room;
  };
  while (bitPosition + codeLength <= input.length * 8 && write < expected) {
    const code = readCode();
    if (code === 257) break;
    if (code === 256) {
      reset();
      codeLength = 9;
      previous = null;
      continue;
    }
    let entry: Uint8Array;
    if (code < table.length) {
      entry = table[code] as Uint8Array;
      if (previous) {
        const next = new Uint8Array(previous.length + 1);
        next.set(previous);
        next[previous.length] = entry[0] as number;
        table.push(next);
      }
    } else if (previous) {
      entry = new Uint8Array(previous.length + 1);
      entry.set(previous);
      entry[previous.length] = previous[0] as number;
      table.push(entry);
    } else {
      throw new Error('Corrupt LZW data.');
    }
    emit(entry);
    previous = entry;
    if (table.length + 1 >= 1 << codeLength && codeLength < 12) codeLength += 1;
  }
  return output;
};

const inflate = async (input: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([input as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const decompress = async (compression: number, input: Uint8Array, expected: number): Promise<Uint8Array> => {
  if (compression === 1) return input;
  if (compression === 32773) return packBits(input, expected);
  if (compression === 5) return lzw(input, expected);
  if (compression === 8 || compression === 32946) return inflate(input);
  if (compression === 7 || compression === 6) throw new Error('JPEG-compressed TIFF isn’t supported. Convert it to JPEG or PNG first.');
  throw new Error(`TIFF compression ${compression} isn’t supported.`);
};

/** Reads one sample as 0–255 from a row buffer. */
const sampleReader = (bits: number, little: boolean) => {
  if (bits === 8) return (row: Uint8Array, index: number) => row[index] as number;
  if (bits === 16) return (row: Uint8Array, index: number) => (little ? (row[index * 2 + 1] as number) : (row[index * 2] as number));
  if (bits === 1 || bits === 2 || bits === 4) {
    const max = (1 << bits) - 1;
    return (row: Uint8Array, index: number) => {
      const bit = index * bits;
      return (((row[bit >> 3] as number) >> (8 - bits - (bit & 7))) & max) * (255 / max);
    };
  }
  throw new Error(`${bits}-bit TIFF samples aren’t supported.`);
};

export const decodeTiff = async (buffer: ArrayBuffer): Promise<RawImage> => {
  const bytes = new Uint8Array(buffer);
  if (!isTiff(bytes)) throw new Error('Not a TIFF file.');
  const view = new DataView(buffer);
  const little = bytes[0] === 0x49;
  const ifd = readIfd(view, view.getUint32(4, little), little);
  const get = (tag: number, fallback: number) => ifd.get(tag)?.[0] ?? fallback;

  const width = get(TAG.width, 0);
  const height = get(TAG.height, 0);
  if (width === 0 || height === 0) throw new Error('The TIFF has no image size.');
  const samples = get(TAG.samplesPerPixel, 1);
  const bits = get(TAG.bitsPerSample, 1);
  const compression = get(TAG.compression, 1);
  const photometric = get(TAG.photometric, samples >= 3 ? 2 : 1);
  const predictor = get(TAG.predictor, 1);
  if (get(TAG.planarConfig, 1) !== 1) throw new Error('Planar TIFFs aren’t supported.');
  if (get(TAG.sampleFormat, 1) === 3) throw new Error('Floating-point TIFFs aren’t supported.');
  const hasAlpha = (ifd.get(TAG.extraSamples)?.length ?? 0) > 0 && (photometric === 2 ? samples >= 4 : photometric === 5 ? samples >= 5 : samples >= 2);
  const colorMap = ifd.get(TAG.colorMap);

  const tiled = ifd.has(TAG.tileOffsets);
  const chunkWidth = tiled ? get(TAG.tileWidth, width) : width;
  const chunkHeight = tiled ? get(TAG.tileLength, height) : Math.min(height, get(TAG.rowsPerStrip, height));
  const offsets = ifd.get(tiled ? TAG.tileOffsets : TAG.stripOffsets) ?? [];
  const counts = ifd.get(tiled ? TAG.tileByteCounts : TAG.stripByteCounts) ?? [];
  const across = tiled ? Math.ceil(width / chunkWidth) : 1;
  const rowBytes = Math.ceil((chunkWidth * samples * bits) / 8);
  const read = sampleReader(bits, little);

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let chunk = 0; chunk < offsets.length; chunk += 1) {
    const start = offsets[chunk] as number;
    const raw = bytes.subarray(start, start + (counts[chunk] ?? bytes.length - start));
    const data = await decompress(compression, raw, rowBytes * chunkHeight);
    const originX = (chunk % across) * chunkWidth;
    const originY = Math.floor(chunk / across) * chunkHeight;

    for (let y = 0; y < chunkHeight && originY + y < height; y += 1) {
      const row = data.subarray(y * rowBytes, (y + 1) * rowBytes);
      if (predictor === 2 && bits === 8) {
        for (let index = samples; index < chunkWidth * samples; index += 1) row[index] = ((row[index] as number) + (row[index - samples] as number)) & 255;
      } else if (predictor === 2 && bits === 16) {
        const words = new DataView(row.buffer, row.byteOffset, row.byteLength);
        for (let index = samples; index < chunkWidth * samples; index += 1) {
          words.setUint16(index * 2, (words.getUint16(index * 2, little) + words.getUint16((index - samples) * 2, little)) & 0xffff, little);
        }
      }
      for (let x = 0; x < chunkWidth && originX + x < width; x += 1) {
        const out = ((originY + y) * width + originX + x) * 4;
        const base = x * samples;
        if (photometric === 3 && colorMap) {
          // Palette: 3 × 2^bits 16-bit entries, R then G then B.
          const index = bits === 8 ? (row[base] as number) : Math.round(((read(row, base) as number) / 255) * ((1 << bits) - 1));
          const entries = 1 << bits;
          rgba[out] = (colorMap[index] ?? 0) >> 8;
          rgba[out + 1] = (colorMap[entries + index] ?? 0) >> 8;
          rgba[out + 2] = (colorMap[entries * 2 + index] ?? 0) >> 8;
          rgba[out + 3] = 255;
        } else if (photometric === 0 || photometric === 1) {
          const value = read(row, base);
          const gray = photometric === 0 ? 255 - value : value;
          rgba[out] = gray;
          rgba[out + 1] = gray;
          rgba[out + 2] = gray;
          rgba[out + 3] = hasAlpha ? read(row, base + 1) : 255;
        } else if (photometric === 5) {
          const k = 1 - read(row, base + 3) / 255;
          rgba[out] = (255 - read(row, base)) * k;
          rgba[out + 1] = (255 - read(row, base + 1)) * k;
          rgba[out + 2] = (255 - read(row, base + 2)) * k;
          rgba[out + 3] = hasAlpha ? read(row, base + 4) : 255;
        } else if (photometric === 2) {
          rgba[out] = read(row, base);
          rgba[out + 1] = read(row, base + 1);
          rgba[out + 2] = read(row, base + 2);
          rgba[out + 3] = hasAlpha ? read(row, base + 3) : 255;
        } else {
          throw new Error(`TIFF color type ${photometric} isn’t supported.`);
        }
      }
    }
  }
  // ExtraSamples = 1 means associated (premultiplied) alpha; canvases expect straight alpha.
  if (hasAlpha && ifd.get(TAG.extraSamples)?.[0] === 1) {
    for (let index = 0; index < rgba.length; index += 4) {
      const alpha = rgba[index + 3] as number;
      if (alpha === 0 || alpha === 255) continue;
      for (let channel = 0; channel < 3; channel += 1) rgba[index + channel] = ((rgba[index + channel] as number) * 255) / alpha;
    }
  }
  return { width, height, data: rgba };
};

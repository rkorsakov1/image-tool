import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { decodeRaw, sniffFormat, svgIntrinsicSize, svgRasterSize, SVG_MIN_RASTER } from './index';

// Fixtures were written by Pillow; expected.json holds Pillow's own RGBA decode of each file.
type Expected = { width: number; height: number; expected: Record<string, number[]> };

const load = async (name: string): Promise<ArrayBuffer> => {
  const bytes = await readFile(new URL(`./fixtures/${name}`, import.meta.url));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

describe('raster decoders match Pillow', async () => {
  const reference = JSON.parse(new TextDecoder().decode(new Uint8Array(await load('expected.json')))) as Expected;

  for (const [name, pixels] of Object.entries(reference.expected)) {
    it(name, async () => {
      const buffer = await load(name);
      const kind = sniffFormat(new Uint8Array(buffer.slice(0, 256)), name, '');
      const image = await decodeRaw(kind, buffer);
      expect(image).not.toBeNull();
      expect([image?.width, image?.height]).toEqual([reference.width, reference.height]);
      const actual = Array.from(image?.data ?? []);
      const worst = actual.reduce((max, value, index) => Math.max(max, Math.abs(value - (pixels[index] ?? 0))), 0);
      expect(worst).toBeLessThanOrEqual(1);
    });
  }
});

describe('sniffFormat', () => {
  const bytes = (text: string) => new Uint8Array([...text].map((char) => char.charCodeAt(0)));

  it('recognizes formats by content, not by name', () => {
    expect(sniffFormat(bytes('II*\0'), 'photo.jpg', '')).toBe('tiff');
    expect(sniffFormat(bytes('qoif'), 'x', '')).toBe('qoi');
    expect(sniffFormat(bytes('P6\n'), 'x', '')).toBe('pnm');
    expect(sniffFormat(bytes('\0\0\0\x18ftypheic'), 'IMG_0001', '')).toBe('heif');
    expect(sniffFormat(bytes('\0\0\0\x18ftypavif'), 'x.heic', '')).toBe('other');
    expect(sniffFormat(bytes('<?xml version="1.0"?><svg '), 'logo', '')).toBe('svg');
  });

  it('falls back to the extension for TGA, which has no magic number', () => {
    expect(sniffFormat(bytes('\0\0\x02'), 'sprite.TGA', '')).toBe('tga');
    expect(sniffFormat(bytes('\0\0\x02'), 'sprite.png', 'image/png')).toBe('other');
  });
});

describe('SVG sizing', () => {
  it('reads width/height, or the viewBox aspect', () => {
    expect(svgIntrinsicSize('<svg width="120" height="60">')).toEqual({ width: 120, height: 60 });
    expect(svgIntrinsicSize('<svg viewBox="0 0 400 100">')).toEqual({ width: 400, height: 100 });
    expect(svgIntrinsicSize('<svg width="200" viewBox="0 0 400 100">')).toEqual({ width: 200, height: 50 });
    expect(svgIntrinsicSize('<svg width="100%" height="100%">')).toBeNull();
  });

  it('rasterizes small SVGs large enough to export sharply', () => {
    expect(svgRasterSize({ width: 24, height: 12 })).toEqual({ width: SVG_MIN_RASTER, height: SVG_MIN_RASTER / 2 });
    expect(svgRasterSize({ width: 5000, height: 2500 })).toEqual({ width: 5000, height: 2500 });
  });
});

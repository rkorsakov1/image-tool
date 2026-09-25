// Formats the browser can't be relied on to decode, identified by their first bytes (or extension).

import { decodePnm, isPnm } from './pnm';
import { decodeQoi, isQoi } from './qoi';
import { decodeTga } from './tga';
import { decodeTiff, isTiff } from './tiff';
import type { RawImage } from './types';

export type SniffedKind = 'svg' | 'tiff' | 'tga' | 'pnm' | 'qoi' | 'heif' | 'jxl' | 'other';

const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'mif2']);

const ascii = (bytes: Uint8Array, start: number, length: number): string => String.fromCharCode(...bytes.subarray(start, start + length));

/** Identifies a file from its first ~256 bytes, falling back to the extension for TGA (which has no magic number). */
export const sniffFormat = (head: Uint8Array, name: string, type: string): SniffedKind => {
  const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  if (isTiff(head)) return 'tiff';
  if (isQoi(head)) return 'qoi';
  if (isPnm(head)) return 'pnm';
  if (ascii(head, 4, 4) === 'ftyp') {
    const brand = ascii(head, 8, 4);
    if (HEIF_BRANDS.has(brand)) return 'heif';
    if (brand === 'avif' || brand === 'avis') return 'other';
  }
  if ((head[0] === 0xff && head[1] === 0x0a) || ascii(head, 4, 4) === 'JXL ') return 'jxl';
  if (type === 'image/svg+xml' || extension === 'svg') return 'svg';
  const text = ascii(head, 0, Math.min(head.length, 256)).trimStart();
  if (text.startsWith('<svg') || (text.startsWith('<?xml') && text.includes('<svg'))) return 'svg';
  if (extension === 'tga' || extension === 'icb' || extension === 'vda' || extension === 'vst' || type === 'image/x-tga') return 'tga';
  if (extension === 'heic' || extension === 'heif') return 'heif';
  return 'other';
};

/** Decodes TIFF, TGA, PNM and QOI in JavaScript. */
export const decodeRaw = async (kind: SniffedKind, buffer: ArrayBuffer): Promise<RawImage | null> => {
  if (kind === 'tiff') return decodeTiff(buffer);
  if (kind === 'tga') return decodeTga(buffer);
  if (kind === 'pnm') return decodePnm(buffer);
  if (kind === 'qoi') return decodeQoi(buffer);
  return null;
};

/** Longest side SVGs are rasterized at, unless their own size is larger. */
export const SVG_MIN_RASTER = 2048;
const SVG_MAX_RASTER = 8192;

/** Width/height from the SVG's attributes or viewBox, for the aspect ratio. */
export const svgIntrinsicSize = (text: string): { width: number; height: number } | null => {
  const root = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!root) return null;
  const attribute = (key: string) => new RegExp(`\\s${key}\\s*=\\s*["']([^"']+)["']`, 'i').exec(root)?.[1];
  const length = (value: string | undefined) => {
    if (!value || value.trim().endsWith('%')) return null;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const viewBox = attribute('viewBox')?.split(/[\s,]+/).map(Number);
  const boxWidth = viewBox?.[2];
  const boxHeight = viewBox?.[3];
  const width = length(attribute('width'));
  const height = length(attribute('height'));
  if (width && height) return { width, height };
  if (boxWidth && boxHeight && boxWidth > 0 && boxHeight > 0) {
    if (width) return { width, height: (width * boxHeight) / boxWidth };
    if (height) return { width: (height * boxWidth) / boxHeight, height };
    return { width: boxWidth, height: boxHeight };
  }
  return null;
};

/** The raster size for an SVG: its own size, scaled up so the longest side is at least SVG_MIN_RASTER. */
export const svgRasterSize = (intrinsic: { width: number; height: number }): { width: number; height: number } => {
  const longest = Math.max(intrinsic.width, intrinsic.height);
  const scale = Math.min(SVG_MAX_RASTER, Math.max(SVG_MIN_RASTER, longest)) / longest;
  return { width: Math.max(1, Math.round(intrinsic.width * scale)), height: Math.max(1, Math.round(intrinsic.height * scale)) };
};

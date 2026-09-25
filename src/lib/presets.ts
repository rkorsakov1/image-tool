import { DEFAULT_FILENAME_TEMPLATE } from './filenameTemplate';
import type { EncodeSettings, Preset } from './types';

export const BUILTIN_PREFIX = 'builtin:';

const builtin = (id: string, fields: Omit<Preset, 'id' | 'matteColor' | 'allowUpscale' | 'filenameTemplate' | 'targetMaxBytes' | 'sharpen'>): Preset => ({
  id: `${BUILTIN_PREFIX}${id}`,
  targetMaxBytes: null,
  matteColor: '#ffffff',
  allowUpscale: false,
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  sharpen: 0,
  ...fields,
});

export const BUILTIN_PRESETS: readonly Preset[] = [
  builtin('youtube', { name: 'YouTube thumbnail', width: 1280, height: 720, fit: 'cover', format: 'jpeg', quality: 80 }),
  builtin('og', { name: 'Open Graph', width: 1200, height: 630, fit: 'cover', format: 'jpeg', quality: 82 }),
  builtin('square1080', { name: 'Square 1080', width: 1080, height: 1080, fit: 'cover', format: 'webp', quality: 80 }),
  builtin('original-webp', { name: 'Original size WebP', width: null, height: null, fit: 'cover', format: 'webp', quality: 80 }),
  builtin('w1600', { name: 'Width 1600 (keep aspect)', width: 1600, height: null, fit: 'cover', format: 'webp', quality: 80 }),
];

export const isBuiltinPreset = (id: string): boolean => id.startsWith(BUILTIN_PREFIX);

export const findPreset = (presets: readonly Preset[], id: string): Preset => {
  const found = presets.find((preset) => preset.id === id) ?? BUILTIN_PRESETS.find((preset) => preset.id === id);
  return found ?? (BUILTIN_PRESETS[0] as Preset);
};

/** Preset merged with per-image overrides. */
export const resolvePreset = (preset: Preset, overrides: Partial<Preset>): Preset => ({ ...preset, ...overrides, id: preset.id });

export const toEncodeSettings = (preset: Preset): EncodeSettings => ({
  width: preset.width,
  height: preset.height,
  fit: preset.fit,
  format: preset.format,
  quality: preset.quality,
  targetMaxBytes: preset.targetMaxBytes,
  matteColor: preset.matteColor,
  allowUpscale: preset.allowUpscale,
  sharpen: preset.sharpen,
});

/** Overrides that actually differ from the preset (so "Modified" isn't shown for no-op edits). */
export const effectiveOverrides = (preset: Preset, overrides: Partial<Preset>): Partial<Preset> => {
  const result: Partial<Preset> = {};
  for (const key of Object.keys(overrides) as (keyof Preset)[]) {
    if (key === 'id') continue;
    if (overrides[key] === preset[key]) continue;
    Object.assign(result, { [key]: overrides[key] });
  }
  return result;
};

export const uniquePresetName = (name: string, existing: readonly Preset[]): string => {
  const taken = new Set(existing.map((preset) => preset.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const base = name.replace(/\s\(\d+\)$/, '');
  let counter = 2;
  while (taken.has(`${base} (${counter})`.toLowerCase())) counter += 1;
  return `${base} (${counter})`;
};

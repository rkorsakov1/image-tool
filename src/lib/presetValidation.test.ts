import { describe, expect, it } from 'vitest';
import { BUILTIN_PRESETS } from './presets';
import { createPresetFile, mergePresets, migrate, validatePreset, validatePresetFile } from './presetValidation';
import type { Preset } from './types';

const valid: Preset = {
  id: 'abc',
  name: 'Blog hero',
  width: 1600,
  height: 900,
  fit: 'cover',
  format: 'webp',
  quality: 78,
  targetMaxBytes: 200_000,
  matteColor: '#112233',
  allowUpscale: false,
  filenameTemplate: '{name}.{ext}',
  sharpen: 0,
};

describe('validatePreset', () => {
  it('accepts a valid preset unchanged', () => {
    expect(validatePreset(valid)).toEqual({ ok: true, preset: valid, repairs: [] });
  });

  it('rejects non-objects', () => {
    expect(validatePreset(null).ok).toBe(false);
    expect(validatePreset([valid]).ok).toBe(false);
    expect(validatePreset('preset').ok).toBe(false);
  });

  it('rejects entries with neither name nor format', () => {
    expect(validatePreset({ width: 100 }).ok).toBe(false);
  });

  it('repairs bad fields', () => {
    const result = validatePreset({
      ...valid,
      width: -5,
      height: 99999,
      fit: 'stretch',
      quality: 250,
      targetMaxBytes: 'big',
      matteColor: '#abc',
      allowUpscale: 'yes',
      filenameTemplate: '',
    });
    if (!result.ok) throw new Error('expected ok');
    expect(result.preset).toMatchObject({
      width: null,
      height: null,
      fit: 'cover',
      quality: 100,
      targetMaxBytes: null,
      matteColor: '#aabbcc',
      allowUpscale: false,
      filenameTemplate: '{name}-{w}x{h}.{ext}',
    });
    expect(result.repairs).toContain('quality');
  });

  it('gives built-in or missing ids a fresh id', () => {
    const result = validatePreset({ ...valid, id: BUILTIN_PRESETS[0]?.id });
    if (!result.ok) throw new Error('expected ok');
    expect(result.preset.id).not.toBe(BUILTIN_PRESETS[0]?.id);
    expect(result.repairs).toContain('id');
  });

  it('fills in fields added after v1 files were written', () => {
    const { sharpen: _sharpen, ...withoutSharpen } = valid;
    const result = validatePreset(withoutSharpen);
    if (!result.ok) throw new Error('expected ok');
    expect(result.preset.sharpen).toBe(0);
  });
});

describe('validatePresetFile', () => {
  it('round-trips an exported file', () => {
    const file = JSON.parse(JSON.stringify(createPresetFile([valid])));
    expect(validatePresetFile(file)).toEqual({ ok: true, presets: [valid], rejected: 0, repaired: 0 });
  });

  it('rejects files from other apps and newer schemas', () => {
    expect(validatePresetFile({ app: 'other', schemaVersion: 1, presets: [] }).ok).toBe(false);
    expect(validatePresetFile({ app: 'localcrop', schemaVersion: 2, presets: [] }).ok).toBe(false);
    expect(validatePresetFile({ app: 'localcrop', schemaVersion: 1 }).ok).toBe(false);
  });

  it('counts rejected entries', () => {
    const result = validatePresetFile({ app: 'localcrop', schemaVersion: 1, presets: [valid, 42, {}] });
    expect(result).toMatchObject({ ok: true, rejected: 2 });
  });
});

describe('migrate', () => {
  it('passes v1 through', () => {
    const data = { presets: [] };
    expect(migrate(1, data)).toBe(data);
  });
});

describe('mergePresets', () => {
  it('renames name conflicts and skips identical presets', () => {
    const existing = [valid];
    const incoming = [valid, { ...valid, id: 'other' }, { ...valid, id: 'third', name: 'Fresh' }];
    const { presets, summary } = mergePresets(existing, incoming);
    expect(summary).toEqual({ added: 2, renamed: 1, unchanged: 1 });
    expect(presets.map((preset) => preset.name)).toEqual(['Blog hero', 'Blog hero (2)', 'Fresh']);
  });

  it('assigns a new id when the id collides with different content', () => {
    const { presets } = mergePresets([valid], [{ ...valid, name: 'Changed' }]);
    expect(presets[1]?.id).not.toBe(valid.id);
  });
});

import { describe, expect, it } from 'vitest';
import { createShareHash, fromBase64Url, parseShareHash, toBase64Url } from './presetShare';
import type { Preset } from './types';

const preset: Preset = {
  id: 'p1',
  name: 'Blog hero — ünïcødé ✓',
  width: 1600,
  height: 900,
  fit: 'cover',
  format: 'avif',
  quality: 55,
  targetMaxBytes: null,
  matteColor: '#000000',
  allowUpscale: true,
  filenameTemplate: '{preset}/{name}.{ext}',
  sharpen: 30,
};

describe('base64url', () => {
  it('round-trips UTF-8 without URL-unsafe characters', () => {
    const text = 'ünïcødé ✓ ??>>~';
    const encoded = toBase64Url(text);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(fromBase64Url(encoded)).toBe(text);
  });
});

describe('share hash', () => {
  it('round-trips a preset', () => {
    const hash = createShareHash([preset]);
    expect(hash.startsWith('#preset=')).toBe(true);
    expect(parseShareHash(hash)).toEqual({ ok: true, presets: [preset], rejected: 0, repaired: 0 });
  });

  it('ignores unrelated hashes', () => {
    expect(parseShareHash('')).toBeNull();
    expect(parseShareHash('#section-2')).toBeNull();
  });

  it('reports damaged links', () => {
    expect(parseShareHash('#preset=abc$$')?.ok).toBe(false);
    expect(parseShareHash(`#preset=${toBase64Url('{"app":"other"}')}`)?.ok).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { slugify, stripExtension } from './slugify';

describe('slugify', () => {
  it('lowercases and dashes', () => {
    expect(slugify('Hello World!  Again')).toBe('hello-world-again');
  });

  it('strips diacritics', () => {
    expect(slugify('Crème Brûlée')).toBe('creme-brulee');
  });

  it('uses the fallback for empty results', () => {
    expect(slugify('***')).toBe('image');
    expect(slugify('日本', 'x')).toBe('x');
  });
});

describe('stripExtension', () => {
  it('removes only the last extension', () => {
    expect(stripExtension('a.b.png')).toBe('a.b');
    expect(stripExtension('.hidden')).toBe('.hidden');
    expect(stripExtension('noext')).toBe('noext');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { formatBytes, formatSavings, parseByteSize } from '../lib/format';
import { de } from './de';
import { en } from './en';
import { languageFromPath, presetLabel, setLanguage, translateError } from './index';

/** Every nested key path of a dictionary (functions and arrays count as leaves). */
const keys = (value: unknown, prefix = ''): string[] =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
    : [prefix];

describe('i18n', () => {
  afterEach(() => setLanguage('en'));

  it('German has exactly the English keys (error texts are German-only extras)', () => {
    const { errors: _enErrors, ...englishRest } = en;
    const { errors: _deErrors, ...germanRest } = de;
    expect(keys(germanRest).sort()).toEqual(keys(englishRest).sort());
    expect(Object.keys(de.presets.builtin).sort()).toEqual(Object.keys(en.presets.builtin).sort());
  });

  it('formats numbers the German way', () => {
    setLanguage('de');
    expect(formatBytes(26_400)).toBe('26,4 KB');
    expect(formatSavings(1000, 60)).toBe('−94 %');
    expect(parseByteSize('1,5 MB')).toBe(1_500_000);
    setLanguage('en');
    expect(formatBytes(26_400)).toBe('26.4 KB');
    expect(formatSavings(1000, 60)).toBe('−94%');
  });

  it('translates errors from lower layers, including ones with values', () => {
    setLanguage('de');
    expect(translateError('The ZIP file is damaged.')).toBe('Die ZIP-Datei ist beschädigt.');
    expect(translateError('TIFF compression 34712 isn’t supported.')).toBe('TIFF-Kompression 34712 wird nicht unterstützt.');
    expect(translateError('Something unexpected')).toBe('Something unexpected');
    setLanguage('en');
    expect(translateError('The ZIP file is damaged.')).toBe('The ZIP file is damaged.');
  });

  it('names built-in presets per language and reads the language from the path', () => {
    setLanguage('de');
    expect(presetLabel({ id: 'builtin:1x1', name: '1:1 Square' })).toBe('1:1 Quadrat');
    expect(presetLabel({ id: 'mine', name: 'Blog hero' })).toBe('Blog hero');
    expect(languageFromPath('/localcrop/de/', '/localcrop/')).toBe('de');
    expect(languageFromPath('/localcrop/', '/localcrop/')).toBeNull();
  });
});

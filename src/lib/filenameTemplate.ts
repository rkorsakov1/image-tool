import { FORMAT_EXTENSIONS } from './format';
import { slugify, stripExtension } from './slugify';
import type { OutputFormat } from './types';

export const DEFAULT_FILENAME_TEMPLATE = '{name}-{w}x{h}.{ext}';

export type FilenameContext = {
  sourceName: string;
  width: number;
  height: number;
  presetName: string;
  /** 1-based position in the queue */
  index: number;
  queueLength: number;
  format: OutputFormat;
};

const INVALID_FILENAME_CHARS = /[<>:"/\|?*\u0000-\u001f]/g;

/**
 * Expands `{name}`, `{w}`, `{h}`, `{preset}`, `{i}` and `{ext}`. Unknown tokens are kept
 * as literal text. Characters that are invalid in filenames are replaced with "-".
 */
export const renderFilename = (template: string, context: FilenameContext): string => {
  const padLength = String(Math.max(1, context.queueLength)).length;
  const values: Record<string, string> = {
    name: slugify(stripExtension(context.sourceName)),
    w: String(context.width),
    h: String(context.height),
    preset: slugify(context.presetName, 'preset'),
    i: String(context.index).padStart(padLength, '0'),
    ext: FORMAT_EXTENSIONS[context.format],
  };
  const rendered = template
    .replace(/\{([a-z]+)\}/gi, (token, key: string) => values[key] ?? token)
    .replace(INVALID_FILENAME_CHARS, '-')
    .trim();
  if (!rendered || rendered === '.') return `image.${values.ext}`;
  return rendered;
};

/** Makes names unique by suffixing "-2", "-3", … before the extension. */
export const dedupeFilenames = (names: string[]): string[] => {
  const used = new Set<string>();
  return names.map((name) => {
    const key = (candidate: string) => candidate.toLowerCase();
    if (!used.has(key(name))) {
      used.add(key(name));
      return name;
    }
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : '';
    let counter = 2;
    while (used.has(key(`${base}-${counter}${extension}`))) counter += 1;
    const unique = `${base}-${counter}${extension}`;
    used.add(key(unique));
    return unique;
  });
};

import { createPresetFile, validatePresetFile, type PresetFileValidation } from './presetValidation';
import type { Preset } from './types';

export const SHARE_HASH_KEY = 'preset';

/** UTF-8 safe base64url without padding. */
export const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const fromBase64Url = (encoded: string): string => {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
};

/** `#preset=<base64url PresetFile JSON>` for the given presets. */
export const createShareHash = (presets: readonly Preset[]): string =>
  `#${SHARE_HASH_KEY}=${toBase64Url(JSON.stringify(createPresetFile(presets)))}`;

/** Parses a location hash. Returns null when it isn't a preset share link. */
export const parseShareHash = (hash: string): PresetFileValidation | null => {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const encoded = params.get(SHARE_HASH_KEY);
  if (encoded === null) return null;
  try {
    return validatePresetFile(JSON.parse(fromBase64Url(encoded)));
  } catch {
    return { ok: false, reason: 'The shared preset link is damaged or incomplete.' };
  }
};

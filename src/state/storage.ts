import { BUILTIN_PRESETS, findPreset } from '../lib/presets';
import { createPresetFile, validatePresetFile } from '../lib/presetValidation';
import type { Preset } from '../lib/types';
import { DEFAULT_PRESET_ID, type Prefs } from './appReducer';

export const STORAGE_KEY = 'localcrop:presets:v1';

export type PersistedState = { presets: Preset[]; lastPresetId: string; prefs: Prefs };

const DEFAULT_PREFS: Prefs = { showThirds: true, theme: 'system', lifetime: { bytes: 0, count: 0 } };

const readLifetime = (raw: unknown): Prefs['lifetime'] => {
  if (typeof raw !== 'object' || raw === null) return { bytes: 0, count: 0 };
  const { bytes, count } = raw as Record<string, unknown>;
  const valid = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
  return { bytes: valid(bytes), count: valid(count) };
};

const readPrefs = (raw: unknown): Prefs => {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFS;
  const record = raw as Record<string, unknown>;
  return {
    showThirds: typeof record.showThirds === 'boolean' ? record.showThirds : DEFAULT_PREFS.showThirds,
    theme: record.theme === 'light' || record.theme === 'dark' ? record.theme : 'system',
    lifetime: readLifetime(record.lifetime),
  };
};

/** Loads presets and UI preferences, repairing or dropping anything invalid. */
export const loadPersistedState = (): PersistedState => {
  const fallback: PersistedState = { presets: [], lastPresetId: DEFAULT_PRESET_ID, prefs: DEFAULT_PREFS };
  let text: string | null = null;
  try {
    text = localStorage.getItem(STORAGE_KEY);
  } catch {
    return fallback;
  }
  if (!text) return fallback;

  try {
    const parsed: unknown = JSON.parse(text);
    const validation = validatePresetFile(parsed);
    if (!validation.ok) return fallback;
    const record = parsed as Record<string, unknown>;
    const presets = validation.presets;
    const lastPresetId =
      typeof record.lastPresetId === 'string' ? findPreset(presets, record.lastPresetId).id : DEFAULT_PRESET_ID;
    return { presets, lastPresetId, prefs: readPrefs(record.prefs) };
  } catch {
    return fallback;
  }
};

export const savePersistedState = (state: PersistedState): boolean => {
  try {
    const file = createPresetFile(state.presets);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...file, lastPresetId: state.lastPresetId, prefs: state.prefs }));
    return true;
  } catch {
    return false;
  }
};

export const allPresets = (userPresets: readonly Preset[]): Preset[] => [...BUILTIN_PRESETS, ...userPresets];

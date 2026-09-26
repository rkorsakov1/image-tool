import { IDENTITY_TRANSFORM } from '../lib/cropMath';
import { BUILTIN_PRESETS, effectiveOverrides, findPreset, isBuiltinPreset, resolvePreset, uniquePresetName } from '../lib/presets';
import type { CropRect, Cutout, EncodedOutput, Preset, QueueItem, Transform } from '../lib/types';
import { EMPTY_HISTORY, type History } from './history';

export type Mode = 'crop' | 'retouch' | 'background' | 'compare';

export type Theme = 'system' | 'light' | 'dark';

/** `lifetime`: bytes saved and images exported across all sessions in this browser. */
export type Prefs = { showThirds: boolean; theme: Theme; lifetime: { bytes: number; count: number } };

export type Notice = {
  id: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  message: string;
  action?: { label: string; run: () => void };
  /** Stays until dismissed (errors always do). */
  persistent?: boolean;
};

export type AppState = {
  /** User presets, in display order. Built-ins live in BUILTIN_PRESETS. */
  presets: Preset[];
  /** Preset given to newly added images; the last one the user picked. */
  lastPresetId: string;
  items: QueueItem[];
  selectedId: string | null;
  mode: Mode;
  prefs: Prefs;
  savings: { bytes: number; count: number };
  notices: Notice[];
  /** Text for the aria-live region. */
  announcement: string;
  history: History;
};

export type NewItem = Pick<QueueItem, 'id' | 'sourceName' | 'sourceBytes' | 'sourceType' | 'sourceBitmap'>;

export type AppAction =
  | { type: 'addItems'; items: NewItem[] }
  | { type: 'removeItem'; id: string }
  | { type: 'selectItem'; id: string }
  | { type: 'selectRelative'; offset: 1 | -1 }
  | { type: 'setMode'; mode: Mode }
  | { type: 'setCrop'; id: string; crop: CropRect | null; gesture?: string }
  | { type: 'setTransform'; id: string; transform: Transform }
  | { type: 'setItemPreset'; id: string; presetId: string }
  | { type: 'applyPresetToAll'; presetId: string }
  | { type: 'setOverrides'; id: string; patch: Partial<Preset>; gesture?: string }
  | { type: 'resetOverrides'; id: string }
  | { type: 'saveOverridesToPreset'; id: string }
  | { type: 'saveOverridesAsNewPreset'; id: string; name: string; newPresetId: string }
  /** Replaces the retouched image (null = back to the source) and the refinable cut-out, if any. */
  | { type: 'setEdit'; id: string; bitmap: ImageBitmap | null; cutout: Cutout | null; mergeKey?: string }
  | { type: 'encodeStarted'; id: string; revision: number }
  | { type: 'encodeFinished'; id: string; revision: number; output: EncodedOutput }
  | { type: 'encodeFailed'; id: string; revision: number; error: string }
  | { type: 'encodeCancelled'; id: string; revision: number }
  | { type: 'upsertPreset'; preset: Preset }
  | { type: 'deletePreset'; id: string }
  | { type: 'movePreset'; id: string; offset: 1 | -1 }
  | { type: 'replacePresets'; presets: Preset[] }
  | { type: 'setPref'; patch: Partial<Prefs> }
  | { type: 'addSavings'; before: number; after: number; count: number }
  | { type: 'notify'; notice: Notice }
  | { type: 'dismissNotice'; id: string }
  | { type: 'announce'; message: string };

export const DEFAULT_PRESET_ID = (BUILTIN_PRESETS[0] as Preset).id;

export const createInitialState = (persisted: { presets: Preset[]; lastPresetId: string; prefs: Prefs }): AppState => ({
  presets: persisted.presets,
  lastPresetId: persisted.lastPresetId,
  items: [],
  selectedId: null,
  mode: 'crop',
  prefs: persisted.prefs,
  savings: { bytes: 0, count: 0 },
  notices: [],
  announcement: '',
  history: EMPTY_HISTORY,
});

/** Fields whose change invalidates a manual crop (aspect or crop semantics change). */
const CROP_AFFECTING: (keyof Preset)[] = ['width', 'height', 'fit'];

const updateItem = (state: AppState, id: string, update: (item: QueueItem) => QueueItem): AppState => ({
  ...state,
  items: state.items.map((item) => (item.id === id ? update(item) : item)),
});

/** Marks the item's output stale. */
const bump = (item: QueueItem): QueueItem => ({ ...item, revision: item.revision + 1, status: 'idle', error: null });

const aspectChanged = (before: Preset, after: Preset): boolean =>
  CROP_AFFECTING.some((key) => before[key] !== after[key]);

export const getItemPreset = (state: Pick<AppState, 'presets'>, item: QueueItem): Preset =>
  resolvePreset(findPreset(state.presets, item.presetId), item.overrides);

export const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'addItems': {
      if (action.items.length === 0) return state;
      const presetId = findPreset(state.presets, state.lastPresetId).id;
      const added: QueueItem[] = action.items.map((item) => ({
        ...item,
        editedBitmap: null,
        cutout: null,
        transform: IDENTITY_TRANSFORM,
        crop: null,
        presetId,
        overrides: {},
        status: 'idle',
        output: null,
        error: null,
        revision: 1,
        outputRevision: 0,
      }));
      const firstAdded = added[0] as QueueItem;
      return {
        ...state,
        items: [...state.items, ...added],
        selectedId: state.selectedId ?? firstAdded.id,
      };
    }

    case 'removeItem': {
      const index = state.items.findIndex((item) => item.id === action.id);
      if (index === -1) return state;
      const items = state.items.filter((item) => item.id !== action.id);
      let selectedId = state.selectedId;
      if (selectedId === action.id) {
        const neighbour = items[Math.min(index, items.length - 1)];
        selectedId = neighbour ? neighbour.id : null;
      }
      return { ...state, items, selectedId };
    }

    case 'selectItem':
      return { ...state, selectedId: action.id };

    case 'selectRelative': {
      if (state.items.length === 0) return state;
      const index = state.items.findIndex((item) => item.id === state.selectedId);
      const next = (index + action.offset + state.items.length) % state.items.length;
      return { ...state, selectedId: (state.items[next] as QueueItem).id };
    }

    case 'setMode':
      return { ...state, mode: action.mode };

    case 'setCrop':
      return updateItem(state, action.id, (item) => bump({ ...item, crop: action.crop }));

    case 'setTransform':
      return updateItem(state, action.id, (item) => bump({ ...item, transform: action.transform, crop: null }));

    case 'setItemPreset': {
      const next = updateItem(state, action.id, (item) => bump({ ...item, presetId: action.presetId, overrides: {}, crop: null }));
      return { ...next, lastPresetId: action.presetId };
    }

    case 'applyPresetToAll':
      return {
        ...state,
        lastPresetId: action.presetId,
        items: state.items.map((item) => bump({ ...item, presetId: action.presetId, overrides: {}, crop: null })),
      };

    case 'setOverrides':
      return updateItem(state, action.id, (item) => {
        const before = getItemPreset(state, item);
        const base = findPreset(state.presets, item.presetId);
        const overrides = effectiveOverrides(base, { ...item.overrides, ...action.patch });
        const after = resolvePreset(base, overrides);
        return bump({ ...item, overrides, crop: aspectChanged(before, after) ? null : item.crop });
      });

    case 'resetOverrides':
      return updateItem(state, action.id, (item) => {
        const before = getItemPreset(state, item);
        const after = findPreset(state.presets, item.presetId);
        return bump({ ...item, overrides: {}, crop: aspectChanged(before, after) ? null : item.crop });
      });

    case 'saveOverridesToPreset': {
      const item = state.items.find((candidate) => candidate.id === action.id);
      if (!item || isBuiltinPreset(item.presetId)) return state;
      const resolved = getItemPreset(state, item);
      return {
        ...state,
        presets: state.presets.map((preset) => (preset.id === resolved.id ? resolved : preset)),
        items: state.items.map((candidate) => (candidate.id === item.id ? { ...candidate, overrides: {} } : candidate)),
      };
    }

    case 'saveOverridesAsNewPreset': {
      const item = state.items.find((candidate) => candidate.id === action.id);
      if (!item) return state;
      const resolved = getItemPreset(state, item);
      const preset: Preset = {
        ...resolved,
        id: action.newPresetId,
        name: uniquePresetName(action.name.trim() || resolved.name, [...BUILTIN_PRESETS, ...state.presets]),
      };
      return {
        ...state,
        presets: [...state.presets, preset],
        lastPresetId: preset.id,
        items: state.items.map((candidate) =>
          candidate.id === item.id ? { ...candidate, presetId: preset.id, overrides: {} } : candidate,
        ),
      };
    }

    case 'setEdit':
      return updateItem(state, action.id, (item) => bump({ ...item, editedBitmap: action.bitmap, cutout: action.cutout }));

    case 'encodeStarted':
      return updateItem(state, action.id, (item) =>
        item.revision === action.revision ? { ...item, status: 'encoding', error: null } : item,
      );

    case 'encodeFinished':
      return updateItem(state, action.id, (item) => {
        if (item.revision !== action.revision) return item;
        return { ...item, status: 'ready', output: action.output, outputRevision: action.revision, error: null };
      });

    case 'encodeFailed':
      return updateItem(state, action.id, (item) =>
        item.revision === action.revision ? { ...item, status: 'error', error: action.error } : item,
      );

    case 'encodeCancelled':
      return updateItem(state, action.id, (item) =>
        item.revision === action.revision && item.status === 'encoding' ? { ...item, status: 'idle' } : item,
      );

    case 'upsertPreset': {
      const exists = state.presets.some((preset) => preset.id === action.preset.id);
      const presets = exists
        ? state.presets.map((preset) => (preset.id === action.preset.id ? action.preset : preset))
        : [...state.presets, action.preset];
      return {
        ...state,
        presets,
        items: state.items.map((item) => (item.presetId === action.preset.id ? bump(item) : item)),
      };
    }

    case 'deletePreset': {
      const presets = state.presets.filter((preset) => preset.id !== action.id);
      return {
        ...state,
        presets,
        lastPresetId: state.lastPresetId === action.id ? DEFAULT_PRESET_ID : state.lastPresetId,
        items: state.items.map((item) =>
          item.presetId === action.id ? bump({ ...item, presetId: DEFAULT_PRESET_ID, overrides: {}, crop: null }) : item,
        ),
      };
    }

    case 'movePreset': {
      const index = state.presets.findIndex((preset) => preset.id === action.id);
      const target = index + action.offset;
      if (index === -1 || target < 0 || target >= state.presets.length) return state;
      const presets = [...state.presets];
      const [moved] = presets.splice(index, 1);
      presets.splice(target, 0, moved as Preset);
      return { ...state, presets };
    }

    case 'replacePresets':
      return { ...state, presets: action.presets };

    case 'setPref':
      return { ...state, prefs: { ...state.prefs, ...action.patch } };

    case 'addSavings': {
      const saved = Math.max(0, action.before - action.after);
      return {
        ...state,
        savings: { bytes: state.savings.bytes + saved, count: state.savings.count + action.count },
        prefs: { ...state.prefs, lifetime: { bytes: state.prefs.lifetime.bytes + saved, count: state.prefs.lifetime.count + action.count } },
      };
    }

    case 'notify':
      return { ...state, notices: [...state.notices.slice(-4), action.notice], announcement: action.notice.message };

    case 'dismissNotice':
      return { ...state, notices: state.notices.filter((notice) => notice.id !== action.id) };

    case 'announce':
      return { ...state, announcement: action.message };
  }
};

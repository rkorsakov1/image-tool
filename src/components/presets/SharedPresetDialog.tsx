import { useEffect, useState } from 'react';
import { parseShareHash } from '../../lib/presetShare';
import { describeMergeSummary, mergePresets } from '../../lib/presetValidation';
import type { Preset } from '../../lib/types';
import { useApp } from '../../state/AppContext';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { describePreset } from './PresetManagerDialog';
import { translateError } from '../../i18n';
import { useT } from '../../i18n/useT';

const clearHash = () => window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);

/** Opening a `#preset=…` link asks before importing the shared presets. */
export const SharedPresetDialog = () => {
  const { state, dispatch, notify } = useApp();
  const t = useT();
  const [incoming, setIncoming] = useState<{ presets: Preset[]; rejected: number } | null>(null);

  useEffect(() => {
    const read = () => {
      const parsed = parseShareHash(window.location.hash);
      if (!parsed) return;
      if (!parsed.ok) {
        notify('error', translateError(parsed.reason));
        clearHash();
        return;
      }
      setIncoming({ presets: parsed.presets, rejected: parsed.rejected });
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [notify]);

  const close = () => {
    setIncoming(null);
    clearHash();
  };

  const merged = incoming ? mergePresets(state.presets, incoming.presets) : null;

  return (
    <Dialog
      open={incoming !== null}
      onClose={close}
      title={t.presets.sharedTitle}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t.presets.cancel}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!merged) return;
              dispatch({ type: 'replacePresets', presets: merged.presets });
              dispatch({ type: 'announce', message: t.presets.imported(describeMergeSummary(merged.summary, incoming?.rejected ?? 0)) });
              close();
            }}
          >
            {t.presets.importButton}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm">{t.presets.sharedText}</p>
      <ul className="space-y-2">
        {incoming?.presets.map((preset) => (
          <li key={preset.id} className="rounded-md border border-line bg-raised p-2">
            <p className="text-sm font-medium">{preset.name}</p>
            <p className="font-mono text-[11px] text-ink-3">{describePreset(preset)}</p>
          </li>
        ))}
      </ul>
      {merged ? <p className="mt-3 text-xs text-ink-3">{describeMergeSummary(merged.summary, incoming?.rejected ?? 0)}.</p> : null}
    </Dialog>
  );
};

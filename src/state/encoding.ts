import { toEncodeSettings } from '../lib/presets';
import type { EncodedOutput, Preset, QueueItem } from '../lib/types';
import type { EncodeResult } from '../worker/protocol';
import type { EncodeHandle, Processor } from '../worker/workerClient';
import { getItemPreset } from './appReducer';

/** Starts encoding one queue item with its current preset, overrides, crop and edits. */
export const encodeQueueItem = (
  processor: Processor,
  item: QueueItem,
  presets: readonly Preset[],
  wantReference: boolean,
): EncodeHandle =>
  processor.encode({
    bitmap: item.editedBitmap ?? item.sourceBitmap,
    transform: item.transform,
    crop: item.crop,
    settings: toEncodeSettings(getItemPreset({ presets: [...presets] }, item)),
    wantReference,
  });

/** Wraps a worker result as the item's output, with an object URL for previews (revoke when replaced). */
export const toEncodedOutput = (result: EncodeResult): EncodedOutput => ({
  blob: result.blob,
  url: URL.createObjectURL(result.blob),
  width: result.width,
  height: result.height,
  quality: result.quality,
  encoder: result.encoder,
  warning: result.warning,
});

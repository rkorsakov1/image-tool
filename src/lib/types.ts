export type OutputFormat = 'jpeg' | 'webp' | 'avif' | 'png';
export type FitMode = 'cover' | 'contain';

export type Preset = {
  id: string;
  name: string;
  /** null = derive from height + source aspect */
  width: number | null;
  /** null = derive from width + source aspect; both null = original size */
  height: number | null;
  /** cover = crop to fill; contain = fit whole image and pad */
  fit: FitMode;
  format: OutputFormat;
  /** 0–100; ignored for png */
  quality: number;
  /** if set, search for the highest quality whose output is <= this many bytes */
  targetMaxBytes: number | null;
  /** hex; used for contain padding and alpha→JPEG */
  matteColor: string;
  allowUpscale: boolean;
  filenameTemplate: string;
  /** unsharp-mask amount after downscaling, 0–100; 0 = off */
  sharpen: number;
};

export type PresetFile = { app: 'localcrop'; schemaVersion: 1; presets: Preset[] };

/** In source pixels of the transformed (rotated/flipped) image. */
export type CropRect = { x: number; y: number; width: number; height: number };

export type Rotation = 0 | 90 | 180 | 270;
export type Transform = { rotation: Rotation; flipH: boolean; flipV: boolean };

/** The subset of a preset that affects encoding. */
export type EncodeSettings = Pick<
  Preset,
  'width' | 'height' | 'fit' | 'format' | 'quality' | 'targetMaxBytes' | 'matteColor' | 'allowUpscale' | 'sharpen'
>;

export type EncodedOutput = {
  blob: Blob;
  url: string;
  width: number;
  height: number;
  quality: number;
  encoder: 'wasm' | 'native';
  warning: string | null;
};

export type QueueStatus = 'idle' | 'encoding' | 'ready' | 'error';

export type QueueItem = {
  id: string;
  sourceName: string;
  sourceBytes: number;
  sourceType: string;
  /** decoded, EXIF orientation applied */
  sourceBitmap: ImageBitmap;
  /** after retouch / bg removal; null = none */
  editedBitmap: ImageBitmap | null;
  transform: Transform;
  /** null = auto (recomputed from preset) */
  crop: CropRect | null;
  presetId: string;
  /** per-image tweaks without editing the preset */
  overrides: Partial<Preset>;
  status: QueueStatus;
  output: EncodedOutput | null;
  error: string | null;
  /** bumped whenever something that affects the output changes */
  revision: number;
  /** revision the current output was produced from */
  outputRevision: number;
};

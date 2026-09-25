export type QualitySearchResult = {
  quality: number;
  bytes: number;
  /** false when even the minimum quality is above the target */
  reachable: boolean;
};

export type QualitySearchOptions = { min?: number; max?: number; maxIterations?: number };

/**
 * Binary-searches for the highest integer quality whose encoded size is <= target.
 * Assumes size grows monotonically with quality. `encode` returns the byte size.
 * If no quality within `maxIterations` fits, the minimum quality is encoded (if it
 * wasn't already) and returned with `reachable: false`.
 */
export const findQualityForTarget = async (
  encode: (quality: number) => Promise<number>,
  target: number,
  { min = 30, max = 95, maxIterations = 7 }: QualitySearchOptions = {},
): Promise<QualitySearchResult> => {
  let low = min;
  let high = max;
  let best: { quality: number; bytes: number } | null = null;
  const tried = new Map<number, number>();

  for (let iteration = 0; iteration < maxIterations && low <= high; iteration += 1) {
    const quality = Math.round((low + high) / 2);
    const bytes = await encode(quality);
    tried.set(quality, bytes);
    if (bytes <= target) {
      best = { quality, bytes };
      low = quality + 1;
    } else {
      high = quality - 1;
    }
  }

  if (best) return { ...best, reachable: true };

  const minBytes = tried.get(min) ?? (await encode(min));
  return { quality: min, bytes: minBytes, reachable: minBytes <= target };
};

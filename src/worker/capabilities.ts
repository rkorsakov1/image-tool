/** True if OffscreenCanvas with a 2D context exists (missing in some WebKit builds). */
export const supportsOffscreen2d = (): boolean => {
  try {
    return typeof OffscreenCanvas !== 'undefined' && new OffscreenCanvas(1, 1).getContext('2d') !== null;
  } catch {
    return false;
  }
};

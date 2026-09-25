/**
 * Light unsharp mask for use after downscaling. `amount` is 0–100 (100 adds the full
 * high-pass detail once more). Uses a separable 1-2-1 blur (radius 1), which suits the
 * softness introduced by high-quality downsampling. Alpha is left untouched.
 */
export const unsharpMask = (data: Uint8ClampedArray, width: number, height: number, amount: number): void => {
  if (amount <= 0 || width < 3 || height < 3) return;
  const strength = Math.min(100, amount) / 100;
  const pixelCount = width * height;
  const horizontal = new Float32Array(pixelCount * 3);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - 1);
      const right = Math.min(width - 1, x + 1);
      for (let channel = 0; channel < 3; channel += 1) {
        const at = (column: number) => data[(y * width + column) * 4 + channel] as number;
        horizontal[(y * width + x) * 3 + channel] = (at(left) + 2 * at(x) + at(right)) / 4;
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    const up = Math.max(0, y - 1);
    const down = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        const at = (row: number) => horizontal[(row * width + x) * 3 + channel] as number;
        const blurred = (at(up) + 2 * at(y) + at(down)) / 4;
        const index = (y * width + x) * 4 + channel;
        const original = data[index] as number;
        data[index] = original + strength * (original - blurred);
      }
    }
  }
};

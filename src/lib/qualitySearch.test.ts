import { describe, expect, it } from 'vitest';
import { findQualityForTarget } from './qualitySearch';

// Size grows linearly with quality: 1000 bytes per quality point.
const mockEncoder = () => {
  const calls: number[] = [];
  const encode = async (quality: number) => {
    calls.push(quality);
    return quality * 1000;
  };
  return { encode, calls };
};

describe('findQualityForTarget', () => {
  it('finds the highest quality under the target', async () => {
    const { encode, calls } = mockEncoder();
    const result = await findQualityForTarget(encode, 72_500);
    expect(result).toEqual({ quality: 72, bytes: 72_000, reachable: true });
    expect(calls.length).toBeLessThanOrEqual(7);
  });

  it('accepts an exact match', async () => {
    const { encode } = mockEncoder();
    expect(await findQualityForTarget(encode, 50_000)).toEqual({ quality: 50, bytes: 50_000, reachable: true });
  });

  it('returns max quality when everything fits', async () => {
    const { encode } = mockEncoder();
    expect((await findQualityForTarget(encode, 1_000_000)).quality).toBe(95);
  });

  it('returns quality 30 with reachable=false when the target is too small', async () => {
    const { encode } = mockEncoder();
    expect(await findQualityForTarget(encode, 10_000)).toEqual({ quality: 30, bytes: 30_000, reachable: false });
  });

  it('never runs more than 7 search iterations plus the minimum fallback', async () => {
    const { encode, calls } = mockEncoder();
    await findQualityForTarget(encode, 1);
    expect(calls.length).toBeLessThanOrEqual(8);
  });
});

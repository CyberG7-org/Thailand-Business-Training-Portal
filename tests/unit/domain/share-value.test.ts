import { describe, expect, it } from 'vitest';
import { valuePerShare } from '@/lib/domain/share-value';

describe('valuePerShare', () => {
  it('keeps the value printed in a DBD document', () => {
    expect(valuePerShare(50, 4_000_000, 40_000)).toBe(50);
  });

  it('calculates a missing value from registered capital and total shares', () => {
    expect(valuePerShare(null, 4_000_000, 40_000)).toBe(100);
    expect(valuePerShare(null, 1_000, 8)).toBe(125);
  });

  it('does not guess when a source number is missing, zero, or not a whole share count', () => {
    expect(valuePerShare(null, null, 40_000)).toBeNull();
    expect(valuePerShare(null, 4_000_000, null)).toBeNull();
    expect(valuePerShare(null, 4_000_000, 0)).toBeNull();
    expect(valuePerShare(null, 4_000_000, 40_000.5)).toBeNull();
  });

  it('does not display a rounded amount that cannot reconcile with the capital', () => {
    expect(valuePerShare(null, 1, 3)).toBeNull();
  });
});

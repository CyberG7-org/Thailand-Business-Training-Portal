import { describe, expect, it } from 'vitest';
import {
  decideCategory,
  failedCategory,
  manualCategory,
  needsRemap,
} from '@/lib/domain/business-category';

const at = '2026-09-30T00:00:00.000Z';
const active = new Set(['clothing_fashion', 'furniture_home']);

describe('decideCategory', () => {
  it('accepts a mapping at or above the threshold automatically', () => {
    expect(
      decideCategory({
        result: { key: 'clothing_fashion', confidence: 0.85 },
        activeKeys: active,
        minConfidencePercent: 85,
        model: 'claude-sonnet-5',
        inputHash: 'h1',
        at,
      }),
    ).toMatchObject({
      status: 'mapped',
      key: 'clothing_fashion',
      source: 'auto',
      confidence: 0.85,
    });
  });

  it('keeps a weaker one as a candidate for review, never as the category', () => {
    expect(
      decideCategory({
        result: { key: 'furniture_home', confidence: 0.6 },
        activeKeys: active,
        minConfidencePercent: 85,
        model: null,
        inputHash: 'h1',
        at,
      }),
    ).toMatchObject({ status: 'needs_review', key: null, candidate_key: 'furniture_home' });
  });

  it('never takes a key that is not an active category', () => {
    expect(
      decideCategory({
        result: { key: 'retired_key', confidence: 0.99 },
        activeKeys: active,
        minConfidencePercent: 85,
        model: null,
        inputHash: 'h1',
        at,
      }),
    ).toMatchObject({ status: 'unmapped', key: null, candidate_key: null });
  });
});

describe('needsRemap', () => {
  it('maps when the business words change, and only then', () => {
    const manual = manualCategory('clothing_fashion', 'h1', at);
    expect(needsRemap(manual, 'h1')).toBe(false);
    expect(needsRemap(manual, 'h2')).toBe(true);
    expect(needsRemap(null, 'h1')).toBe(true);
  });

  it('resets to unmapped once the nature of business is emptied', () => {
    expect(needsRemap(manualCategory('clothing_fashion', 'h1', at), null)).toBe(true);
    expect(needsRemap(failedCategory('no_text', null, at), null)).toBe(false);
  });
});

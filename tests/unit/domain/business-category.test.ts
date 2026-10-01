import { describe, expect, it } from 'vitest';
import {
  decideCategory,
  failedCategory,
  manualCategory,
  needsRemap,
  settleCategory,
} from '@/lib/domain/business-category';

const at = '2026-09-30T00:00:00.000Z';
const active = new Set(['clothing_fashion', 'furniture_home']);

describe('decideCategory', () => {
  it('takes the best match as the category, whatever its confidence (D90)', () => {
    expect(
      decideCategory({
        result: { key: 'clothing_fashion', confidence: 0.85 },
        activeKeys: active,
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
    expect(
      decideCategory({
        result: { key: 'furniture_home', confidence: 0.6 },
        activeKeys: active,
        model: null,
        inputHash: 'h1',
        at,
      }),
    ).toMatchObject({
      status: 'mapped',
      key: 'furniture_home',
      candidate_key: null,
      confidence: 0.6,
    });
  });

  it('never takes a key that is not an active category', () => {
    expect(
      decideCategory({
        result: { key: 'retired_key', confidence: 0.99 },
        activeKeys: active,
        model: null,
        inputHash: 'h1',
        at,
      }),
    ).toMatchObject({ status: 'unmapped', key: null, candidate_key: null });
  });
});

describe('settleCategory', () => {
  it('makes a match that was waiting for a person the category', () => {
    const waiting = {
      ...manualCategory('clothing_fashion', 'h1', at),
      key: null,
      candidate_key: 'furniture_home',
      confidence: 0.6,
      source: 'auto' as const,
      status: 'needs_review' as const,
    };
    expect(settleCategory(waiting)).toMatchObject({
      status: 'mapped',
      key: 'furniture_home',
      candidate_key: null,
      confidence: 0.6,
    });
    const mapped = manualCategory('clothing_fashion', 'h1', at);
    expect(settleCategory(mapped)).toBe(mapped);
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

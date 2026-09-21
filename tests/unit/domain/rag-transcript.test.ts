import { describe, expect, it } from 'vitest';
import { MAX_INDEX_ATTEMPTS, retryDelayMinutes } from '@/lib/domain/rag/jobs';
import {
  MissingPagesError,
  formatPageMarkers,
  parsePageMarkers,
  planSlice,
} from '@/lib/domain/rag/transcript';

describe('planSlice', () => {
  it('walks a document in slices of five pages', () => {
    expect(planSlice(12, 1)).toEqual({ firstPage: 1, lastPage: 5 });
    expect(planSlice(12, 6)).toEqual({ firstPage: 6, lastPage: 10 });
    expect(planSlice(12, 11)).toEqual({ firstPage: 11, lastPage: 12 });
  });

  it('returns null once every page is done or the document is empty', () => {
    expect(planSlice(12, 13)).toBeNull();
    expect(planSlice(0, 1)).toBeNull();
  });

  it('honours a custom slice size', () => {
    expect(planSlice(3, 1, 2)).toEqual({ firstPage: 1, lastPage: 2 });
  });
});

describe('parsePageMarkers', () => {
  const slice = { firstPage: 4, lastPage: 6 };

  it('splits a transcript on its page markers, trimming each page', () => {
    const text =
      'preamble to ignore\n=== PAGE 4 ===\nหน้าสี่\n\n=== PAGE 5 ===\n  หน้าห้า  \n=== PAGE 6 ===\n';
    expect(parsePageMarkers(text, slice)).toEqual([
      { page: 4, text: 'หน้าสี่' },
      { page: 5, text: 'หน้าห้า' },
      { page: 6, text: '' },
    ]);
  });

  it('lists every missing page', () => {
    expect(() => parsePageMarkers('=== PAGE 4 ===\nx\n=== PAGE 6 ===\ny', slice)).toThrow(
      MissingPagesError,
    );
    try {
      parsePageMarkers('=== PAGE 4 ===\nx', slice);
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as MissingPagesError).missing).toEqual([5, 6]);
    }
  });

  it('keeps the first occurrence of a duplicated marker and ignores pages outside the slice', () => {
    const text =
      '=== PAGE 3 ===\nno\n=== PAGE 4 ===\nfirst\n=== PAGE 4 ===\nsecond\n=== PAGE 5 ===\nb\n=== PAGE 6 ===\nc';
    expect(parsePageMarkers(text, slice)[0]).toEqual({ page: 4, text: 'first' });
  });

  it('round-trips formatPageMarkers', () => {
    const pages = [
      { page: 1, text: 'ก' },
      { page: 2, text: 'ข\nค' },
    ];
    expect(parsePageMarkers(formatPageMarkers(pages), { firstPage: 1, lastPage: 2 })).toEqual(
      pages,
    );
  });
});

describe('index job retries', () => {
  it('backs off 1, 2, 4, 8, 16 minutes and stops after five attempts', () => {
    expect([1, 2, 3, 4, 5].map(retryDelayMinutes)).toEqual([1, 2, 4, 8, 16]);
    expect(retryDelayMinutes(9)).toBe(16);
    expect(MAX_INDEX_ATTEMPTS).toBe(5);
  });
});

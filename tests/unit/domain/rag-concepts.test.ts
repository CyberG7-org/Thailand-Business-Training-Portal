import { describe, expect, it } from 'vitest';
import { cardConceptGroup } from '@/lib/content/bank-interview-cards';
import { CONCEPT_GROUPS, conceptGroupQuery, conceptQueries } from '@/lib/domain/rag/concepts';
import { DEFAULT_DIRECT_READ_MAX_PAGES, directReadMaxPages } from '@/lib/domain/rag/jobs';

describe('concept queries', () => {
  it("uses the bank's own Thai questions as retrieval keys, one per concept", () => {
    expect(CONCEPT_GROUPS).toEqual(['identity', 'ownership', 'business_plan', 'personal']);
    expect(conceptQueries('identity')).toContain('บริษัทชื่ออะไร');
    // The lawyers' list has two personal-role questions (position/duties, commenced operations).
    expect(conceptQueries('personal')).toHaveLength(2);
    expect(conceptQueries('personal').join(' ')).toContain('ตำแหน่ง');
    expect(conceptGroupQuery('ownership')).toContain('ผู้ถือหุ้น');
    expect(conceptGroupQuery('ownership').split(' ').length).toBeGreaterThan(3);
  });
});

describe('starter cards → concept groups', () => {
  it('maps the four concept cards and leaves the tips card unmapped', () => {
    expect(cardConceptGroup('bank-interview-1-identity')).toBe('identity');
    expect(cardConceptGroup('bank-interview-2-ownership')).toBe('ownership');
    expect(cardConceptGroup('bank-interview-3-business')).toBe('business_plan');
    expect(cardConceptGroup('bank-interview-4-role')).toBe('personal');
    expect(cardConceptGroup('bank-interview-5-tips')).toBeNull();
    expect(cardConceptGroup('some-other-card')).toBeNull();
  });
});

describe('directReadMaxPages', () => {
  it('defaults to 20 and honours a sane override', () => {
    expect(DEFAULT_DIRECT_READ_MAX_PAGES).toBe(20);
    expect(directReadMaxPages({})).toBe(20);
    expect(directReadMaxPages({ DIRECT_READ_MAX_PAGES: '5' })).toBe(5);
    expect(directReadMaxPages({ DIRECT_READ_MAX_PAGES: '0' })).toBe(20);
    expect(directReadMaxPages({ DIRECT_READ_MAX_PAGES: 'x' })).toBe(20);
  });
});

import { describe, expect, it } from 'vitest';
import { businessProfileSchema } from '@/lib/domain/dbd-profile';
import {
  EMPTY_SWEEP,
  sanitizeSweptLists,
  selectByTypeAuthority,
  type SweepResult,
} from '@/lib/integrations/extraction/transcript-schema';

const row = (name: string, shares = 1) => ({ name, nationality: 'ไทย', shares, percent: null });

describe('selectByTypeAuthority', () => {
  it('takes each list only from the document type that is authoritative for it', () => {
    const memorandum: SweepResult = {
      ...structuredClone(EMPTY_SWEEP),
      shareholders: [row('ผู้เริ่มก่อการ เก่า', 1)], // initial subscribers, not current holders
      promoters: [{ name: 'ผู้เริ่มก่อการ เก่า', nationality: 'ไทย' }],
      share_structure: {
        total_shares: 100,
        par_value: 10,
        paid_up_capital: null,
        share_type: null,
      },
    };
    const list: SweepResult = {
      ...structuredClone(EMPTY_SWEEP),
      shareholders: [row('ผู้ถือหุ้น ปัจจุบัน', 9999)],
      share_structure: {
        total_shares: 10000,
        par_value: 100,
        paid_up_capital: null,
        share_type: null,
      },
    };
    const sheet: SweepResult = {
      ...structuredClone(EMPTY_SWEEP),
      objectives: [{ no: 1, text: 'ค้าปลีก' }],
    };
    const picked = selectByTypeAuthority([
      { type: 'memorandum', result: memorandum },
      { type: 'shareholder_list', result: list },
      { type: 'objectives_sheet', result: sheet },
    ]);
    expect(picked.shareholders.map((s) => s.name)).toEqual(['ผู้ถือหุ้น ปัจจุบัน']);
    expect(picked.share_structure.total_shares).toBe(10000);
    expect(picked.promoters.map((p) => p.name)).toEqual(['ผู้เริ่มก่อการ เก่า']);
    expect(picked.objectives).toEqual([{ no: 1, text: 'ค้าปลีก' }]);
  });

  it('falls back to the certificate for objectives and to the memorandum for the share structure', () => {
    const cert: SweepResult = {
      ...structuredClone(EMPTY_SWEEP),
      objectives: [{ no: 1, text: 'x' }],
    };
    const memo: SweepResult = {
      ...structuredClone(EMPTY_SWEEP),
      share_structure: { total_shares: 5, par_value: 1, paid_up_capital: null, share_type: null },
    };
    const picked = selectByTypeAuthority([
      { type: 'certificate', result: cert },
      { type: 'memorandum', result: memo },
    ]);
    expect(picked.objectives).toHaveLength(1);
    expect(picked.share_structure.total_shares).toBe(5);
    expect(picked.shareholders).toEqual([]);
  });
});

describe('sanitizeSweptLists', () => {
  it('drops nameless rows and keeps the result readable by the stored profile schema', () => {
    const swept: SweepResult = {
      ...structuredClone(EMPTY_SWEEP),
      shareholders: [row(''), row('  '), row('นาย ก')],
      objectives: [
        { no: 1, text: '' },
        { no: 2, text: 'ส่งออก' },
      ],
      promoters: [{ name: '', nationality: null }],
    };
    const clean = sanitizeSweptLists(swept);
    expect(clean.shareholders.map((s) => s.name)).toEqual(['นาย ก']);
    expect(clean.objectives).toEqual([{ no: 2, text: 'ส่งออก' }]);
    expect(clean.promoters).toEqual([]);
    expect(businessProfileSchema.safeParse({ ...clean, business_categories: [] }).success).toBe(
      true,
    );
  });

  it('keeps a whole big shareholder list readable (thousands of rows)', () => {
    const swept: SweepResult = {
      ...structuredClone(EMPTY_SWEEP),
      shareholders: Array.from({ length: 3000 }, (_, i) => row(`ผู้ถือหุ้น ${i}`)),
    };
    const clean = sanitizeSweptLists(swept);
    expect(clean.shareholders).toHaveLength(3000);
    expect(businessProfileSchema.safeParse({ ...clean, business_categories: [] }).success).toBe(
      true,
    );
  });
});

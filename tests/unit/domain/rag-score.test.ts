import { describe, expect, it } from 'vitest';
import { trigramOverlap, trigrams } from '@/lib/domain/rag/score';

describe('trigram scoring', () => {
  it('ignores case, spaces and punctuation', () => {
    expect(trigrams('ทุน จดทะเบียน.')).toEqual(trigrams('ทุนจดทะเบียน'));
    expect(trigrams('ABC')).toEqual(trigrams('abc'));
  });

  it('scores an exact phrase 1 and an unrelated one 0', () => {
    expect(trigramOverlap('ทุนจดทะเบียน', 'ทุนจดทะเบียน 2,000,000 บาท')).toBe(1);
    expect(trigramOverlap('ทุนจดทะเบียน', 'กรรมการบริษัท')).toBe(0);
    expect(trigramOverlap('', 'อะไรก็ได้')).toBe(0);
  });

  it('ranks the passage that contains the query above one that only shares a word', () => {
    const q = 'สำนักงานแห่งใหญ่ตั้งอยู่ที่ไหน';
    const a = 'สำนักงานแห่งใหญ่ ตั้งอยู่เลขที่ 99/9 หมู่ 1';
    const b = 'บริษัทมีวัตถุประสงค์เพื่อประกอบกิจการ';
    expect(trigramOverlap(q, a)).toBeGreaterThan(trigramOverlap(q, b));
  });
});

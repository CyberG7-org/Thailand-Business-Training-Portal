import { describe, expect, it } from 'vitest';
import { revealedFact } from '@/lib/domain/interview/leak';

const facts = {
  company_name_th: 'บริษัท ธาราวาณิช จำกัด',
  juristic_id: '0105568233704',
  directors: 'นางสาวพัชรณัฏฐ์ จิรเมธวัชร, นายสมชาย ใจดี',
  directors_count: '1',
  nature_of_business: 'ค้าปลีก',
  registered_capital: '1,000,000',
};

/** Spec §4.3: the officer never states a company fact; this is the check behind the prompt. */
describe('revealedFact', () => {
  it('is null for a question that states nothing', () => {
    expect(revealedFact('เลขทะเบียนนิติบุคคลของบริษัทคือหมายเลขอะไรคะ', facts)).toBeNull();
  });

  it('catches the registration number and the company name', () => {
    expect(revealedFact('เลขทะเบียนคือ 0105568233704 ใช่ไหมคะ', facts)).toBe('0105568233704');
    expect(revealedFact('บริษัท ธาราวาณิช จำกัด ใช่ไหมคะ', facts)).toBe('บริษัท ธาราวาณิช จำกัด');
  });

  it('catches one name out of a joined list', () => {
    expect(revealedFact('กรรมการคือ นายสมชาย ใจดี ใช่ไหมคะ', facts)).toBe('นายสมชาย ใจดี');
  });

  it('ignores values too short to be a leak', () => {
    expect(revealedFact('บริษัทมีกรรมการ 1 คน ทำค้าปลีกใช่ไหมคะ', facts)).toBeNull();
  });
});

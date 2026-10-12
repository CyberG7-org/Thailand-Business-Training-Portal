import { describe, expect, it } from 'vitest';
import { companyImageToDraft } from '@/lib/domain/company-image';
import { companyImageSchema } from '@/lib/integrations/extraction/company-image';
import { businessNature } from '@/lib/domain/business-natures';
import { withBusinessNatureFigures } from '@/lib/domain/invoices/answers';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';

const salon = companyImageSchema.parse({
  company_name_th: 'บริษัท อู่ฟองไท จำกัด',
  company_name_en: 'UFONG TAI CO., LTD.',
  juristic_id: '0145569002463',
  registered_on: '7 เมษายน 2569',
  registered_capital: 1000000,
  directors: [{ name_th: 'นางสาวสิริรัตน์ ดวงจันทร์', name_en: '' }],
  shareholders: [
    { name: 'นางสาวสิริรัตน์ ดวงจันทร์', percent: 90 },
    { name: 'นางสุรรณา มอบบำรุง', percent: 10 },
  ],
  objectives: ['ให้บริการเสริมสวย', 'จำหน่ายผลิตภัณฑ์บำรุงเส้นผม'],
  head_office_address: '35/148 หมู่ 3 จังหวัดปทุมธานี',
  province: 'ปทุมธานี',
  website: 'www.ufongtai.com',
  facebook_page: 'www.facebook.com/ufongtai',
  nature_of_business: 'ให้บริการเสริมสวยด้านเส้นผม',
  products_services: 'ตัดผม ทำสีผม ผลิตภัณฑ์บำรุงเส้นผม',
  product_samples: ['แชมพู', 'ครีมนวด'],
});

describe('company image intake', () => {
  it('maps visible facts into editable company, business and interview records', () => {
    const draft = companyImageToDraft(salon);
    expect(draft.record.registered_on).toBe('2026-04-07');
    expect(draft.record.signing_authority).toBe(salon.directors[0].name_th);
    expect(draft.business.shareholders.map((person) => person.percent)).toEqual([90, 10]);
    expect(draft.business.share_structure.paid_up_capital).toBe(draft.record.registered_capital);
    expect(draft.business.objectives).toHaveLength(2);
    expect(draft.interview.nature_of_business).toBe(salon.nature_of_business);
    expect(draft.interview.products_services).toContain('แชมพู');
    expect(draft.website).toBe('https://www.ufongtai.com');
    expect(draft.facebookPage).toBe('https://www.facebook.com/ufongtai');
  });

  it('leaves absent links blank and uses the renamed category without changing figures', () => {
    const draft = companyImageToDraft({ ...salon, website: '', facebook_page: '' });
    expect(draft.website).toBeNull();
    expect(draft.facebookPage).toBeNull();
    expect(businessNature('beauty_products')?.[1]).toBe('Beauty & Cosmetic Products Trading');
    const filled = withBusinessNatureFigures(EMPTY_INTERVIEW_PROFILE, 'beauty_products');
    expect(filled.monthly_revenue).toContain('1,500,000');
    expect(filled.monthly_transactions).toContain('2,000');
    expect(filled.average_transaction).toContain('1,000');
  });
});

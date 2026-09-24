import { describe, expect, it } from 'vitest';
import { TEMPLATE_FIELDS } from '@/lib/domain/assessment/template';
import {
  BANK_INTERVIEW_CONCEPTS,
  REQUIRED_INTERVIEW_FIELDS,
  interviewProfileSchema,
  missingBusinessAnswers,
  myShareholding,
} from '@/lib/domain/bank-interview';
import { bannedLiterals } from '@/lib/integrations/question-gen/dbd-reference';
import { BANK_INTERVIEW_CARDS } from '@/lib/content/bank-interview-cards';
import { DBD_CERTIFICATE_REFERENCE } from '@/lib/integrations/question-gen/dbd-reference';
import { BANK_OFFICER_SCRIPT } from '@/lib/integrations/vapi/config';

describe('bank-interview concepts', () => {
  it('lists the 16 questions from the bank, each with placeholders that exist', () => {
    expect(BANK_INTERVIEW_CONCEPTS).toHaveLength(16);
    for (const concept of BANK_INTERVIEW_CONCEPTS) {
      expect(concept.placeholders.length).toBeGreaterThan(0);
      for (const p of concept.placeholders) expect(TEMPLATE_FIELDS).toContain(p);
      expect(concept.question.th.length).toBeGreaterThan(3);
      expect(concept.question.zh.length).toBeGreaterThan(3);
    }
    expect(new Set(BANK_INTERVIEW_CONCEPTS.map((c) => c.id)).size).toBe(16);
  });

  it('is what the question generator and the call script are built on', () => {
    for (const concept of BANK_INTERVIEW_CONCEPTS) {
      expect(DBD_CERTIFICATE_REFERENCE).toContain(concept.question.en);
    }
    // The officer script covers every concept (numbered 1–16) and reads every fact variable.
    for (let i = 1; i <= 16; i++) expect(BANK_OFFICER_SCRIPT).toMatch(new RegExp(`\\n${i}\\. `));
    for (const v of ['my_shares', 'account_purpose', 'operations_status', 'shareholders_count']) {
      expect(BANK_OFFICER_SCRIPT).toContain(`{{${v}}}`);
    }
  });

  it('starter cards cover every concept placeholder in all three languages', () => {
    const covered = new Set<string>();
    for (const card of BANK_INTERVIEW_CARDS) {
      for (const lang of ['th', 'en', 'zh'] as const) {
        for (const m of card.localizations[lang].body.matchAll(/\{([a-z_]+)\}/g)) {
          expect(TEMPLATE_FIELDS).toContain(m[1]);
          covered.add(m[1]);
        }
      }
    }
    for (const concept of BANK_INTERVIEW_CONCEPTS) {
      expect(concept.placeholders.some((p) => covered.has(p))).toBe(true);
    }
  });

  it('matches the learner to a shareholder by name and derives the percentage', () => {
    const business = {
      objectives: [],
      business_categories: [],
      share_structure: {
        total_shares: 20000,
        par_value: 100,
        paid_up_capital: null,
        share_type: null,
      },
      shareholders: [
        { name: 'นางสาว ตัวอย่าง ทดสอบ', nationality: 'ไทย', shares: 19998, percent: null },
        { name: 'นายสอง ทดสอบ', nationality: 'ไทย', shares: 1, percent: null },
      ],
      promoters: [],
    };
    expect(myShareholding(business, 'นางสาวตัวอย่าง ทดสอบ')).toEqual({
      shares: 19998,
      percent: 99.99,
    });
    expect(myShareholding(business, 'ไม่มีคนนี้')).toEqual({ shares: null, percent: null });
    expect(myShareholding(null, 'x')).toEqual({ shares: null, percent: null });
    expect(interviewProfileSchema.parse({ account_purpose: ' รับเงินลูกค้า ' })).toMatchObject({
      account_purpose: 'รับเงินลูกค้า',
      monthly_volume: null,
    });
  });
});

describe('the four answers the manager owes after uploading a pack', () => {
  const filled = {
    contact_email: 'info@thara-vanich.co.th',
    contact_phone: '02-123-4567',
    nature_of_business: 'ขายเสื้อผ้าและเครื่องประดับออนไลน์',
    products_services: 'เสื้อผ้าสตรีนำเข้าจากเกาหลี ขายผ่าน LINE และ TikTok',
  };

  it('stores the company contact and what the business does', () => {
    const profile = interviewProfileSchema.parse(filled);
    expect(profile.contact_email).toBe('info@thara-vanich.co.th');
    expect(profile.contact_phone).toBe('02-123-4567');
    expect(profile.nature_of_business).toBe('ขายเสื้อผ้าและเครื่องประดับออนไลน์');
    expect(profile.products_services).toContain('TikTok');
  });

  it('keeps the phone exactly as typed, mobile or landline (D47)', () => {
    for (const typed of ['02-123-4567', '081 234 5678', '+66 2 123 4567', '๐๘๑๒๓๔๕๖๗๘']) {
      expect(interviewProfileSchema.parse({ contact_phone: typed }).contact_phone).toBe(typed);
    }
  });

  it('refuses an email that is not one', () => {
    expect(() => interviewProfileSchema.parse({ contact_email: 'not-an-email' })).toThrow();
    expect(interviewProfileSchema.parse({ contact_email: '  ' }).contact_email).toBeNull();
  });

  it('names exactly what is still missing', () => {
    expect(missingBusinessAnswers(null)).toEqual([...REQUIRED_INTERVIEW_FIELDS]);
    expect(missingBusinessAnswers(interviewProfileSchema.parse({}))).toEqual([
      ...REQUIRED_INTERVIEW_FIELDS,
    ]);
    expect(missingBusinessAnswers(interviewProfileSchema.parse(filled))).toEqual([]);
    const partial = interviewProfileSchema.parse({ ...filled, products_services: null });
    expect(missingBusinessAnswers(partial)).toEqual(['products_services']);
  });

  it('teaches and tests what the company does, but never its contact details', () => {
    expect(TEMPLATE_FIELDS).toContain('nature_of_business');
    expect(TEMPLATE_FIELDS).toContain('products_services');
    // Contact details are record-keeping, not study facts (owner, 2026-09-24): keeping them out
    // of the template vocabulary is what makes "never in a question" structural.
    expect(TEMPLATE_FIELDS).not.toContain('contact_email');
    expect(TEMPLATE_FIELDS).not.toContain('contact_phone');

    const activity = BANK_INTERVIEW_CONCEPTS.find((c) => c.id === 'business_activity')!;
    expect(activity.placeholders).toContain('nature_of_business');
    expect(activity.placeholders).toContain('products_services');
  });

  it('bans the contact details and any distinctive business text from stored questions', () => {
    const banned = bannedLiterals({
      company_name_th: null,
      company_name_en: null,
      juristic_id: null,
      certificate_no: null,
      registered_on: null,
      issued_on: null,
      registered_capital: null,
      head_office_address: null,
      directors: null,
      signing_authority: null,
      objectives_count: null,
      issuing_office: null,
      registrar_name: null,
      interview: interviewProfileSchema.parse(filled),
    });
    expect(banned).toContain('info@thara-vanich.co.th');
    expect(banned).toContain('02-123-4567');
    expect(banned).toContain('ขายเสื้อผ้าและเครื่องประดับออนไลน์');

    // A short, generic answer would reject honest generic questions, so it is not banned.
    const generic = bannedLiterals({
      company_name_th: null,
      company_name_en: null,
      juristic_id: null,
      certificate_no: null,
      registered_on: null,
      issued_on: null,
      registered_capital: null,
      head_office_address: null,
      directors: null,
      signing_authority: null,
      objectives_count: null,
      issuing_office: null,
      registrar_name: null,
      interview: interviewProfileSchema.parse({ nature_of_business: 'ค้าปลีก' }),
    });
    expect(generic).not.toContain('ค้าปลีก');
  });
});

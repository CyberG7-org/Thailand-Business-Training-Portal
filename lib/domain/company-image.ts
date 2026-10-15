import { dbdRecordInputSchema, type DbdRecordInput } from './dbd-record';
import { businessProfileSchema, type BusinessProfile } from './dbd-profile';
import { interviewProfileSchema, type InterviewProfile } from './bank-interview';
import { toFacebookPage, toWebAddress } from './learner-contact';
import { parseDateInput } from './thai-date';
import type { CompanyImageProfile } from '@/lib/integrations/extraction/company-image';

const clean = (value: string) => value.trim() || null;

/** The image's visible facts, with unsupported/malformed fields left for manager correction. */
export function companyImageToDraft(profile: CompanyImageProfile): {
  record: DbdRecordInput;
  business: BusinessProfile;
  interview: InterviewProfile;
  website: string | null;
  facebookPage: string | null;
} {
  const firstDirector =
    profile.directors.map((person) => person.name_th.trim()).find(Boolean) ?? '';
  const record = dbdRecordInputSchema.parse({
    company_name_th: clean(profile.company_name_th),
    company_name_en: clean(profile.company_name_en),
    juristic_id: /^\d{13}$/.test(profile.juristic_id.replace(/\D/g, ''))
      ? profile.juristic_id.replace(/\D/g, '')
      : null,
    registered_on: parseDateInput(profile.registered_on),
    registered_capital: profile.registered_capital,
    directors: profile.directors
      .filter((person) => person.name_th.trim())
      .map((person) => ({
        name_th: person.name_th.trim(),
        name_en: clean(person.name_en),
      })),
    // Product rule: the named director is the expected training answer. The manager reviews
    // this assumption; the image alone is not legal evidence of signing authority.
    signing_authority: firstDirector || null,
    head_office_address: clean(profile.head_office_address),
    province: clean(profile.province),
    objectives_count: profile.objectives.length || null,
  });
  const business = businessProfileSchema.parse({
    share_structure: {
      paid_up_capital: record.registered_capital,
      total_shares: profile.total_shares,
    },
    objectives: profile.objectives
      .filter((item) => item.trim())
      .map((text, index) => ({
        no: index + 1,
        text: text.trim(),
      })),
    shareholders: profile.shareholders
      .filter((item) => item.name.trim())
      .map((item) => ({
        name: item.name.trim(),
        shares: item.shares,
        percent: item.percent,
      })),
  });
  const products = [
    profile.products_services.trim(),
    ...profile.product_samples.map((item) => item.trim()),
  ].filter(Boolean);
  const interview = interviewProfileSchema.parse({
    nature_of_business: clean(profile.nature_of_business),
    products_services: products.length ? [...new Set(products)].join(' · ') : null,
  });
  return {
    record,
    business,
    interview,
    website: clean(profile.website) ? toWebAddress(profile.website.trim()) : null,
    facebookPage: clean(profile.facebook_page)
      ? toFacebookPage(profile.facebook_page.trim())
      : null,
  };
}

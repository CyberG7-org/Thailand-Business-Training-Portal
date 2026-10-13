import type { TemplateRecord } from '@/lib/domain/assessment/template';
import type { FactSheet } from './fact-sheet';

/** Only descriptive answers are translated. Legal names, addresses, IDs and dates stay exact. */
export const TRANSLATABLE_FIELDS = [
  'signing_authority',
  'nature_of_business',
  'products_services',
  'business_purpose',
  'main_clients',
  'client_origin',
  'main_suppliers',
  'source_of_funds',
  'account_purpose',
  'promptpay_qr_purpose',
  'customer_profile',
  'transaction_details',
  'revenue_basis',
  'first_incoming_funds',
  'my_position',
  'my_responsibilities',
  'my_relationship',
  'monthly_revenue',
  'average_transaction',
  'monthly_transactions',
  'clients_location',
  'suppliers_location',
  'monthly_volume',
  'operations_status',
] as const;

export type TranslatableField = (typeof TRANSLATABLE_FIELDS)[number];
export type FactTranslations = Partial<Record<TranslatableField, string>>;
type Source = Partial<Record<TranslatableField, string | null | undefined>>;

export function translatableFacts(source: Source): FactTranslations {
  const result: FactTranslations = {};
  for (const field of TRANSLATABLE_FIELDS) {
    const value = source[field]?.trim();
    if (value && /[\u0e00-\u0e7f]/u.test(value)) result[field] = value;
  }
  return result;
}

/** The same dictionary can be applied to study templates and the quiz fact sheet. */
export function translatedRecord<T extends TemplateRecord | FactSheet>(
  source: T,
  translated: FactTranslations,
): T {
  const result = { ...source };
  for (const field of TRANSLATABLE_FIELDS) {
    const value = translated[field]?.trim();
    if (value && typeof source[field as keyof T] === 'string') {
      Object.assign(result, { [field]: value });
    }
  }
  return result;
}

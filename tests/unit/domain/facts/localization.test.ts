import { describe, expect, it } from 'vitest';
import { translatableFacts, translatedRecord } from '@/lib/domain/facts/localization';
import { SAMPLE_CONTEXT } from '@/lib/domain/mcq/sample';

describe('company fact localization', () => {
  it('selects descriptive Thai text without changing legal facts', () => {
    const source = SAMPLE_CONTEXT.facts;
    const selected = translatableFacts(source);
    expect(selected.nature_of_business).toBe(source.nature_of_business);
    expect(selected.products_services).toBe(source.products_services);
    expect(selected).not.toHaveProperty('company_name_th');
    expect(selected).not.toHaveProperty('address');
    expect(selected).not.toHaveProperty('juristic_id');

    const shown = translatedRecord(source, {
      nature_of_business: 'Wholesale and retail of women’s clothing',
      products_services: 'Dresses, shirts and skirts',
    });
    expect(shown.nature_of_business).toContain('Wholesale');
    expect(shown.company_name_th).toBe(source.company_name_th);
    expect(shown.juristic_id).toBe(source.juristic_id);
    expect(shown.address).toEqual(source.address);
    expect(source.nature_of_business).toContain('เสื้อผ้า');
  });
});

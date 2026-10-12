import { describe, expect, it } from 'vitest';
import { BUSINESS_NATURES, businessNature } from '@/lib/domain/business-natures';

describe('business natures', () => {
  it('contains 40 unique categories with the PDF planning figures', () => {
    expect(BUSINESS_NATURES).toHaveLength(40);
    expect(BUSINESS_NATURES[0].slice(1, 5)).toEqual([
      'Animal Feed Distributor',
      2700000,
      500,
      8500,
    ]);
    expect(businessNature('hair_salon')?.slice(1, 5)).toEqual([
      'Hair Salon & Beauty Services',
      1200000,
      1500,
      1000,
    ]);
    expect(BUSINESS_NATURES[39].slice(1, 5)).toEqual([
      'Agriculture & Farming Products',
      2000000,
      500,
      4000,
    ]);
  });

  it('retains the existing key for the renamed electronics category', () => {
    expect(businessNature('it_house')?.[1]).toBe('Electronics, Appliances & Computer Equipment');
    expect(new Set(BUSINESS_NATURES.map(([key]) => key)).size).toBe(BUSINESS_NATURES.length);
  });
});

import { describe, expect, it } from 'vitest';
import { BUSINESS_NATURES, businessNature } from '@/lib/domain/business-natures';

const approvedCategories = [
  ['Animal Feed Distributor', 2700000, 300, 8500],
  ['Household Product', 1500000, 2400, 600],
  ['Cleaning Product', 1500000, 2700, 500],
  ['Pet Shop', 1500000, 1800, 800],
  ['Hardware & Industrial Supplies', 1800000, 900, 2500],
  ["Baby & Children's Products Retail & Wholesale", 1500000, 1200, 1200],
  ['Fashion Accessories Retail & Wholesale', 1200000, 1800, 600],
  ['Beauty Products and Services', 1500000, 1800, 800],
  ['Motorcycle Parts Trading', 1800000, 900, 2000],
  ['Food Products Trading', 2100000, 3900, 500],
  ['Seafood Trading', 2700000, 900, 3000],
  ['Car Accessories Trading', 1800000, 900, 2200],
  ['Cosmetic Trading', 1500000, 1800, 700],
  ['Educational Toys Trading', 1500000, 1500, 1000],
  ['Stationery & Office Supplies Trading', 1500000, 2400, 700],
  ['Electronics, Appliances & Computer Equipment', 2400000, 600, 5200],
  ['Restaurant & Catering', 1500000, 3000, 500],
  ['Software & IT Services', 1200000, 200, 6000],
  ['Construction & Renovation Contracting', 2000000, 100, 20000],
  ['Furniture & Home Furnishings', 1500000, 300, 5000],
  ['Medical Supplies & Health Products', 1800000, 1200, 1500],
  ['Tourism & Travel Services', 3000000, 300, 10000],
  ['Education & Training Services', 1200000, 400, 3000],
  ['Business Consulting Services', 1000000, 100, 10000],
];

describe('business natures', () => {
  it('matches the approved category names, order, and figures', () => {
    expect(
      BUSINESS_NATURES.map(([, name, revenue, transactions, average]) => [
        name,
        revenue,
        transactions,
        average,
      ]),
    ).toEqual(approvedCategories);
  });

  it('retains the existing key for the renamed electronics category', () => {
    expect(businessNature('it_house')?.[1]).toBe('Electronics, Appliances & Computer Equipment');
    expect(new Set(BUSINESS_NATURES.map(([key]) => key)).size).toBe(BUSINESS_NATURES.length);
  });
});

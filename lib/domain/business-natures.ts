/** Owner-approved figures for the bank interview. Amounts are Thai baht. */
export const BUSINESS_NATURES = [
  ['animal_feed', 'Animal Feed Distributor', 2700000, 300, 8500],
  ['household_products', 'Household Product', 1500000, 2400, 600],
  ['cleaning_products', 'Cleaning Product', 1500000, 2700, 500],
  ['pet_shop', 'Pet Shop', 1500000, 1800, 800],
  ['hardware_industrial', 'Hardware & Industrial Supplies', 1800000, 900, 2500],
  ['baby_children', "Baby & Children's Products Retail & Wholesale", 1500000, 1200, 1200],
  ['fashion_accessories', 'Fashion Accessories Retail & Wholesale', 1200000, 1800, 600],
  ['beauty_products', 'Beauty Products Trading', 1500000, 1800, 800],
  ['motorcycle_parts', 'Motorcycle Parts Trading', 1800000, 900, 2000],
  ['food_products', 'Food Products Trading', 2100000, 3900, 500],
  ['seafood', 'Seafood Trading', 2700000, 900, 3000],
  ['car_accessories', 'Car Accessories Trading', 1800000, 900, 2200],
  ['cosmetics', 'Cosmetic Trading', 1500000, 1800, 700],
  ['educational_toys', 'Educational Toys Trading', 1500000, 1500, 1000],
  ['stationery_office', 'Stationery & Office Supplies Trading', 1500000, 2400, 700],
  ['it_house', 'IT House', 2400000, 600, 5200],
] as const;

export function businessNature(key: string | null | undefined) {
  return BUSINESS_NATURES.find((row) => row[0] === key) ?? null;
}

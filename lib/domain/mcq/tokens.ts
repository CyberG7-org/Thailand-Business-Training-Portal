import type { FactKey } from '@/lib/domain/facts/fact-sheet';

/** The controlled recipes of D77. An option declares one; the editor checks the text matches. */
export const RECIPES = [
  'DIRECT_FACT',
  'NUMERIC_VARIATION',
  'COUNT_VARIATION',
  'DATE_VARIATION',
  'ID_MUTATION',
  'GEOGRAPHY_ALTERNATIVE',
  'BUSINESS_ALTERNATIVE',
  'STATIC',
  'COMPOSITE_TEMPLATE',
] as const;
export type Recipe = (typeof RECIPES)[number];

/** How a placeholder's value is read and printed. */
export type TokenKind =
  | 'text'
  | 'names'
  | 'id'
  | 'date'
  | 'money'
  | 'number'
  | 'percent'
  | 'count'
  | 'province'
  | 'district'
  | 'subdistrict'
  | 'category';

export type TokenDef = { kind: TokenKind; facts: readonly FactKey[] };

const text = <K extends FactKey>(fact: K) => ({ kind: 'text', facts: [fact] }) as const;

/**
 * Everything a variant may name between braces, and the fact-sheet keys each one reads. A
 * correct option may only use placeholders whose facts all belong to its concept (spec §8).
 */
export const TOKENS = {
  company_name_th: text('company_name_th'),
  company_name_en: text('company_name_en'),
  juristic_id: { kind: 'id', facts: ['juristic_id'] },
  registered_on: { kind: 'date', facts: ['registered_on'] },
  registered_capital: { kind: 'money', facts: ['registered_capital'] },
  directors: { kind: 'names', facts: ['directors'] },
  director_count: { kind: 'count', facts: ['directors'] },
  signing_authority: text('signing_authority'),
  address: text('address'),
  province: { kind: 'province', facts: ['address'] },
  district: { kind: 'district', facts: ['address'] },
  subdistrict: { kind: 'subdistrict', facts: ['address'] },
  postcode: text('address'),
  shareholders: { kind: 'names', facts: ['shareholders'] },
  shareholder_count: { kind: 'count', facts: ['shareholders'] },
  total_shares: { kind: 'number', facts: ['total_shares'] },
  my_shares: { kind: 'number', facts: ['holder_name', 'shareholders'] },
  my_share_percent: { kind: 'percent', facts: ['holder_name', 'shareholders'] },
  holder_name: text('holder_name'),
  position: text('position'),
  business_category: { kind: 'category', facts: ['business_category'] },
  nature_of_business: text('nature_of_business'),
  products_services: text('products_services'),
  business_purpose: text('business_purpose'),
  main_clients: text('main_clients'),
  client_origin: text('client_origin'),
  main_suppliers: text('main_suppliers'),
  business_address: text('business_address'),
  monthly_revenue: text('monthly_revenue'),
  revenue_basis: text('revenue_basis'),
  average_transaction: text('average_transaction'),
  monthly_transactions: text('monthly_transactions'),
  // The first amount in digits a manager typed, so a recipe can vary it (D99).
  monthly_revenue_amount: { kind: 'money', facts: ['monthly_revenue'] },
  average_transaction_amount: { kind: 'money', facts: ['average_transaction'] },
  monthly_transactions_count: { kind: 'number', facts: ['monthly_transactions'] },
  source_of_funds: text('source_of_funds'),
  first_incoming_funds: text('first_incoming_funds'),
  account_purpose: text('account_purpose'),
  promptpay_qr_purpose: text('promptpay_qr_purpose'),
} as const satisfies Record<string, TokenDef>;
export type TokenName = keyof typeof TOKENS;

export const isTokenName = (name: string): name is TokenName => name in TOKENS;

/** The recipe functions of the grammar: `{fact|function(argument)}`. */
export const RECIPE_FUNCTIONS = {
  numeric: 'NUMERIC_VARIATION',
  count: 'COUNT_VARIATION',
  date: 'DATE_VARIATION',
  id_mutation: 'ID_MUTATION',
  geo_alt: 'GEOGRAPHY_ALTERNATIVE',
  business_alt: 'BUSINESS_ALTERNATIVE',
} as const satisfies Record<string, Recipe>;
export type RecipeFunction = keyof typeof RECIPE_FUNCTIONS;

export const isRecipeFunction = (name: string): name is RecipeFunction => name in RECIPE_FUNCTIONS;

/** Which kinds of placeholder a function may vary. */
export const FUNCTION_KINDS: Record<RecipeFunction, readonly TokenKind[]> = {
  numeric: ['money', 'number', 'percent'],
  count: ['count'],
  date: ['date'],
  id_mutation: ['id'],
  geo_alt: ['province', 'district', 'subdistrict'],
  business_alt: ['category'],
};

/** A geography alternate is drawn from the place's own parent (spec §5.2). */
export const GEO_SCOPES = {
  province: 'region',
  district: 'province',
  subdistrict: 'district',
} as const;
export type GeoKind = keyof typeof GEO_SCOPES;

/** Functions whose result is drawn, so the same text may appear in several options. */
export const DRAWING_FUNCTIONS: readonly RecipeFunction[] = [
  'id_mutation',
  'geo_alt',
  'business_alt',
];

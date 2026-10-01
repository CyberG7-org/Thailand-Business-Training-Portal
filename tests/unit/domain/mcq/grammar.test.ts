import { describe, expect, it } from 'vitest';
import {
  classify,
  GrammarError,
  parseTemplate,
  placeholdersOf,
  signature,
} from '@/lib/domain/mcq/grammar';
import { RECIPES, TOKENS } from '@/lib/domain/mcq/tokens';

const code = (text: string) => {
  try {
    parseTemplate(text);
    return null;
  } catch (e) {
    if (e instanceof GrammarError) return e.code;
    throw e;
  }
};

describe('the placeholder grammar', () => {
  it('names the nine recipes of D77', () => {
    expect(RECIPES).toEqual([
      'DIRECT_FACT',
      'NUMERIC_VARIATION',
      'COUNT_VARIATION',
      'DATE_VARIATION',
      'ID_MUTATION',
      'GEOGRAPHY_ALTERNATIVE',
      'BUSINESS_ALTERNATIVE',
      'STATIC',
      'COMPOSITE_TEMPLATE',
    ]);
  });

  it('splits text and placeholders, keeping what was typed', () => {
    expect(parseTemplate('ทุน {registered_capital|numeric(x0.5)} บาท')).toEqual([
      { type: 'text', text: 'ทุน ' },
      {
        type: 'placeholder',
        placeholder: {
          raw: '{registered_capital|numeric(x0.5)}',
          token: 'registered_capital',
          fn: 'numeric',
          arg: 'x0.5',
          recipe: 'NUMERIC_VARIATION',
        },
      },
      { type: 'text', text: ' บาท' },
    ]);
    expect(placeholdersOf('{company_name_th}')[0]).toMatchObject({
      token: 'company_name_th',
      fn: null,
      arg: null,
      recipe: 'DIRECT_FACT',
    });
  });

  it('accepts every recipe in its own form', () => {
    const ok = [
      '{registered_capital|numeric(x2)}',
      '{registered_capital|numeric(+1000)}',
      '{my_share_percent|numeric(x0.5)}',
      '{director_count|count(+1)}',
      '{shareholder_count|count(-1)}',
      '{registered_on|date(-1y)}',
      '{registered_on|date(+3m)}',
      '{registered_on|date(-10d)}',
      '{juristic_id|id_mutation}',
      '{province|geo_alt(region)}',
      '{district|geo_alt(province)}',
      '{subdistrict|geo_alt(district)}',
      '{business_category|business_alt}',
    ];
    for (const text of ok) expect(code(text), text).toBeNull();
  });

  it('refuses what it does not know, by name', () => {
    expect(code('{capital}')).toBe('unknown_token');
    expect(code('{registered_capital|double}')).toBe('unknown_recipe');
    expect(code('{company_name_th|numeric(x2)}')).toBe('recipe_not_for_token');
    expect(code('{juristic_id|geo_alt(region)}')).toBe('recipe_not_for_token');
    expect(code('{registered_capital|numeric(x1)}')).toBe('bad_argument');
    expect(code('{registered_capital|numeric(twice)}')).toBe('bad_argument');
    expect(code('{director_count|count(0)}')).toBe('bad_argument');
    expect(code('{registered_on|date(1y)}')).toBe('bad_argument');
    expect(code('{province|geo_alt(district)}')).toBe('bad_argument');
    expect(code('{juristic_id|id_mutation(2)}')).toBe('bad_argument');
    expect(code('ทุน {registered_capital บาท')).toBe('unbalanced');
    expect(code('ทุน registered_capital} บาท')).toBe('unbalanced');
  });

  it('classifies an option by its text', () => {
    expect(classify('กรรมการผู้มีอำนาจเท่านั้น')).toBe('STATIC');
    expect(classify('{registered_capital}')).toBe('DIRECT_FACT');
    expect(classify(' {registered_capital|numeric(x2)} ')).toBe('NUMERIC_VARIATION');
    expect(classify('{director_count|count(+1)}')).toBe('COUNT_VARIATION');
    expect(classify('{registered_on|date(-1y)}')).toBe('DATE_VARIATION');
    expect(classify('{juristic_id|id_mutation}')).toBe('ID_MUTATION');
    expect(classify('{province|geo_alt(region)}')).toBe('GEOGRAPHY_ALTERNATIVE');
    expect(classify('{business_category|business_alt}')).toBe('BUSINESS_ALTERNATIVE');
    expect(classify('{my_shares} หุ้น ({my_share_percent})')).toBe('COMPOSITE_TEMPLATE');
    expect(classify('{director_count} คน')).toBe('COMPOSITE_TEMPLATE');
  });

  it('gives a translation the same signature when it keeps the placeholders', () => {
    const th = 'ทุนจดทะเบียนของ {company_name_th} คือ {registered_capital}';
    expect(signature(th)).toBe('{company_name_th} {registered_capital}');
    expect(signature('{company_name_th} has {registered_capital} of capital')).toBe(signature(th));
    expect(signature('The capital is {registered_capital}')).not.toBe(signature(th));
  });

  it('ties every placeholder to the facts it reads', () => {
    expect(TOKENS.province.facts).toEqual(['address']);
    expect(TOKENS.director_count.facts).toEqual(['directors']);
    expect(TOKENS.my_shares.facts).toEqual(['holder_name', 'shareholders']);
    expect(TOKENS.business_category.facts).toEqual(['business_category']);
  });
});

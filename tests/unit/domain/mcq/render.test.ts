import { describe, expect, it } from 'vitest';
import type { RenderContext } from '@/lib/domain/mcq/context';
import { normalizeOption } from '@/lib/domain/mcq/format';
import { renderVariant } from '@/lib/domain/mcq/render';
import { SAMPLE_CONTEXT } from '@/lib/domain/mcq/sample';
import { inheritPlaceholders, type Variant, type VariantText } from '@/lib/domain/mcq/variant';
import type { Locale } from '@/lib/domain/thai-date';
import { isValidJuristicId } from '@/lib/domain/validation/juristic-id';

const text = (
  prompt: string,
  options: [string, string, string, string],
  explanation: string | null = null,
): VariantText => ({
  prompt,
  options: { A: options[0], B: options[1], C: options[2], D: options[3] },
  explanation,
});
type Renderable = Pick<Variant, 'appliesWhen' | 'texts'>;
const of = (th: VariantText, extra: Partial<Renderable> = {}): Renderable => ({
  appliesWhen: null,
  texts: { th },
  ...extra,
});
const render = (
  v: Renderable,
  locale: Locale = 'th',
  seed = 'seed-1',
  ctx: RenderContext = SAMPLE_CONTEXT,
) => {
  const r = renderVariant(v, ctx, seed, locale);
  if (!r.ok) throw new Error(`${r.code}: ${r.detail}`);
  return r.rendered;
};
const failure = (v: Renderable, ctx: RenderContext = SAMPLE_CONTEXT) => {
  const r = renderVariant(v, ctx, 'seed-1', 'th');
  return r.ok ? null : r.code;
};
const texts = (v: Renderable, locale: Locale = 'th', seed = 'seed-1') =>
  render(v, locale, seed).options.map((o) => o.text);
const withFacts = (facts: Partial<RenderContext['facts']>): RenderContext => ({
  ...SAMPLE_CONTEXT,
  facts: { ...SAMPLE_CONTEXT.facts, ...facts },
});

describe('renderVariant', () => {
  it('prints money, dates, counts, percents and names in each language', () => {
    const v = of(
      text('ทุนของ {company_name_th}', [
        '{registered_capital}',
        '{registered_on}',
        '{director_count}',
        '{my_shares} ({my_share_percent})',
      ]),
    );
    expect(render(v).prompt).toBe('ทุนของ บริษัท ตัวอย่างการค้า จำกัด');
    expect(texts(v, 'th')).toEqual(['2,000,000 บาท', '16 เมษายน 2569', '2', '12,000 (60%)']);
    expect(texts(v, 'en')).toEqual(['2,000,000 THB', '16 April 2026', '2', '12,000 (60%)']);
    expect(texts(v, 'zh')).toEqual(['2,000,000 泰铢', '2026年4月16日', '2', '12,000 (60%)']);
    const names = of(
      text('กรรมการ', ['{directors}', '{shareholders}', '{juristic_id}', '{address}']),
    );
    expect(texts(names, 'th')[0]).toBe('นางสาวสมหญิง ตัวอย่าง, นายสมชาย ตัวอย่าง');
    expect(texts(names, 'en')[0]).toBe('Miss Somying Tuayang, Mr. Somchai Tuayang');
    expect(texts(names, 'th')[3]).toContain('ร้อยเอ็ด');
  });

  it('varies numbers, counts and dates as written', () => {
    const v = of(
      text('?', [
        '{registered_capital|numeric(x0.5)}',
        '{registered_capital|numeric(+500000)}',
        '{director_count|count(+1)}',
        '{my_share_percent|numeric(x0.5)}',
      ]),
    );
    expect(texts(v)).toEqual(['1,000,000 บาท', '2,500,000 บาท', '3', '30%']);
    const dates = of(
      text('?', [
        '{registered_on|date(-1y)}',
        '{registered_on|date(+1m)}',
        '{registered_on|date(-10d)}',
        '{registered_on}',
      ]),
    );
    expect(texts(dates)).toEqual([
      '16 เมษายน 2568',
      '16 พฤษภาคม 2569',
      '6 เมษายน 2569',
      '16 เมษายน 2569',
    ]);
    // A month that is too short takes its last day.
    const r = renderVariant(
      of(text('?', ['{registered_on|date(+1m)}', 'b', 'c', 'd'])),
      withFacts({ registered_on: '2024-01-31' }),
      'seed-1',
      'th',
    );
    expect(r.ok && r.rendered.options[0].text).toBe('29 กุมภาพันธ์ 2567');
  });

  it('mutates a registration number into different, well-formed numbers', () => {
    const v = of(
      text('?', [
        '{juristic_id}',
        '{juristic_id|id_mutation}',
        '{juristic_id|id_mutation}',
        '{juristic_id|id_mutation}',
      ]),
    );
    const [own, ...wrong] = texts(v);
    expect(new Set([own, ...wrong]).size).toBe(4);
    for (const id of wrong) {
      expect(isValidJuristicId(id), id).toBe(true);
      expect(id[0]).toBe(own[0]);
    }
    expect(texts(v)).toEqual([own, ...wrong]);
    expect(texts(v, 'th', 'seed-2')).not.toEqual([own, ...wrong]);
  });

  it('draws places without replacement and shows the same places in every language', () => {
    const v = of(
      text('จังหวัดใด', [
        '{province}',
        '{province|geo_alt(region)}',
        '{province|geo_alt(region)}',
        '{province|geo_alt(region)}',
      ]),
    );
    const th = texts(v, 'th');
    expect(th[0]).toBe('ร้อยเอ็ด');
    expect(new Set(th).size).toBe(4);
    const english = Object.fromEntries(SAMPLE_CONTEXT.geo.provinces.map((p) => [p.th, p.en]));
    expect(texts(v, 'en')).toEqual(['Roi Et', ...th.slice(1).map((name) => english[name])]);
    expect(texts(v, 'zh')).toEqual([
      'ร้อยเอ็ด (Roi Et)',
      ...th.slice(1).map((name) => `${name} (${english[name]})`),
    ]);
    const smaller = of(
      text('?', [
        '{district}',
        '{district|geo_alt(province)}',
        '{subdistrict}',
        '{subdistrict|geo_alt(district)}',
      ]),
    );
    expect(texts(smaller)[0]).toBe('โพนทอง');
    expect(texts(smaller)[2]).toBe('หนองใหญ่');
  });

  it('draws business alternatives from active categories other than the company’s own', () => {
    const v = of(
      text('?', [
        '{business_category}',
        '{business_category|business_alt}',
        '{business_category|business_alt}',
        '{business_category|business_alt}',
      ]),
    );
    const th = texts(v);
    expect(th[0]).toBe('ค้าเสื้อผ้าและเครื่องแต่งกาย');
    expect(new Set(th).size).toBe(4);
    expect(th).not.toContain('หมวดที่เลิกใช้แล้ว');
    expect(texts(v, 'en')[0]).toBe('Clothing and fashion trading');
    expect(failure(v, withFacts({ business_category: null }))).toBe('no_category');
  });

  it('says why a variant cannot be rendered for a company', () => {
    expect(
      failure(
        of(text('?', ['{signing_authority}', 'b', 'c', 'd'])),
        withFacts({ signing_authority: null }),
      ),
    ).toBe('missing_fact');
    expect(failure(of(text('?', ['{director_count|count(-5)}', 'b', 'c', 'd'])))).toBe(
      'out_of_range',
    );
    expect(failure(of(text('?', ['{registered_capital|numeric(-9000000)}', 'b', 'c', 'd'])))).toBe(
      'out_of_range',
    );
    expect(
      failure(of(text('?', ['{province|geo_alt(region)}', 'b', 'c', 'd'])), {
        ...SAMPLE_CONTEXT,
        geo: { ...SAMPLE_CONTEXT.geo, provinces: [] },
      }),
    ).toBe('no_alternatives');
    expect(
      failure(
        of(text('?', ['a', 'b', 'c', 'd']), {
          appliesWhen: { fact: 'learner_is_shareholder', value: false },
        }),
      ),
    ).toBe('not_applicable');
    expect(failure({ appliesWhen: null, texts: {} })).toBe('no_text');
  });

  it('falls back to the Thai text when a translation is missing', () => {
    const v = of(text('ทุนเท่าใด', ['{registered_capital}', 'ข', 'ค', 'ง']));
    expect(render(v, 'en').prompt).toBe('ทุนเท่าใด');
    expect(render(v, 'en').options[0].text).toBe('2,000,000 THB');
  });
});

describe('the amounts a manager typed (D99)', () => {
  it('prints the first amount in digits and varies it', () => {
    const v = of(
      text('รายได้ต่อเดือนประมาณเท่าใด', [
        '{monthly_revenue_amount}',
        '{monthly_revenue_amount|numeric(x3)}',
        '{average_transaction_amount|numeric(x0.2)}',
        'ประมาณ {monthly_transactions_count|numeric(x2)} รายการ',
      ]),
    );
    expect(texts(v)).toEqual(['300,000 บาท', '900,000 บาท', '2,000 บาท', 'ประมาณ 60 รายการ']);
    expect(texts(v, 'en')[0]).toBe('300,000 THB');
  });

  it('has no value when the answer is written in words', () => {
    const ctx: RenderContext = {
      ...SAMPLE_CONTEXT,
      facts: { ...SAMPLE_CONTEXT.facts, monthly_revenue: 'สามแสนบาท' },
    };
    const v = of(text('รายได้', ['{monthly_revenue_amount}', 'ก', 'ข', 'ค']));
    expect(failure(v, ctx)).toBe('missing_fact');
  });
});

describe('inheritPlaceholders', () => {
  it('fills a blank translated option from a Thai option that is placeholders only', () => {
    const th = text('ทุนเท่าใด', [
      '{registered_capital}',
      '{registered_capital|numeric(x2)}',
      'ไม่ทราบ',
      '{director_count} คน',
    ]);
    const en = text('How much?', ['', '', '', '']);
    const out = inheritPlaceholders({ th, en });
    expect(out.en?.options).toEqual({
      A: '{registered_capital}',
      B: '{registered_capital|numeric(x2)}',
      C: '',
      D: '',
    });
    expect(out.th).toEqual(th);
  });
});

describe('normalizeOption', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(normalizeOption('  Roi  Et. ')).toBe(normalizeOption('roi et'));
    expect(normalizeOption('1,000,000 บาท')).not.toBe(normalizeOption('2,000,000 บาท'));
  });
});

import { describe, expect, it } from 'vitest';
import type { RenderContext } from '@/lib/domain/mcq/context';
import { bankCoverage } from '@/lib/domain/mcq/coverage';
import { checkBank, pickVariant, preflightVariant } from '@/lib/domain/mcq/preflight';
import { SAMPLE_CONTEXT } from '@/lib/domain/mcq/sample';
import type { Recipe } from '@/lib/domain/mcq/tokens';
import { validateVariant } from '@/lib/domain/mcq/validate';
import type { Variant, VariantText } from '@/lib/domain/mcq/variant';

const text = (
  prompt: string,
  options: [string, string, string, string],
  explanation: string | null = null,
): VariantText => ({
  prompt,
  options: { A: options[0], B: options[1], C: options[2], D: options[3] },
  explanation,
});
const recipes = (a: Recipe, b: Recipe, c: Recipe, d: Recipe) => ({ A: a, B: b, C: c, D: d });
let n = 0;
const variant = (over: Partial<Variant> = {}): Variant => ({
  id: `v${++n}`,
  key: `mcq-test-${n}`,
  conceptKey: 'registered_capital',
  status: 'approved',
  correctKey: 'A',
  optionRecipes: recipes(
    'DIRECT_FACT',
    'NUMERIC_VARIATION',
    'NUMERIC_VARIATION',
    'NUMERIC_VARIATION',
  ),
  appliesWhen: null,
  texts: {
    th: text('ทุนจดทะเบียนของ {company_name_th} คือเท่าใด', [
      '{registered_capital}',
      '{registered_capital|numeric(x0.5)}',
      '{registered_capital|numeric(x2)}',
      '{registered_capital|numeric(x10)}',
    ]),
  },
  ...over,
});
const codes = (v: Variant) => validateVariant(v).map((i) => `${i.code}@${i.where}`);
const withFacts = (facts: Partial<RenderContext['facts']>): RenderContext => ({
  ...SAMPLE_CONTEXT,
  facts: { ...SAMPLE_CONTEXT.facts, ...facts },
});

describe('validateVariant', () => {
  it('accepts a well-formed variant', () => {
    expect(validateVariant(variant())).toEqual([]);
  });

  it('needs a concept the MCQ asks, Thai text, a prompt and four options', () => {
    expect(codes(variant({ conceptKey: 'registered_address' }))).toEqual([
      'unknown_concept@concept',
    ]);
    expect(codes(variant({ texts: {} }))).toEqual(['thai_required@th']);
    const blank = variant({ texts: { th: text(' ', ['{registered_capital}', '', 'ค', 'ง']) } });
    expect(codes(blank)).toContain('prompt_required@th.prompt');
    expect(codes(blank)).toContain('option_required@th.B');
  });

  it('names a placeholder the grammar does not accept, where it is', () => {
    const bad = variant({
      texts: { th: text('ทุน', ['{registered_capital}', '{capital|numeric(x2)}', 'ค', 'ง']) },
    });
    expect(validateVariant(bad)).toEqual([
      { code: 'grammar', where: 'th.B', detail: 'unknown_token: {capital|numeric(x2)}' },
    ]);
  });

  it('holds every option to the recipe it declares', () => {
    const v = variant({
      optionRecipes: recipes('DIRECT_FACT', 'STATIC', 'NUMERIC_VARIATION', 'NUMERIC_VARIATION'),
    });
    expect(validateVariant(v)).toEqual([
      { code: 'recipe_mismatch', where: 'th.B', detail: 'NUMERIC_VARIATION' },
    ]);
  });

  it('keeps variation out of the prompt and the explanation', () => {
    const v = variant();
    v.texts.th!.prompt = 'ทุน {registered_capital|numeric(x2)} ใช่หรือไม่';
    v.texts.th!.explanation = 'เลข {juristic_id|id_mutation}';
    expect(codes(v)).toEqual(['prompt_varies@th.prompt', 'prompt_varies@th.explanation']);
  });

  it('builds the correct option only from the concept’s own facts, unvaried', () => {
    const varied = variant({ correctKey: 'B' });
    expect(codes(varied)).toContain('correct_varies@th.B');

    const foreign = variant({
      optionRecipes: recipes(
        'DIRECT_FACT',
        'NUMERIC_VARIATION',
        'NUMERIC_VARIATION',
        'NUMERIC_VARIATION',
      ),
      texts: {
        th: text('ทุน', [
          '{total_shares}',
          '{registered_capital|numeric(x0.5)}',
          '{registered_capital|numeric(x2)}',
          '{registered_capital|numeric(x10)}',
        ]),
      },
    });
    expect(validateVariant(foreign)).toEqual([
      { code: 'correct_foreign_fact', where: 'th.A', detail: 'total_shares' },
    ]);

    const staticCorrect = variant({
      optionRecipes: recipes('STATIC', 'STATIC', 'STATIC', 'STATIC'),
      texts: { th: text('ทุน', ['หนึ่งล้านบาท', 'สองล้านบาท', 'สามล้านบาท', 'สี่ล้านบาท']) },
    });
    expect(codes(staticCorrect)).toEqual(['correct_needs_fact@th.A']);

    // A policy concept's correct answer is static text.
    const policy = variant({
      conceptKey: 'otp_control',
      optionRecipes: recipes('STATIC', 'STATIC', 'STATIC', 'STATIC'),
      texts: { th: text('ใครถือ OTP', ['กรรมการ', 'พนักงาน', 'ตัวแทน', 'ใครก็ได้']) },
    });
    expect(validateVariant(policy)).toEqual([]);
    const policyWithFact = variant({
      conceptKey: 'otp_control',
      optionRecipes: recipes('DIRECT_FACT', 'STATIC', 'STATIC', 'STATIC'),
      texts: { th: text('ใครถือ OTP', ['{holder_name}', 'พนักงาน', 'ตัวแทน', 'ใครก็ได้']) },
    });
    expect(codes(policyWithFact)).toEqual(['correct_foreign_fact@th.A']);
  });

  it('allows a static correct answer when the variant is worded for one status', () => {
    const v = variant({
      conceptKey: 'learner_shareholding',
      appliesWhen: { fact: 'learner_is_shareholder', value: false },
      optionRecipes: recipes('STATIC', 'COMPOSITE_TEMPLATE', 'STATIC', 'STATIC'),
      texts: {
        th: text('คุณถือหุ้นหรือไม่', [
          'ไม่ได้ถือหุ้น',
          'ถือหุ้นทั้งหมด {total_shares} หุ้น',
          'ถือหุ้นร้อยละ 50',
          'ถือหุ้นร้อยละ 25',
        ]),
      },
    });
    expect(validateVariant(v)).toEqual([]);
    expect(codes(variant({ appliesWhen: { fact: 'operations_started', value: true } }))).toEqual([
      'applies_when_fact@appliesWhen',
    ]);
  });

  it('refuses two options with the same text, unless the text is drawn', () => {
    const same = variant({
      texts: {
        th: text('ทุน', [
          '{registered_capital}',
          '{registered_capital|numeric(x2)}',
          '{registered_capital|numeric(x2)}',
          '{registered_capital|numeric(x10)}',
        ]),
      },
    });
    expect(validateVariant(same)).toEqual([
      { code: 'duplicate_option', where: 'th.C', detail: 'B' },
    ]);
    const drawn = variant({
      conceptKey: 'registration_number',
      optionRecipes: recipes('DIRECT_FACT', 'ID_MUTATION', 'ID_MUTATION', 'ID_MUTATION'),
      texts: {
        th: text('เลขทะเบียน', [
          '{juristic_id}',
          '{juristic_id|id_mutation}',
          '{juristic_id|id_mutation}',
          '{juristic_id|id_mutation}',
        ]),
      },
    });
    expect(validateVariant(drawn)).toEqual([]);
  });

  it('holds a translation to the Thai placeholders', () => {
    const v = variant();
    v.texts.en = text('What is the registered capital?', [
      '{registered_capital}',
      '{registered_capital|numeric(x0.5)}',
      '{registered_capital|numeric(x3)}',
      '{registered_capital|numeric(x10)}',
    ]);
    expect(codes(v)).toEqual([
      'translation_placeholders@en.prompt',
      'translation_placeholders@en.C',
    ]);
  });
});

describe('preflight', () => {
  it('passes a variant whose four options come out different and non-empty', () => {
    const r = preflightVariant(variant(), SAMPLE_CONTEXT, 'seed');
    expect(r.ok).toBe(true);
    expect(r.ok && r.rendered.options.map((o) => o.text)).toEqual([
      '2,000,000 บาท',
      '1,000,000 บาท',
      '4,000,000 บาท',
      '20,000,000 บาท',
    ]);
  });

  it('fails a variant whose options collide for this company', () => {
    // A capital of 1 baht halves to 1 after rounding: two options read the same.
    const r = preflightVariant(variant(), withFacts({ registered_capital: 1 }), 'seed');
    expect(r).toMatchObject({ ok: false, code: 'duplicate_option', detail: 'A = B' });
  });

  it('passes a failure of rendering or of the rules through', () => {
    expect(
      preflightVariant(variant(), withFacts({ registered_capital: null }), 'seed'),
    ).toMatchObject({ ok: false, code: 'missing_fact' });
    expect(preflightVariant(variant({ correctKey: 'B' }), SAMPLE_CONTEXT, 'seed')).toMatchObject({
      ok: false,
      code: 'invalid',
      detail: 'correct_varies',
    });
  });

  it('picks the first approved variant that passes and says why the others did not', () => {
    const fragile = variant({ key: 'mcq-a' });
    const sturdy = variant({
      key: 'mcq-b',
      optionRecipes: recipes(
        'DIRECT_FACT',
        'NUMERIC_VARIATION',
        'NUMERIC_VARIATION',
        'NUMERIC_VARIATION',
      ),
      texts: {
        th: text('ทุนเท่าใด', [
          '{registered_capital}',
          '{registered_capital|numeric(+1000)}',
          '{registered_capital|numeric(+2000)}',
          '{registered_capital|numeric(+3000)}',
        ]),
      },
    });
    const draft = variant({ key: 'mcq-0', status: 'draft' });
    const all = [sturdy, draft, fragile];
    expect(pickVariant('registered_capital', all, SAMPLE_CONTEXT, 'seed').variant?.key).toBe(
      'mcq-a',
    );
    const poor = pickVariant(
      'registered_capital',
      all,
      withFacts({ registered_capital: 1 }),
      'seed',
    );
    expect(poor.variant?.key).toBe('mcq-b');
    expect(poor.skipped).toEqual([{ key: 'mcq-a', code: 'duplicate_option', detail: 'A = B' }]);
    const none = pickVariant('registered_capital', [draft], SAMPLE_CONTEXT, 'seed');
    expect(none.variant).toBeNull();
    expect(none.skipped).toEqual([]);
  });

  it('checks the whole bank against one company: thirty concepts in MCQ order', () => {
    const checks = checkBank([variant()], SAMPLE_CONTEXT, 'seed');
    expect(checks).toHaveLength(30);
    expect(checks[0].conceptKey).toBe('company_name');
    expect(checks.filter((c) => c.variant).map((c) => c.conceptKey)).toEqual([
      'registered_capital',
    ]);
  });
});

describe('bankCoverage', () => {
  it('counts a concept as covered only when every status it turns on has an approved variant', () => {
    const yes = variant({
      conceptKey: 'main_clients',
      appliesWhen: { fact: 'has_existing_customers', value: true },
    });
    const noDraft = variant({
      conceptKey: 'main_clients',
      status: 'draft',
      appliesWhen: { fact: 'has_existing_customers', value: false },
    });
    const coverage = bankCoverage([variant(), variant({ status: 'retired' }), yes, noDraft]);
    expect(coverage.total).toBe(30);
    expect(coverage.ready).toBe(1);
    const capital = coverage.concepts.find((c) => c.conceptKey === 'registered_capital')!;
    expect(capital).toMatchObject({
      covered: true,
      counts: { approved: 1, draft: 0, retired: 1 },
      cases: [{ when: null, approved: 1 }],
    });
    const clients = coverage.concepts.find((c) => c.conceptKey === 'main_clients')!;
    expect(clients.covered).toBe(false);
    expect(clients.cases).toEqual([
      { when: { fact: 'has_existing_customers', value: true }, approved: 1 },
      { when: { fact: 'has_existing_customers', value: false }, approved: 0 },
    ]);
    // A variant for every company covers both cases.
    const both = bankCoverage([variant({ conceptKey: 'main_clients', texts: {} })]);
    expect(both.concepts.find((c) => c.conceptKey === 'main_clients')!.covered).toBe(true);
  });
});

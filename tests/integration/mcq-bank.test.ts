import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MCQ_STARTER } from '@/lib/content/mcq-starter';
import {
  getVariant,
  listVariants,
  loadStarterVariants,
  saveVariant,
  setVariantStatus,
} from '@/lib/db/mcq-bank';
import { contextForRecord, listRecordLearners, listVersionedCompanies } from '@/lib/db/mcq-context';
import { validateRecord } from '@/lib/db/validation';
import { manualCategory } from '@/lib/domain/business-category';
import { preflightVariant } from '@/lib/domain/mcq/preflight';
import type { Variant, VariantDraft, VariantText } from '@/lib/domain/mcq/variant';
import {
  adminClient,
  clientFor,
  completeRecord,
  COMPLETE_STRUCTURED,
  confirmRecord,
  createTestUser,
  deleteTeam,
  deleteTestUser,
  seedTeam,
  type Client,
  type Team,
  type TestUser,
} from './helpers';

const svc = adminClient();

const text = (
  prompt: string,
  options: [string, string, string, string],
  explanation: string | null = null,
): VariantText => ({
  prompt,
  options: { A: options[0], B: options[1], C: options[2], D: options[3] },
  explanation,
});
const capital = (): VariantDraft & { id: string | null } => ({
  id: null,
  conceptKey: 'registered_capital',
  correctKey: 'A',
  optionRecipes: {
    A: 'DIRECT_FACT',
    B: 'NUMERIC_VARIATION',
    C: 'NUMERIC_VARIATION',
    D: 'NUMERIC_VARIATION',
  },
  appliesWhen: null,
  texts: {
    th: text(
      'ทุนจดทะเบียนของ {company_name_th} คือเท่าใด',
      [
        '{registered_capital}',
        '{registered_capital|numeric(x0.5)}',
        '{registered_capital|numeric(x2)}',
        '{registered_capital|numeric(x10)}',
      ],
      'ทุนจดทะเบียนคือ {registered_capital}',
    ),
  },
});

describe('the MCQ bank (P17d)', () => {
  let team: Team;
  let owner: TestUser;
  let asOwner: Client;
  const made: string[] = [];
  const save = async (input: VariantDraft & { id: string | null }) => {
    const id = await saveVariant(asOwner, input, owner.id);
    if (!made.includes(id)) made.push(id);
    return id;
  };

  beforeAll(async () => {
    team = await seedTeam('คลังตามแนวคิด');
    owner = await createTestUser('admin');
    asOwner = await clientFor(owner);
    await confirmRecord(team.recordId, team.manager.id);
    await completeRecord(team.recordId);
    // The Owner's own choice of category, so BUSINESS_ALTERNATIVE has something to differ from.
    await svc
      .from('dbd_records')
      .update({
        structured_data: {
          ...COMPLETE_STRUCTURED,
          category: manualCategory('clothing_fashion', 'fixture', new Date().toISOString()),
        } as never,
      })
      .eq('id', team.recordId);
    const validated = await validateRecord(svc, team.recordId, null);
    expect(validated?.version).toBe('activated');
  });

  afterAll(async () => {
    await svc.from('questions').delete().in('id', made);
    await deleteTeam(team);
    await deleteTestUser(owner.id);
  });

  it('saves a variant under the Owner, names it after its concept and reads it back', async () => {
    const id = await save(capital());
    const variant = await getVariant(asOwner, id);
    expect(variant).toMatchObject({
      conceptKey: 'registered_capital',
      status: 'draft',
      correctKey: 'A',
      appliesWhen: null,
    });
    expect(variant!.key).toMatch(/^mcq-registered-capital-\d+$/);
    expect(variant!.texts.th).toEqual(capital().texts.th);
    expect(variant!.texts.en).toBeUndefined();
    const { data: row } = await svc
      .from('questions')
      .select('kind, pools, created_by, source')
      .eq('id', id)
      .single();
    expect(row).toEqual({ kind: 'concept', pools: [], created_by: owner.id, source: 'manual' });
    expect((await listVariants(asOwner)).some((v) => v.id === id)).toBe(true);
    // The next variant of the same concept takes the next number.
    const second = await getVariant(asOwner, await save(capital()));
    expect(Number(second!.key.split('-').at(-1))).toBe(Number(variant!.key.split('-').at(-1)) + 1);
  });

  it('refuses a variant that breaks a rule, and a manager, and writes nothing', async () => {
    const count = async () =>
      (await listVariants(svc)).filter((v) => v.key.startsWith('mcq-registered-capital-')).length;
    const before = await count();
    await expect(save({ ...capital(), correctKey: 'B' })).rejects.toMatchObject({
      issues: [expect.objectContaining({ code: 'correct_varies', where: 'th.B' })],
    });
    await expect(saveVariant(team.asManager, capital(), team.manager.id)).rejects.toBeTruthy();
    expect(await count()).toBe(before);
  });

  it('approves on the Thai text, returns to draft when it changes, and keeps a translation edit approved', async () => {
    const id = await save(capital());
    await setVariantStatus(asOwner, id, 'approved');
    expect((await getVariant(asOwner, id))!.status).toBe('approved');

    const en = text(
      'What is the registered capital of {company_name_th}?',
      [
        '{registered_capital}',
        '{registered_capital|numeric(x0.5)}',
        '{registered_capital|numeric(x2)}',
        '{registered_capital|numeric(x10)}',
      ],
      'The registered capital is {registered_capital}',
    );
    await save({ ...capital(), id, texts: { ...capital().texts, en } });
    let variant = (await getVariant(asOwner, id))!;
    expect(variant.status).toBe('approved');
    expect(variant.texts.en).toEqual(en);

    const th = { ...capital().texts.th!, prompt: 'บริษัท {company_name_th} มีทุนจดทะเบียนเท่าใด' };
    await save({ ...capital(), id, texts: { th } });
    variant = (await getVariant(asOwner, id))!;
    expect(variant.status).toBe('draft');
    // A translation that is no longer sent is removed.
    expect(variant.texts.en).toBeUndefined();

    await setVariantStatus(asOwner, id, 'retired');
    expect((await getVariant(asOwner, id))!.status).toBe('retired');
  });

  it('builds a render context from a real record: its places, their siblings and the dictionary', async () => {
    const ctx = (await contextForRecord(asOwner, team.recordId, null))!;
    expect(ctx.facts.business_category).toBe('clothing_fashion');
    expect(ctx.geo.province).toMatchObject({ th: 'ร้อยเอ็ด', en: 'Roi Et' });
    expect(ctx.geo.district?.th).toBe('โพนทอง');
    expect(ctx.geo.subdistrict?.th).toBe('หนองใหญ่');
    // The same region, the same province, the same district — never the place itself.
    expect(ctx.geo.provinces.map((p) => p.th)).toContain('ขอนแก่น');
    expect(ctx.geo.provinces.map((p) => p.th)).not.toContain('ร้อยเอ็ด');
    expect(ctx.geo.provinces.map((p) => p.th)).not.toContain('เชียงใหม่');
    expect(ctx.geo.districts.map((d) => d.th)).toContain('เสลภูมิ');
    expect(ctx.geo.districts.map((d) => d.th)).not.toContain('โพนทอง');
    expect(ctx.geo.subdistricts.length).toBeGreaterThan(0);
    expect(ctx.categories.find((c) => c.key === 'clothing_fashion')?.active).toBe(true);
    expect(ctx.categories.length).toBeGreaterThanOrEqual(22);

    // The geography and business recipes come out as four different options on real data.
    const where: Variant = {
      id: 'geo',
      key: 'geo',
      conceptKey: 'registered_location',
      status: 'approved',
      correctKey: 'A',
      optionRecipes: {
        A: 'DIRECT_FACT',
        B: 'GEOGRAPHY_ALTERNATIVE',
        C: 'GEOGRAPHY_ALTERNATIVE',
        D: 'GEOGRAPHY_ALTERNATIVE',
      },
      appliesWhen: null,
      texts: {
        th: text('สำนักงานแห่งใหญ่อยู่จังหวัดใด', [
          '{province}',
          '{province|geo_alt(region)}',
          '{province|geo_alt(region)}',
          '{province|geo_alt(region)}',
        ]),
      },
    };
    const placed = preflightVariant(where, ctx, 'seed');
    expect(placed.ok && placed.rendered.options[0].text).toBe('ร้อยเอ็ด');
    const what: Variant = {
      ...where,
      conceptKey: 'actual_business',
      optionRecipes: {
        A: 'DIRECT_FACT',
        B: 'BUSINESS_ALTERNATIVE',
        C: 'BUSINESS_ALTERNATIVE',
        D: 'BUSINESS_ALTERNATIVE',
      },
      texts: {
        th: text('ธุรกิจหลักคืออะไร', [
          '{nature_of_business}',
          '{business_category|business_alt}',
          '{business_category|business_alt}',
          '{business_category|business_alt}',
        ]),
      },
    };
    expect(preflightVariant(what, ctx, 'seed').ok).toBe(true);
  });

  it('lists the companies that have a version, their learners, and a learner’s own facts', async () => {
    expect((await contextForRecord(asOwner, team.recordId, null))!.facts.holder_name).toBeNull();
    const companies = await listVersionedCompanies(asOwner);
    expect(companies.find((c) => c.recordId === team.recordId)?.name).toBe('บริษัท ครบถ้วน จำกัด');
    const { data: assignment } = await svc
      .from('user_dbd_assignments')
      .insert({
        user_id: team.learner.id,
        dbd_record_id: team.recordId,
        holder_name: 'นางสาวกุลธิดา พลเยี่ยม',
      })
      .select('id')
      .single();
    const learners = await listRecordLearners(asOwner, team.recordId);
    expect(learners).toEqual([
      { assignmentId: assignment!.id, name: expect.stringContaining('learner') },
    ]);
    const mine = (await contextForRecord(asOwner, team.recordId, assignment!.id))!;
    expect(mine.facts).toMatchObject({
      holder_name: 'นางสาวกุลธิดา พลเยี่ยม',
      learner_is_shareholder: true,
      my_shares: 18000,
    });
    // A record without a version has no context.
    const bare = await seedTeam('ยังไม่มีรุ่น');
    try {
      expect(await contextForRecord(asOwner, bare.recordId, null)).toBeNull();
    } finally {
      await deleteTeam(bare);
    }
  });
});

describe('the starter drafts in the bank', () => {
  let owner: TestUser;
  let asOwner: Client;
  const keys = MCQ_STARTER.map((s) => s.key);
  const clear = () => svc.from('questions').delete().in('question_key', keys);

  beforeAll(async () => {
    owner = await createTestUser('admin');
    asOwner = await clientFor(owner);
    await clear();
  });

  afterAll(async () => {
    await clear();
    await deleteTestUser(owner.id);
  });

  it('loads every draft once, as drafts, and leaves them alone the second time', async () => {
    const first = await loadStarterVariants(asOwner, MCQ_STARTER, owner.id);
    expect(first.created).toEqual(keys);
    expect(first.skipped).toEqual([]);
    const loaded = (await listVariants(asOwner)).filter((v) => keys.includes(v.key));
    expect(loaded).toHaveLength(10);
    expect(loaded.every((v) => v.status === 'draft')).toBe(true);
    expect(loaded.every((v) => Object.keys(v.texts).length === 3)).toBe(true);

    // The Owner edits one; loading again does not put the starter text back.
    const capital = loaded.find((v) => v.key === 'mcq-registered-capital-1')!;
    const prompt = 'ทุนจดทะเบียนตามหนังสือรับรองของ {company_name_th} คือเท่าใด';
    await saveVariant(
      asOwner,
      { ...capital, texts: { th: { ...capital.texts.th!, prompt } } },
      owner.id,
    );
    const second = await loadStarterVariants(asOwner, MCQ_STARTER, owner.id);
    expect(second).toEqual({ created: [], skipped: keys });
    expect((await getVariant(asOwner, capital.id))!.texts.th!.prompt).toBe(prompt);
  });
});

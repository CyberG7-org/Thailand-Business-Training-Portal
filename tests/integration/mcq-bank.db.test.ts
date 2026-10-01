import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTeam,
  deleteTestUser,
  seedTeam,
  type Client,
  type Team,
  type TestUser,
} from './helpers';

const svc = adminClient();
const RECIPES = {
  A: 'DIRECT_FACT',
  B: 'NUMERIC_VARIATION',
  C: 'NUMERIC_VARIATION',
  D: 'NUMERIC_VARIATION',
};
const OPTIONS = [
  { key: 'A', text: '{registered_capital}' },
  { key: 'B', text: '{registered_capital|numeric(x0.5)}' },
  { key: 'C', text: '{registered_capital|numeric(x2)}' },
  { key: 'D', text: '{registered_capital|numeric(x10)}' },
];

describe('the MCQ bank tables (P17d)', () => {
  let team: Team;
  let owner: TestUser;
  let asOwner: Client;
  let asLearner: Client;
  const keys: string[] = [];
  const key = (label: string) => {
    const k = `t-${label}-${Date.now()}-${keys.length}`;
    keys.push(k);
    return k;
  };
  const variant = (over: Record<string, unknown> = {}) => ({
    question_key: key('variant'),
    kind: 'concept',
    concept_key: 'registered_capital',
    correct_option_key: 'A',
    option_recipes: RECIPES,
    pools: [] as string[],
    ...over,
  });
  const thai = (questionId: string, prompt = 'ทุนจดทะเบียนคือเท่าใด') => ({
    question_id: questionId,
    language: 'th',
    prompt,
    options: OPTIONS,
    correct_key: 'A',
  });
  const statusOf = async (id: string) =>
    (await svc.from('questions').select('approval_status').eq('id', id).single()).data!
      .approval_status;

  beforeAll(async () => {
    team = await seedTeam('คลังข้อสอบ');
    owner = await createTestUser('admin');
    asOwner = await clientFor(owner);
    asLearner = await clientFor(team.learner);
  });

  afterAll(async () => {
    await svc.from('questions').delete().in('question_key', keys);
    await deleteTeam(team);
    await deleteTestUser(owner.id);
  });

  it('lets a manager read the bank and write nothing (D76)', async () => {
    const { data: row } = await svc.from('questions').insert(variant()).select().single();
    const { data: seen } = await team.asManager.from('questions').select('id').eq('id', row!.id);
    expect(seen).toHaveLength(1);

    const { error: inserted } = await team.asManager.from('questions').insert(variant());
    expect(inserted).not.toBeNull();
    const { data: updated } = await team.asManager
      .from('questions')
      .update({ active: false })
      .eq('id', row!.id)
      .select();
    expect(updated).toEqual([]);
    const { error: localized } = await team.asManager
      .from('question_localizations')
      .insert(thai(row!.id));
    expect(localized).not.toBeNull();
    const { error: batch } = await team.asManager
      .from('question_generation_batches')
      .insert({ provider: 'fake', material_summary: 'x', requested: 1 });
    expect(batch).not.toBeNull();
  });

  it('shows a learner nothing', async () => {
    const { data } = await asLearner.from('questions').select('id');
    expect(data).toEqual([]);
    const { data: texts } = await asLearner.from('question_localizations').select('id');
    expect(texts).toEqual([]);
  });

  it('lets the Owner write a variant, audited as the Owner', async () => {
    const { data: row, error } = await asOwner
      .from('questions')
      .insert(variant())
      .select()
      .single();
    expect(error).toBeNull();
    const { error: localized } = await asOwner.from('question_localizations').insert(thai(row!.id));
    expect(localized).toBeNull();
    const { data: audit } = await svc
      .from('audit_logs')
      .select('actor_id, action')
      .eq('entity_type', 'questions')
      .eq('entity_id', row!.id);
    expect(audit).toEqual([{ actor_id: owner.id, action: 'questions.insert' }]);
  });

  it('refuses a row that is half a variant', async () => {
    const attempts = [
      variant({ correct_option_key: null }),
      variant({ option_recipes: null }),
      variant({ option_recipes: { A: 'DIRECT_FACT' } }),
      variant({ pools: ['quiz'] }),
      variant({ kind: 'generic' }),
      variant({ applies_when: { fact: 'operations_started' } }),
      { question_key: key('legacy'), kind: 'generic', correct_option_key: 'A' },
      { question_key: key('legacy'), kind: 'concept' },
    ];
    for (const row of attempts) {
      const { error } = await svc.from('questions').insert(row as never);
      expect(error?.code, JSON.stringify(row)).toBe('23514');
    }
  });

  it('refuses a concept the MCQ does not ask, and a status the concept does not turn on', async () => {
    // `registered_address` is a chatbot-only concept.
    const chatbot = await svc
      .from('questions')
      .insert(variant({ concept_key: 'registered_address' }));
    expect(chatbot.error?.code).toBe('23514');
    const wrongStatus = await svc
      .from('questions')
      .insert(variant({ applies_when: { fact: 'operations_started', value: true } }));
    expect(wrongStatus.error?.code).toBe('23514');
    const right = await svc.from('questions').insert(
      variant({
        concept_key: 'main_clients',
        applies_when: { fact: 'has_existing_customers', value: false },
      }),
    );
    expect(right.error).toBeNull();
  });

  it('approves a variant on its Thai text alone, and an earlier question only with three languages', async () => {
    const { data: row } = await svc.from('questions').insert(variant()).select().single();
    const bare = await asOwner
      .from('questions')
      .update({ approval_status: 'approved' })
      .eq('id', row!.id);
    expect(bare.error?.code).toBe('23514');
    await svc.from('question_localizations').insert(thai(row!.id));
    const withThai = await asOwner
      .from('questions')
      .update({ approval_status: 'approved' })
      .eq('id', row!.id);
    expect(withThai.error).toBeNull();
    expect(await statusOf(row!.id)).toBe('approved');

    const { data: legacy } = await svc
      .from('questions')
      .insert({ question_key: key('legacy'), kind: 'generic' })
      .select()
      .single();
    await svc.from('question_localizations').insert({ ...thai(legacy!.id), options: OPTIONS });
    const legacyApproval = await asOwner
      .from('questions')
      .update({ approval_status: 'approved' })
      .eq('id', legacy!.id);
    expect(legacyApproval.error?.code).toBe('23514');
  });

  it('returns an approved variant to draft when its Thai text or its structure changes, not when a translation does', async () => {
    const { data: row } = await svc.from('questions').insert(variant()).select().single();
    const id = row!.id;
    await svc.from('question_localizations').insert(thai(id));
    const approve = () =>
      svc.from('questions').update({ approval_status: 'approved' }).eq('id', id);
    await approve();

    // A translation arrives, then changes: still approved.
    await asOwner
      .from('question_localizations')
      .insert({ ...thai(id, 'What is the registered capital?'), language: 'en' });
    await asOwner
      .from('question_localizations')
      .update({ prompt: 'How much is the registered capital?' })
      .eq('question_id', id)
      .eq('language', 'en');
    expect(await statusOf(id)).toBe('approved');

    // Saving the Thai text unchanged: still approved.
    await asOwner
      .from('question_localizations')
      .update({ prompt: 'ทุนจดทะเบียนคือเท่าใด' })
      .eq('question_id', id)
      .eq('language', 'th');
    expect(await statusOf(id)).toBe('approved');

    // The Thai text changes: draft.
    await asOwner
      .from('question_localizations')
      .update({ prompt: 'บริษัทมีทุนจดทะเบียนเท่าใด' })
      .eq('question_id', id)
      .eq('language', 'th');
    expect(await statusOf(id)).toBe('draft');

    // The structure changes: draft.
    await approve();
    await asOwner
      .from('questions')
      .update({ option_recipes: { ...RECIPES, D: 'STATIC' } })
      .eq('id', id);
    expect(await statusOf(id)).toBe('draft');

    // Retiring and other columns do not touch the status.
    await approve();
    await asOwner.from('questions').update({ active: false }).eq('id', id);
    expect(await statusOf(id)).toBe('approved');
  });
});

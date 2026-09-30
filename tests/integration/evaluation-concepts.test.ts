import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EVALUATION_CONCEPTS } from '@/lib/domain/concepts/registry';
import {
  adminClient,
  clientFor,
  createTestManager,
  createTestUser,
  deleteTestUser,
  type TestUser,
} from './helpers';

const svc = adminClient();

/** The registry table and its TypeScript mirror are one decision (spec §7.1, D76). */
describe('evaluation_concepts', () => {
  let manager: TestUser;
  let learner: TestUser;
  beforeAll(async () => {
    manager = await createTestManager();
    learner = await createTestUser('learner');
  });
  afterAll(async () => {
    await deleteTestUser(learner.id);
    await deleteTestUser(manager.id);
  });

  it('holds exactly the rows of lib/domain/concepts/registry.ts', async () => {
    const { data, error } = await svc.from('evaluation_concepts').select('*');
    if (error) throw error;
    const byKey = (a: { key: string }, b: { key: string }) => (a.key < b.key ? -1 : 1);
    const fromDb = data
      .map((r) => ({
        key: r.key,
        domain: r.domain,
        source: r.source,
        facts: r.facts,
        answer: r.answer_type,
        mcqOrder: r.mcq_order,
        critical: r.critical,
        interviewSlot: r.interview_slot,
        interviewMatch: r.interview_match,
        alternateWhen: r.alternate_when,
        title: { th: r.title_th, en: r.title_en, zh: r.title_zh },
      }))
      .sort(byKey);
    const fromCode = [...EVALUATION_CONCEPTS]
      .map((c) => ({ ...c, facts: [...c.facts], alternateWhen: [...c.alternateWhen] }))
      .sort(byKey);
    expect(fromDb).toEqual(fromCode);
  });

  it('is read by staff, by no learner, and written by nobody', async () => {
    const asManager = await clientFor(manager);
    const { data } = await asManager.from('evaluation_concepts').select('key');
    expect(data).toHaveLength(37);
    const { data: forLearner } = await (
      await clientFor(learner)
    )
      .from('evaluation_concepts')
      .select('key');
    expect(forLearner).toEqual([]);
    const { error } = await asManager.from('evaluation_concepts').insert({
      key: 'x_test',
      domain: 'kyc',
      source: 'KYC_POLICY',
      answer_type: 'static',
      title_th: 'x',
      title_en: 'x',
      title_zh: 'x',
    });
    expect(error?.code).toBe('42501');
  });

  // All 13 slots are taken, so these rows test the checks without a slot: a grading tier
  // needs a slot, a KYC answer reads no fact, a critical concept is an MCQ concept.
  it('refuses rows that break the registry rules', async () => {
    const base = { domain: 'identity', title_th: 'x', title_en: 'x', title_zh: 'x' };
    const tierWithoutSlot = await svc.from('evaluation_concepts').insert({
      ...base,
      key: 'x_tier_no_slot',
      source: 'DBD_FACT',
      facts: ['juristic_id'],
      answer_type: 'id',
      interview_match: 'semantic',
    });
    expect(tierWithoutSlot.error?.code).toBe('23514');
    const kycWithFact = await svc.from('evaluation_concepts').insert({
      ...base,
      key: 'x_kyc_fact',
      source: 'KYC_POLICY',
      facts: ['juristic_id'],
      answer_type: 'static',
    });
    expect(kycWithFact.error?.code).toBe('23514');
    const criticalOffMcq = await svc.from('evaluation_concepts').insert({
      ...base,
      key: 'x_critical',
      source: 'DBD_FACT',
      facts: ['juristic_id'],
      answer_type: 'id',
      critical: true,
    });
    expect(criticalOffMcq.error?.code).toBe('23514');
  });
});

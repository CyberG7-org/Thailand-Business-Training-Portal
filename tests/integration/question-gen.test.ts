import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  fillMissingLanguages,
  generateQuestionsIntoBank,
  listGenerationBatches,
} from '@/lib/db/question-gen';
import {
  createQuestion,
  getQuestion,
  setApprovalStatus,
  upsertQuestionLocalization,
} from '@/lib/db/questions';
import { FakeQuestionGenerator } from '@/lib/integrations/question-gen/fake';
import type { GeneratedQuestion, QuestionGenerator } from '@/lib/integrations/question-gen/types';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

describe('AI question authoring', () => {
  const svc = adminClient();
  let admin: TestUser;
  let learner: TestUser;
  let asAdmin: Client;
  let asLearner: Client;
  let materialId: string;
  const createdQuestionIds: string[] = [];
  const batchIds: string[] = [];

  beforeAll(async () => {
    [admin, learner] = await Promise.all([createTestUser('admin'), createTestUser('learner')]);
    [asAdmin, asLearner] = await Promise.all([clientFor(admin), clientFor(learner)]);
    const { data } = await svc
      .from('study_materials')
      .insert({ content_key: `gen-source-${Date.now()}`, type: 'card', created_by: admin.id })
      .select()
      .single();
    materialId = data!.id;
    await svc.from('study_material_localizations').insert([
      {
        material_id: materialId,
        language: 'th',
        title: 'DBD basics',
        body: 'กรมพัฒนาธุรกิจการค้าออกหนังสือรับรอง',
      },
      {
        material_id: materialId,
        language: 'en',
        title: 'DBD basics',
        body: 'The DBD issues the affidavit',
      },
    ]);
  });

  afterAll(async () => {
    await svc.from('questions').delete().in('id', createdQuestionIds);
    await svc.from('question_generation_batches').delete().in('id', batchIds);
    await svc.from('study_materials').delete().eq('id', materialId);
    await Promise.all([admin, learner].map((u) => deleteTestUser(u.id)));
  });

  it('stores a generated batch as drafts with three languages and derived kind/dependencies', async () => {
    const result = await generateQuestionsIntoBank(
      asAdmin,
      admin.id,
      {
        studyMaterialIds: [materialId],
        pastedText: '',
        upload: null,
        count: 3,
        templateCount: 1,
        pools: ['quiz'],
        difficulty: 'medium',
        focus: null,
      },
      new FakeQuestionGenerator(),
    );
    batchIds.push(result.batchId);
    createdQuestionIds.push(...result.questionIds);
    expect(result.produced).toBe(3);
    expect(result.rejected).toEqual([]);

    const first = await getQuestion(asAdmin, result.questionIds[0]);
    expect(first).toMatchObject({
      source: 'ai_generated',
      approval_status: 'draft',
      kind: 'dbd_template',
      pools: ['quiz'],
      generation_batch_id: result.batchId,
    });
    expect(first?.dbd_field_dependencies.sort()).toEqual(['company_name_th', 'registered_capital']);
    expect(first?.question_localizations.map((l) => l.language).sort()).toEqual(['en', 'th', 'zh']);
    expect(first?.question_key).toMatch(/^ai-[0-9a-f]{8}-01$/);

    const generic = await getQuestion(asAdmin, result.questionIds[1]);
    expect(generic?.kind).toBe('generic');
    expect(generic?.question_localizations.find((l) => l.language === 'th')?.prompt).toContain(
      'DBD basics',
    );

    // Drafts are approvable straight away because all three languages exist.
    await setApprovalStatus(asAdmin, result.questionIds[1], 'approved');
    expect((await getQuestion(asAdmin, result.questionIds[1]))?.approval_status).toBe('approved');

    const batches = await listGenerationBatches(asAdmin);
    expect(batches.find((b) => b.id === result.batchId)).toMatchObject({
      provider: 'fake',
      requested: 3,
      produced: 3,
      rejected: 0,
      material_summary: '1 study card(s)',
    });
    const { data: learnerView } = await asLearner.from('question_generation_batches').select('id');
    expect(learnerView).toEqual([]);
  });

  it('counts rejected questions without inserting them', async () => {
    const broken: QuestionGenerator = {
      name: 'broken',
      model: null,
      async generate() {
        const good = (
          await new FakeQuestionGenerator().generate({
            material: { text: 'x', pdf: null },
            count: 1,
            templateCount: 0,
            difficulty: 'easy',
            focus: null,
          })
        )[0];
        const bad: GeneratedQuestion = JSON.parse(JSON.stringify(good));
        bad.localizations.zh.correct_key = 'B';
        return [good, bad];
      },
      async translate() {
        return {};
      },
    };
    const result = await generateQuestionsIntoBank(
      asAdmin,
      admin.id,
      {
        studyMaterialIds: [],
        pastedText: 'some notes',
        upload: null,
        count: 2,
        templateCount: 0,
        pools: ['quiz', 'exam'],
        difficulty: 'easy',
        focus: 'banking',
      },
      broken,
    );
    batchIds.push(result.batchId);
    createdQuestionIds.push(...result.questionIds);
    expect(result.produced).toBe(1);
    expect(result.rejected).toEqual([
      { index: 1, reason: 'correct key differs between languages' },
    ]);
    const batch = (await listGenerationBatches(asAdmin)).find((b) => b.id === result.batchId);
    expect(batch).toMatchObject({
      produced: 1,
      rejected: 1,
      material_summary: '10 chars pasted; focus: banking',
    });
  });

  it('fills only the missing languages of a hand-written Thai question', async () => {
    const q = await createQuestion(
      asAdmin,
      { questionKey: `manual-th-${Date.now()}`, pools: ['exam'], active: true },
      admin.id,
    );
    createdQuestionIds.push(q.id);
    await upsertQuestionLocalization(asAdmin, q.id, {
      language: 'th',
      prompt: 'บริษัท {company_name_th} จดทะเบียนเมื่อใด',
      options: [
        { key: 'A', text: '{registered_on}' },
        { key: 'B', text: '{registered_on|+1y}' },
        { key: 'C', text: '{registered_on|-1y}' },
      ],
      correctKey: 'A',
      explanation: null,
      ttsEnabled: true,
    });
    const written = await fillMissingLanguages(asAdmin, q.id, new FakeQuestionGenerator());
    expect(written).toEqual(['en', 'zh']);
    const after = await getQuestion(asAdmin, q.id);
    const en = after?.question_localizations.find((l) => l.language === 'en');
    expect(en?.prompt).toBe('[en] บริษัท {company_name_th} จดทะเบียนเมื่อใด');
    expect(en?.correct_key).toBe('A');
    expect((en?.options as { text: string }[])[1].text).toBe('[en] {registered_on|+1y}');
    expect(after?.question_localizations.find((l) => l.language === 'th')?.tts_enabled).toBe(true);
    expect(await fillMissingLanguages(asAdmin, q.id, new FakeQuestionGenerator())).toEqual([]);
    await setApprovalStatus(asAdmin, q.id, 'approved');
    expect((await getQuestion(asAdmin, q.id))?.approval_status).toBe('approved');
  });
});

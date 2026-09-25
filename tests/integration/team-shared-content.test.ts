import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateQuestionsIntoBank } from '@/lib/db/question-gen';
import { FakeQuestionGenerator } from '@/lib/integrations/question-gen/fake';
import { adminClient, confirmRecord, deleteTeam, seedTeam, type Team } from './helpers';

const svc = adminClient();

/**
 * Spec §4: content is communal while data is private. A question batch is shared with every
 * staff member, so nothing that identifies the company it was grounded in may travel with it.
 */
describe('what travels with the shared question bank', () => {
  let a: Team;
  let b: Team;
  let batchId: string;
  let juristicId: string;
  const focus = 'ลูกค้ารายใหญ่ของทีมเอ';

  beforeAll(async () => {
    a = await seedTeam('แชร์เอ');
    b = await seedTeam('แชร์บี');
    await confirmRecord(a.recordId, a.manager.id);
    await confirmRecord(b.recordId, b.manager.id);
    const { data: record } = await svc
      .from('dbd_records')
      .select('juristic_id')
      .eq('id', a.recordId)
      .single();
    juristicId = record!.juristic_id!;

    const result = await generateQuestionsIntoBank(
      a.asManager,
      a.manager.id,
      {
        referenceRecordId: a.recordId,
        studyMaterialIds: [],
        pastedText: '',
        upload: null,
        count: 2,
        templateCount: 0,
        pools: ['quiz'],
        difficulty: 'medium',
        focus,
      },
      new FakeQuestionGenerator(),
      null,
    );
    batchId = result.batchId;
  });

  afterAll(async () => {
    await svc.from('questions').delete().eq('generation_batch_id', batchId);
    await svc.from('question_generation_batches').delete().eq('id', batchId);
    for (const team of [a, b]) await deleteTeam(team);
  });

  it('lets another team see the batch but not whose company it came from', async () => {
    const { data: batch, error } = await b.asManager
      .from('question_generation_batches')
      .select('material_summary, produced, requested')
      .eq('id', batchId)
      .single();
    expect(error).toBeNull();
    // Shared: the batch and its counts are there for every staff member.
    expect(batch!.requested).toBe(2);
    // Private: nothing in it names the company, the file or the manager's own notes.
    expect(batch!.material_summary).not.toContain(juristicId);
    expect(batch!.material_summary).not.toContain(focus);
    expect(batch!.material_summary).not.toMatch(/DBD \d{13}/);
  });
});

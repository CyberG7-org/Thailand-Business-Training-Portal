import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateQuestionsIntoBank } from '@/lib/db/question-gen';
import { FakeQuestionGenerator } from '@/lib/integrations/question-gen/fake';
import {
  adminClient,
  clientFor,
  confirmRecord,
  createTestUser,
  deleteTeam,
  deleteTestUser,
  seedTeam,
  type Team,
  type TestUser,
} from './helpers';

const svc = adminClient();

/**
 * Spec §4: content is communal while data is private. A question batch is shared with every
 * staff member, so nothing that identifies the company it was grounded in may travel with it.
 */
describe('what travels with the shared question bank', () => {
  let a: Team;
  let b: Team;
  let owner: TestUser;
  let batchId: string;
  let juristicId: string;
  const focus = 'ลูกค้ารายใหญ่ของทีมเอ';

  beforeAll(async () => {
    a = await seedTeam('แชร์เอ');
    b = await seedTeam('แชร์บี');
    await confirmRecord(a.recordId, a.manager.id);
    await confirmRecord(b.recordId, b.manager.id);
    // Only the Owner writes the bank (D76); the batch is still shared with every manager.
    owner = await createTestUser('admin');
    const { data: record } = await svc
      .from('dbd_records')
      .select('juristic_id')
      .eq('id', a.recordId)
      .single();
    juristicId = record!.juristic_id!;

    const result = await generateQuestionsIntoBank(
      await clientFor(owner),
      owner.id,
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
    await deleteTestUser(owner.id);
  });

  it('lets every manager see the batch but not whose company it came from', async () => {
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

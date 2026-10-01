import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { autoConfirmIfClean } from '@/lib/db/auto-confirm';
import { enqueueExtractJob, processIndexJobs } from '@/lib/db/dbd-index';
import { FakeDbdExtractor } from '@/lib/integrations/extraction/fake';
import { adminClient, deleteTeam, seedTeam, type Team } from './helpers';

const svc = adminClient();

const ANSWERS = {
  interview: {
    contact_email: 'info@auto-confirm.co.th',
    contact_phone: '02-000-0000',
    nature_of_business: 'ขายเสื้อผ้าออนไลน์',
    products_services: 'เสื้อผ้าสตรีนำเข้า',
  },
};

/** What a finished reading of a clean pack leaves on the record. */
const READ_FACTS = {
  company_name_th: 'บริษัท ยืนยันเอง จำกัด',
  juristic_id: '0105568233828',
  issued_on: '2026-04-09',
  extraction_status: 'extracted',
};

async function recordOf(id: string) {
  const { data, error } = await svc
    .from('dbd_records')
    .select('extraction_status, confirmed_by, confirmed_at, confirmed_automatically')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

/** D80: a record the reader finished with confirms itself when it is clean. */
describe('autoConfirmIfClean', () => {
  let team: Team;
  beforeAll(async () => {
    team = await seedTeam('ยืนยันเอง');
  });
  afterAll(async () => {
    await svc.from('index_jobs').delete().eq('record_id', team.recordId);
    await deleteTeam(team);
  });

  async function setRecord(values: Record<string, unknown>) {
    const { error } = await svc
      .from('dbd_records')
      .update({
        company_name_th: null,
        juristic_id: null,
        issued_on: null,
        extraction_status: 'none',
        structured_data: {} as never,
        ...values,
      })
      .eq('id', team.recordId);
    if (error) throw error;
  }

  it('leaves a record that was never read', async () => {
    await setRecord({ structured_data: ANSWERS });
    expect(await autoConfirmIfClean(svc, team.recordId)).toMatchObject({ confirm: false });
    expect((await recordOf(team.recordId)).extraction_status).toBe('none');
  });

  it('leaves a read record that lacks the issue date or one of the four details', async () => {
    await setRecord({ ...READ_FACTS, issued_on: null, structured_data: ANSWERS });
    expect(await autoConfirmIfClean(svc, team.recordId)).toEqual({
      confirm: false,
      reasons: ['issued_on'],
    });

    await setRecord({
      ...READ_FACTS,
      structured_data: { interview: { ...ANSWERS.interview, products_services: null } },
    });
    expect(await autoConfirmIfClean(svc, team.recordId)).toEqual({
      confirm: false,
      reasons: ['products_services'],
    });
    expect((await recordOf(team.recordId)).extraction_status).toBe('extracted');
  });

  it('waits while a reading job of the record is still open', async () => {
    await setRecord({ ...READ_FACTS, structured_data: ANSWERS });
    expect(await enqueueExtractJob(team.asManager, team.recordId)).toBe('queued');
    expect(await autoConfirmIfClean(svc, team.recordId)).toEqual({
      confirm: false,
      reasons: ['still_reading'],
    });
    await svc.from('index_jobs').delete().eq('record_id', team.recordId);
  });

  it('confirms a clean record on behalf of the manager who uploaded it, marked automatic', async () => {
    await setRecord({ ...READ_FACTS, structured_data: ANSWERS });
    expect(await autoConfirmIfClean(svc, team.recordId)).toEqual({ confirm: true });
    const after = await recordOf(team.recordId);
    expect(after).toMatchObject({
      extraction_status: 'confirmed',
      confirmed_by: team.manager.id,
      confirmed_automatically: true,
    });
    expect(after.confirmed_at).not.toBeNull();
  });

  it('never touches a record a person already confirmed', async () => {
    await setRecord({ ...READ_FACTS, structured_data: ANSWERS });
    await svc
      .from('dbd_records')
      .update({
        extraction_status: 'confirmed',
        confirmed_by: team.manager.id,
        confirmed_at: new Date().toISOString(),
        confirmed_automatically: false,
      })
      .eq('id', team.recordId);
    expect(await autoConfirmIfClean(svc, team.recordId)).toEqual({
      confirm: false,
      reasons: ['already_confirmed'],
    });
    expect((await recordOf(team.recordId)).confirmed_automatically).toBe(false);
  });
});

/**
 * The whole path: the manager's upload queued a reading job, the reader fills the record, marks
 * the job done, and only then asks whether the record is clean — so its own job no longer
 * counts as "still reading".
 */
describe('the reader confirms a clean record once its job is done', () => {
  let team: Team;
  beforeAll(async () => {
    team = await seedTeam('อ่านแล้วยืนยัน');
    await svc
      .from('dbd_records')
      .update({ structured_data: ANSWERS as never })
      .eq('id', team.recordId);
  });
  afterAll(async () => {
    await svc.from('index_jobs').delete().eq('record_id', team.recordId);
    await deleteTeam(team);
  });

  it('confirms after the extract job, and a failing after-step never fails the job', async () => {
    expect(await enqueueExtractJob(team.asManager, team.recordId)).toBe('queued');
    const settled: string[] = [];
    const run = await processIndexJobs({
      extractor: new FakeDbdExtractor(),
      vector: null,
      budgetMs: 60_000,
      // Only this test's record is filled and settled; other queued jobs are left alone.
      extract: async ({ recordId }) => {
        if (recordId === team.recordId) {
          await svc.from('dbd_records').update(READ_FACTS).eq('id', recordId);
        }
        return { status: 'done' };
      },
      afterReading: async (recordId) => {
        if (recordId !== team.recordId) return;
        settled.push(recordId);
        await autoConfirmIfClean(svc, recordId);
        throw new Error('a later step broke');
      },
    });
    expect(run.extractions).toBeGreaterThanOrEqual(1);
    expect(settled).toEqual([team.recordId]);
    expect(await recordOf(team.recordId)).toMatchObject({
      extraction_status: 'confirmed',
      confirmed_automatically: true,
      confirmed_by: team.manager.id,
    });
    const { data: job } = await svc
      .from('index_jobs')
      .select('status')
      .eq('record_id', team.recordId)
      .eq('kind', 'extract')
      .single();
    expect(job?.status).toBe('done');
  });
});

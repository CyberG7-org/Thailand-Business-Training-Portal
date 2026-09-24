import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CONFIRMED_ANSWERS,
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

const RLS_DENIED = '42501';
const CHECK_VIOLATION = '23514';

describe('dbd_records + audit_logs + dbd-documents bucket', () => {
  let admin: TestUser;
  let learner: TestUser;
  let asAdmin: Client;
  let asLearner: Client;
  const createdRecordIds: string[] = [];
  const uploadedPaths: string[] = [];

  beforeAll(async () => {
    [admin, learner] = await Promise.all([createTestUser('admin'), createTestUser('learner')]);
    [asAdmin, asLearner] = await Promise.all([clientFor(admin), clientFor(learner)]);
  });

  afterAll(async () => {
    const svc = adminClient();
    if (uploadedPaths.length) await svc.storage.from('dbd-documents').remove(uploadedPaths);
    if (createdRecordIds.length) await svc.from('dbd_records').delete().in('id', createdRecordIds);
    await Promise.all([admin, learner].map((u) => deleteTestUser(u.id)));
  });

  it('lets an admin insert a record and writes an audit row attributed to them', async () => {
    const { data, error } = await asAdmin
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท ทดสอบ จำกัด',
        juristic_id: '0105568233704',
        issued_on: '2026-07-13',
      })
      .select()
      .single();
    expect(error).toBeNull();
    createdRecordIds.push(data!.id);
    const { data: audit } = await adminClient()
      .from('audit_logs')
      .select('actor_id, action, entity_id')
      .eq('entity_type', 'dbd_records')
      .eq('entity_id', data!.id);
    expect(audit).toEqual([
      { actor_id: admin.id, action: 'dbd_records.insert', entity_id: data!.id },
    ]);
  });

  it('blocks learners from inserting or reading records', async () => {
    const { error } = await asLearner.from('dbd_records').insert({ company_name_th: 'x' });
    expect(error?.code).toBe(RLS_DENIED);
    const { data } = await asLearner.from('dbd_records').select('id');
    expect(data).toEqual([]);
  });

  it('rejects an issue date before the registration date', async () => {
    const { error } = await asAdmin
      .from('dbd_records')
      .insert({ company_name_th: 'x', registered_on: '2026-07-13', issued_on: '2026-04-10' });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it('rejects a juristic id that is not 13 digits', async () => {
    const { error } = await asAdmin
      .from('dbd_records')
      .insert({ company_name_th: 'x', juristic_id: '12345' });
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it('refuses confirmation while core fields are missing', async () => {
    const { data } = await asAdmin
      .from('dbd_records')
      .insert({ company_name_en: 'No Thai name' })
      .select()
      .single();
    createdRecordIds.push(data!.id);
    const { error } = await asAdmin
      .from('dbd_records')
      .update({
        structured_data: CONFIRMED_ANSWERS as never,
        extraction_status: 'confirmed',
        confirmed_by: admin.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', data!.id);
    expect(error?.code).toBe(CHECK_VIOLATION);
  });

  it('lets admins upload PDFs and denies learners any bucket access', async () => {
    const bytes = readFileSync('tests/fixtures/tiny.pdf');
    const path = `rls-test/${Date.now()}.pdf`;
    const { error } = await asAdmin.storage
      .from('dbd-documents')
      .upload(path, bytes, { contentType: 'application/pdf' });
    expect(error).toBeNull();
    uploadedPaths.push(path);

    const { error: learnerUpload } = await asLearner.storage
      .from('dbd-documents')
      .upload(`rls-test/learner-${Date.now()}.pdf`, bytes, { contentType: 'application/pdf' });
    expect(learnerUpload).not.toBeNull();

    const { error: learnerDownload } = await asLearner.storage.from('dbd-documents').download(path);
    expect(learnerDownload).not.toBeNull();
  });
});

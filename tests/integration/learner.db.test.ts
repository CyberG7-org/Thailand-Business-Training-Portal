import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMyDocumentSignedUrl, getMyCompany, getMyEligibility } from '@/lib/db/learner';
import {
  CONFIRMED_ANSWERS,
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

describe('lib/db/learner', () => {
  let admin: TestUser;
  let owner: TestUser;
  let other: TestUser;
  let asOwner: Client;
  let asOther: Client;
  // An object key must sit under its record's own id (migration 20260925000000), so the id is
  // chosen here and the record inserted with it.
  const recordId = crypto.randomUUID();
  const path = `${recordId}/${Date.now()}.pdf`;

  beforeAll(async () => {
    [admin, owner, other] = await Promise.all([
      createTestUser('admin'),
      createTestUser('learner'),
      createTestUser('learner'),
    ]);
    [asOwner, asOther] = await Promise.all([clientFor(owner), clientFor(other)]);
    const svc = adminClient();
    await svc.storage
      .from('dbd-documents')
      .upload(path, Buffer.from('%PDF-1.4 test'), { contentType: 'application/pdf' });
    const { error } = await svc
      .from('dbd_records')
      .insert({
        id: recordId,
        company_name_th: 'บริษัท ของฉัน จำกัด',
        juristic_id: '0105568233704',
        issued_on: '2026-07-13',
        document_path: path,
        structured_data: CONFIRMED_ANSWERS as never,
        extraction_status: 'confirmed',
        confirmed_by: admin.id,
        confirmed_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    await svc
      .from('user_dbd_assignments')
      .insert({ user_id: owner.id, dbd_record_id: recordId, assigned_by: admin.id });
  });

  afterAll(async () => {
    const svc = adminClient();
    await svc.storage.from('dbd-documents').remove([path]);
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', recordId);
    await svc.from('eligibility_snapshots').delete().eq('dbd_record_id', recordId);
    await svc.from('dbd_records').delete().eq('id', recordId);
    await Promise.all([admin, owner, other].map((u) => deleteTestUser(u.id)));
  });

  it("returns the owner's company and eligibility, and nothing for another learner", async () => {
    const mine = await getMyCompany(asOwner, owner.id);
    expect(mine?.dbd_records.company_name_th).toBe('บริษัท ของฉัน จำกัด');
    const eligibility = await getMyEligibility(asOwner, owner.id, recordId);
    expect(eligibility?.available_from).toBe('2026-08-27');

    expect(await getMyCompany(asOther, other.id)).toBeNull();
    // Even asking for the owner's id under the other learner's session yields nothing (RLS).
    expect(await getMyCompany(asOther, owner.id)).toBeNull();
  });

  it('signs the document URL only for the assigned learner', async () => {
    const url = await createMyDocumentSignedUrl(owner.id, recordId);
    expect(url).toMatch(/dbd-documents/);
    expect(await createMyDocumentSignedUrl(other.id, recordId)).toBeNull();
  });
});

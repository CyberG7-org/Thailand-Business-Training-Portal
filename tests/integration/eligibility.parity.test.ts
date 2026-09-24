import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { availableFrom } from '@/lib/domain/eligibility';
import {
  CONFIRMED_ANSWERS,
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

// Month ends, year ends, leap and non-leap Februaries, and the PRD example.
const DATES = [
  '2026-09-11',
  '2026-12-01',
  '2028-01-20',
  '2027-01-20',
  '2026-01-31',
  '2024-02-29',
  '2026-07-13',
];

describe('eligibility parity: database trigger vs lib/domain', () => {
  let admin: TestUser;
  let asAdmin: Client;
  const learners: TestUser[] = [];
  const recordIds: string[] = [];

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
  });

  afterAll(async () => {
    const svc = adminClient();
    await svc.from('user_dbd_assignments').delete().in('dbd_record_id', recordIds);
    await svc.from('eligibility_snapshots').delete().in('dbd_record_id', recordIds);
    await svc.from('dbd_records').delete().in('id', recordIds);
    await Promise.all([admin, ...learners].map((u) => deleteTestUser(u.id)));
  });

  it.each(DATES)(
    'issued_on %s produces the same available_from in SQL and TypeScript',
    async (issuedOn) => {
      const learner = await createTestUser('learner');
      learners.push(learner);
      const { data: record } = await asAdmin
        .from('dbd_records')
        .insert({ company_name_th: 'parity', juristic_id: '0105568233704', issued_on: issuedOn })
        .select()
        .single();
      recordIds.push(record!.id);
      await asAdmin
        .from('dbd_records')
        .update({
          structured_data: CONFIRMED_ANSWERS as never,
          extraction_status: 'confirmed',
          confirmed_by: admin.id,
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', record!.id);
      await asAdmin
        .from('user_dbd_assignments')
        .insert({ user_id: learner.id, dbd_record_id: record!.id });

      const { data: snapshot } = await asAdmin
        .from('eligibility_snapshots')
        .select('available_from')
        .eq('user_id', learner.id)
        .single();
      expect(snapshot?.available_from).toBe(availableFrom(issuedOn));
    },
  );
});

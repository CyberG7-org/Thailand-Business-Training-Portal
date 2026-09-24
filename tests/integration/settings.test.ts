import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditDiff, listAuditLogs, listPolicies, updatePolicy } from '@/lib/db/settings';
import {
  CONFIRMED_ANSWERS,
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

describe('policy settings and audit', () => {
  const svc = adminClient();
  let admin: TestUser;
  let learner: TestUser;
  let asAdmin: Client;
  let asLearner: Client;
  let recordId: string;

  beforeAll(async () => {
    [admin, learner] = await Promise.all([createTestUser('admin'), createTestUser('learner')]);
    [asAdmin, asLearner] = await Promise.all([clientFor(admin), clientFor(learner)]);
    const { data } = await svc
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท นโยบาย จำกัด',
        juristic_id: '0105569000999',
        issued_on: '2026-01-01',
        structured_data: CONFIRMED_ANSWERS as never,
        extraction_status: 'confirmed',
        confirmed_by: admin.id,
        confirmed_at: new Date().toISOString(),
      })
      .select()
      .single();
    recordId = data!.id;
    await svc
      .from('user_dbd_assignments')
      .insert({ user_id: learner.id, dbd_record_id: recordId, assigned_by: admin.id });
  });

  afterAll(async () => {
    await svc.from('policy_config').upsert({ key: 'bank_eligibility_days', value: 45 });
    await svc.from('policy_config').upsert({ key: 'exam_passing_mark_percent', value: 70 });
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', recordId);
    await svc.from('eligibility_snapshots').delete().eq('dbd_record_id', recordId);
    await svc.from('dbd_records').delete().eq('id', recordId);
    await Promise.all([admin, learner].map((u) => deleteTestUser(u.id)));
  });

  it('learners can neither read nor write policy_config or the audit view', async () => {
    const { data } = await asLearner.from('policy_config').select('key');
    expect(data).toEqual([]);
    const { error } = await asLearner
      .from('policy_config')
      .update({ value: 0 })
      .eq('key', 'bank_eligibility_days');
    expect(error?.message ?? '').not.toMatch(/success/);
    const { data: after } = await svc
      .from('policy_config')
      .select('value')
      .eq('key', 'bank_eligibility_days')
      .single();
    expect(after?.value).toBe(45);
    const { data: audit } = await asLearner.from('audit_logs_with_actor').select('id').limit(1);
    expect(audit).toEqual([]);
  });

  it('admin edits are validated, audited with the actor, and recompute the bank window', async () => {
    expect(await updatePolicy(asAdmin, 'exam_passing_mark_percent', '150', admin.id)).toMatchObject(
      {
        ok: false,
      },
    );
    expect(await updatePolicy(asAdmin, 'exam_passing_mark_percent', '80', admin.id)).toEqual({
      ok: true,
      value: 80,
    });
    const policies = await listPolicies(asAdmin);
    expect(policies.find((p) => p.key === 'exam_passing_mark_percent')?.value).toBe(80);

    const before = await svc
      .from('eligibility_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('dbd_record_id', recordId);
    expect(await updatePolicy(asAdmin, 'bank_eligibility_days', '60', admin.id)).toEqual({
      ok: true,
      value: 60,
    });
    const { data: snapshots } = await svc
      .from('eligibility_snapshots')
      .select('available_from, reason')
      .eq('dbd_record_id', recordId)
      .order('calculated_at', { ascending: false });
    expect(snapshots?.length).toBe((before.count ?? 0) + 1);
    expect(snapshots?.[0]).toMatchObject({
      available_from: '2026-03-02',
      reason: 'policy_changed',
    });

    const rows = await listAuditLogs(asAdmin, {
      entityType: 'policy_config',
      entityId: 'bank_eligibility_days',
      limit: 5,
    });
    expect(rows[0]).toMatchObject({
      action: 'policy_config.update',
      actor_login_id: admin.loginId,
    });
    expect(auditDiff(rows[0].before, rows[0].after).map((d) => d.key)).toContain('value');
  });
});

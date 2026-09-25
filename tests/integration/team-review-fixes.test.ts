import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listAuditLogs } from '@/lib/db/settings';
import { adminClient, confirmRecord, deleteTeam, seedTeam, type Team } from './helpers';

const svc = adminClient();

/** Findings of the P15c whole-branch review, each pinned before it was fixed. */
describe('what the P15c review found', () => {
  let a: Team;
  let b: Team;

  beforeAll(async () => {
    a = await seedTeam('รีวิวเอ');
    b = await seedTeam('รีวิวบี');
    await confirmRecord(a.recordId, a.manager.id);
    await confirmRecord(b.recordId, b.manager.id);
  });

  afterAll(async () => {
    for (const team of [a, b]) await deleteTeam(team);
  });

  it('refuses a document path that escapes its own record prefix', async () => {
    // The prefix check split_part(path, '/', 1) = record_id accepted '<own>/../<other key>'.
    const { error: traversal } = await a.asManager.from('dbd_documents').insert({
      record_id: a.recordId,
      path: `${a.recordId}/../${b.recordId}/stolen.pdf`,
      original_name: 'stolen.pdf',
      size_bytes: 10,
      position: 8,
    });
    expect(traversal).not.toBeNull();

    // A record may not point its own document_path at another team's object either.
    const { error: pointed } = await a.asManager
      .from('dbd_records')
      .update({ document_path: `${b.recordId}/theirs.pdf` })
      .eq('id', a.recordId);
    expect(pointed).not.toBeNull();

    const { error: own } = await a.asManager
      .from('dbd_records')
      .update({ document_path: `${a.recordId}/mine.pdf` })
      .eq('id', a.recordId);
    expect(own).toBeNull();
  });

  it('finds an actor in the audit log by the code as it is displayed', async () => {
    // A write by the manager themselves, so the trigger records them as the actor.
    await a.asManager
      .from('dbd_records')
      .update({ company_name_en: 'Review A Co., Ltd.' })
      .eq('id', a.recordId);

    const typedAsShown = await listAuditLogs(a.asManager, {
      actorLoginId: a.manager.loginId.toUpperCase(),
      entityType: 'dbd_records',
    });
    expect(typedAsShown.length).toBeGreaterThan(0);
    expect(typedAsShown.every((r) => r.actor_login_id === a.manager.loginId)).toBe(true);
  });

  it('shows a manager only actors of their own team through the audit view', async () => {
    await a.asManager
      .from('dbd_records')
      .update({ company_name_en: 'Review A again' })
      .eq('id', a.recordId);
    await b.asManager
      .from('dbd_records')
      .update({ company_name_en: 'Review B Co., Ltd.' })
      .eq('id', b.recordId);

    const seenByA = await listAuditLogs(a.asManager, { entityType: 'dbd_records', limit: 500 });
    expect(seenByA.length).toBeGreaterThan(0);
    const actors = new Set(seenByA.map((r) => r.actor_id));
    expect(actors.has(b.manager.id)).toBe(false);
    for (const actor of actors) {
      expect([a.manager.id, a.learner.id]).toContain(actor);
    }

    // The same rows exist for the admin — the narrowing is the manager's, not the log's.
    const { data: all } = await svc
      .from('audit_logs')
      .select('actor_id')
      .eq('entity_type', 'dbd_records')
      .in('actor_id', [a.manager.id, b.manager.id]);
    expect(new Set((all ?? []).map((r) => r.actor_id)).size).toBe(2);
  });
});

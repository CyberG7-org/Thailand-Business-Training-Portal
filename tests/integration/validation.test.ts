import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assignDbdRecord, getActiveAssignmentForUser } from '@/lib/db/assignments';
import { pinnedFactsFor } from '@/lib/db/pinning';
import { getActiveVersion, listVersions } from '@/lib/db/training-versions';
import {
  ValidationError,
  listOpenExceptions,
  resolveException,
  validateRecord,
} from '@/lib/db/validation';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import {
  COMPLETE_RECORD,
  COMPLETE_STRUCTURED,
  adminClient,
  completeRecord,
  deleteTeam,
  seedTeam,
  type Team,
} from './helpers';

const svc = adminClient();

async function record(id: string) {
  const { data } = await svc.from('dbd_records').select('*').eq('id', id).single();
  return data!;
}
const open = async (id: string) =>
  (await listOpenExceptions(svc, id)).map((e) => `${e.kind}:${e.field}:${e.blocks}`).sort();

describe('validateRecord (spec §5.5–5.6, D74)', () => {
  let team: Team;
  beforeAll(async () => {
    team = await seedTeam('ตรวจสอบ');
  });
  afterAll(async () => {
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', team.recordId);
    await svc.from('company_training_versions').delete().eq('dbd_record_id', team.recordId);
    await svc.from('training_fact_exceptions').delete().eq('dbd_record_id', team.recordId);
    await deleteTeam(team);
  });

  it('handles two validators opening the same findings concurrently', async () => {
    const concurrent = await seedTeam('ตรวจพร้อมกัน');
    try {
      await Promise.all([
        validateRecord(svc, concurrent.recordId, concurrent.manager.id),
        validateRecord(svc, concurrent.recordId, concurrent.manager.id),
      ]);
      const findings = await listOpenExceptions(svc, concurrent.recordId);
      expect(findings.length).toBeGreaterThan(0);
      expect(new Set(findings.map((finding) => `${finding.kind}:${finding.field}`)).size).toBe(
        findings.length,
      );
    } finally {
      await svc.from('training_fact_exceptions').delete().eq('dbd_record_id', concurrent.recordId);
      await deleteTeam(concurrent);
    }
  });

  it('lists what blocks acceptance on a bare record and accepts nothing', async () => {
    const result = (await validateRecord(svc, team.recordId, team.manager.id))!;
    expect(result.accepted).toBe(false);
    expect(result.version).toBe('blocked');
    const list = await open(team.recordId);
    expect(list).toContain('missing:juristic_id:acceptance');
    // The learner's contact is the learner's (D80), never the record's to owe (D101).
    expect(list).not.toContain('missing:contact_email:acceptance');
    expect(list).toContain('missing:nature_of_business:acceptance');
    expect(list).toContain('missing:registered_on:version');
    expect((await record(team.recordId)).extraction_status).not.toBe('confirmed');
  });

  it('accepts the record once nothing blocks acceptance, and keeps the version as a draft', async () => {
    await svc
      .from('dbd_records')
      .update({
        juristic_id: '0105568233704',
        structured_data: {
          interview: {
            contact_email: 'info@x.co.th',
            contact_phone: '02-000-0000',
            nature_of_business: 'ค้าส่งเสื้อผ้า',
            products_services: 'เสื้อผ้าสตรี',
          },
        } as never,
      })
      .eq('id', team.recordId);
    const result = (await validateRecord(svc, team.recordId, team.manager.id))!;
    expect(result.accepted).toBe(true);
    expect(result.version).toBe('draft');
    const r = await record(team.recordId);
    expect(r.extraction_status).toBe('confirmed');
    expect(r.confirmed_by).toBe(team.manager.id);
    expect(r.confirmed_automatically).toBe(false);
    expect(await getActiveVersion(svc, team.recordId)).toBeNull();
    expect((await listVersions(svc, team.recordId)).map((v) => v.status)).toEqual(['draft']);
    const list = await open(team.recordId);
    expect(list.every((k) => k.endsWith(':version') || k.endsWith(':none'))).toBe(true);
    // The problems that went away were closed as fixed, and stay as data.
    const { data: fixed } = await svc
      .from('training_fact_exceptions')
      .select('field, resolution')
      .eq('dbd_record_id', team.recordId)
      .eq('status', 'resolved');
    expect(fixed).toContainEqual({ field: 'juristic_id', resolution: 'fixed' });
  });

  it('activates version 1 when the last blocking exception is resolved, and pins the waiting learner', async () => {
    await assignDbdRecord(team.asManager, { userId: team.learner.id, dbdRecordId: team.recordId });
    await completeRecord(team.recordId);
    const result = (await validateRecord(svc, team.recordId, null))!;
    expect(result.version).toBe('activated');
    expect(await open(team.recordId)).toEqual([]);
    const v1 = (await getActiveVersion(svc, team.recordId))!;
    expect(v1).toMatchObject({ version_no: 1, company_complete: true });
    expect((await listVersions(svc, team.recordId)).map((v) => v.status)).toEqual(['active']);
    const a = (await getActiveAssignmentForUser(svc, team.learner.id))!;
    expect(a.training_version_id).toBe(v1.id);
  });

  it('holds a changed sheet as a draft while a hard rule fails, and the learner stays on version 1', async () => {
    await svc.from('dbd_records').update({ registered_capital: 1_500_000 }).eq('id', team.recordId);
    const result = (await validateRecord(svc, team.recordId, null))!;
    expect(result.version).toBe('draft');
    expect(await open(team.recordId)).toEqual(['conflict:registered_capital:acceptance']);
    expect((await listVersions(svc, team.recordId)).map((v) => v.status).sort()).toEqual([
      'active',
      'draft',
    ]);
    expect((await getActiveVersion(svc, team.recordId))!.version_no).toBe(1);
    const pinned = (await pinnedFactsFor(
      svc,
      (await getActiveAssignmentForUser(svc, team.learner.id))!,
    ))!;
    expect(pinned.snapshot.facts.registered_capital).toBe(COMPLETE_RECORD.registered_capital);
  });

  it('a person confirms the value: the exception closes, the draft becomes version 2, and it does not reopen', async () => {
    const [exception] = await listOpenExceptions(svc, team.recordId);
    const resolved = await resolveException(team.asManager, {
      exceptionId: exception!.id,
      resolution: 'confirmed',
      note: 'ตรวจกับหนังสือรับรองแล้ว',
      actorId: team.manager.id,
    });
    expect(resolved).toMatchObject({
      status: 'resolved',
      resolution: 'confirmed',
      resolved_by: team.manager.id,
    });
    expect((await validateRecord(svc, team.recordId, null))!.version).toBe('activated');
    expect((await getActiveVersion(svc, team.recordId))!.version_no).toBe(2);
    expect(await open(team.recordId)).toEqual([]);
    // Same value again: the confirmed resolution holds.
    expect((await validateRecord(svc, team.recordId, null))!.version).toBe('unchanged');
    expect(await open(team.recordId)).toEqual([]);
    // A different wrong value is a new problem.
    await svc.from('dbd_records').update({ registered_capital: 1_000_000 }).eq('id', team.recordId);
    await validateRecord(svc, team.recordId, null);
    expect(await open(team.recordId)).toEqual(['conflict:registered_capital:acceptance']);
    await svc
      .from('dbd_records')
      .update({ registered_capital: COMPLETE_RECORD.registered_capital })
      .eq('id', team.recordId);
    await validateRecord(svc, team.recordId, null);
  });

  it('never lets a missing fact be dismissed', async () => {
    await svc
      .from('dbd_records')
      .update({
        structured_data: {
          ...COMPLETE_STRUCTURED,
          interview: { ...COMPLETE_STRUCTURED.interview, monthly_revenue: null },
        } as never,
      })
      .eq('id', team.recordId);
    await validateRecord(svc, team.recordId, null);
    const [missing] = await listOpenExceptions(svc, team.recordId);
    expect(missing).toMatchObject({ kind: 'missing', field: 'monthly_revenue' });
    await expect(
      resolveException(team.asManager, {
        exceptionId: missing!.id,
        resolution: 'dismissed',
        note: 'x',
        actorId: team.manager.id,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    const structured = readStructuredData((await record(team.recordId)).structured_data);
    expect(structured.interview?.monthly_revenue).toBeNull();
  });

  it('accepts an unconfirmed record once a person confirms its low-confidence value', async () => {
    const { data: row } = await svc
      .from('dbd_records')
      .select('structured_data')
      .eq('id', team.recordId)
      .single();
    const structured = (row!.structured_data as Record<string, unknown>) ?? {};
    await svc
      .from('dbd_records')
      .update({
        structured_data: {
          ...COMPLETE_STRUCTURED,
          provenance: {
            ...((structured.provenance as object) ?? {}),
            registered_capital: { confidence: 0.6, source_page: 1, source_document: 1 },
          },
        } as never,
        extraction_status: 'extracted',
        confirmed_by: null,
        confirmed_at: null,
        confirmed_automatically: false,
      })
      .eq('id', team.recordId);
    const first = (await validateRecord(svc, team.recordId, null))!;
    expect(first.accepted).toBe(false);
    expect(await open(team.recordId)).toEqual(['low_confidence:registered_capital:acceptance']);
    const [low] = await listOpenExceptions(svc, team.recordId);
    await resolveException(team.asManager, {
      exceptionId: low!.id,
      resolution: 'confirmed',
      note: 'ตรงกับหนังสือรับรอง',
      actorId: team.manager.id,
    });
    const second = (await validateRecord(svc, team.recordId, null))!;
    expect(second.accepted).toBe(true);
    expect((await record(team.recordId)).confirmed_automatically).toBe(true);
    expect(await open(team.recordId)).toEqual([]);
  });
});

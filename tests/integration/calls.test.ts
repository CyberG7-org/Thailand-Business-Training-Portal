import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  attachVapiCall,
  completeFakeSession,
  ingestVapiMessage,
  listMyCallSessions,
  startCallSession,
} from '@/lib/db/calls';
import { parseVapiMessage } from '@/lib/integrations/vapi/webhook';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

const FAKE_ENV = { VAPI_PROVIDER: 'fake', NODE_ENV: 'test' };
const LIVE_ENV = {
  VAPI_PROVIDER: 'vapi',
  VAPI_PUBLIC_KEY: 'pk_test',
  VAPI_WEBHOOK_SECRET: 'whsec',
  NEXT_PUBLIC_APP_URL: 'https://portal.example',
};

describe('bank call sessions', () => {
  const svc = adminClient();
  let admin: TestUser;
  let ready: TestUser;
  let early: TestUser;
  let other: TestUser;
  let asReady: Client;
  let asEarly: Client;
  let asOther: Client;
  const recordIds: string[] = [];

  async function seedCompany(userId: string, issuedOn: string) {
    const { data } = await svc
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท โทรทดสอบ จำกัด',
        juristic_id: '0105569000123',
        registered_capital: 2000000,
        head_office_address: '99/9',
        issued_on: issuedOn,
        extraction_status: 'confirmed',
        confirmed_by: admin.id,
        confirmed_at: new Date().toISOString(),
      })
      .select()
      .single();
    recordIds.push(data!.id);
    await svc
      .from('user_dbd_assignments')
      .insert({ user_id: userId, dbd_record_id: data!.id, assigned_by: admin.id });
  }

  beforeAll(async () => {
    [admin, ready, early, other] = await Promise.all([
      createTestUser('admin'),
      createTestUser('learner'),
      createTestUser('learner'),
      createTestUser('learner'),
    ]);
    [asReady, asEarly, asOther] = await Promise.all([
      clientFor(ready),
      clientFor(early),
      clientFor(other),
    ]);
    await seedCompany(ready.id, '2020-01-01'); // long past the +45 days
    await seedCompany(early.id, '2099-01-01');
    // Exam pass is required by default policy; make it not required for this suite.
    await svc
      .from('policy_config')
      .upsert({ key: 'require_exam_pass_for_bank_call', value: false });
  });

  afterAll(async () => {
    await svc.from('policy_config').upsert({ key: 'require_exam_pass_for_bank_call', value: true });
    await svc.from('webhook_events').delete().eq('provider', 'vapi').like('external_id', 'it-%');
    await svc.from('call_sessions').delete().in('user_id', [ready.id, early.id]);
    await svc.from('user_dbd_assignments').delete().in('dbd_record_id', recordIds);
    await svc.from('eligibility_snapshots').delete().in('dbd_record_id', recordIds);
    await svc.from('dbd_records').delete().in('id', recordIds);
    await Promise.all([admin, ready, early, other].map((u) => deleteTestUser(u.id)));
  });

  it('blocks learners whose bank stage is not open', async () => {
    await expect(startCallSession(asEarly, early.id, FAKE_ENV)).rejects.toMatchObject({
      code: 'not_open',
      gate: { status: 'locked', reason: 'before_available_from' },
    });
    await expect(startCallSession(asOther, other.id, FAKE_ENV)).rejects.toMatchObject({
      code: 'not_open',
    });
  });

  it('starts a live session with a Thai transient assistant carrying the company facts', async () => {
    const { session, config, provider } = await startCallSession(asReady, ready.id, LIVE_ENV);
    expect(provider).toBe('vapi');
    expect(session.modality).toBe('web');
    expect(config?.publicKey).toBe('pk_test');
    expect(config?.overrides.variableValues.company_name_th).toBe('บริษัท โทรทดสอบ จำกัด');
    expect(config?.overrides.variableValues.session_id).toBe(session.id);
    expect(config?.assistant.server).toMatchObject({
      url: 'https://portal.example/api/webhooks/vapi',
    });

    await attachVapiCall(ready.id, session.id, 'it-call-1');
    await expect(attachVapiCall(other.id, session.id, 'it-call-x')).rejects.toMatchObject({
      code: 'not_found',
    });

    // Webhook: ended status, then the report with transcript + recording (fake fetcher stores a path).
    const ended = parseVapiMessage({
      message: {
        type: 'status-update',
        status: 'ended',
        endedReason: 'hangup',
        call: { id: 'it-call-1' },
      },
    })!;
    expect(await ingestVapiMessage(ended, {})).toBe('applied');
    expect(await ingestVapiMessage(ended, {})).toBe('duplicate');

    const report = parseVapiMessage({
      message: {
        type: 'end-of-call-report',
        call: { id: 'it-call-1' },
        artifact: {
          transcript: 'AI: ถาม\nUser: ตอบ',
          recording: { mono: { combinedUrl: 'https://rec/x.wav' } },
        },
      },
    })!;
    expect(await ingestVapiMessage(report, {}, async (id) => `${id}/rec.wav`)).toBe('applied');

    const mine = await listMyCallSessions(asReady, ready.id);
    const done = mine.find((s) => s.id === session.id)!;
    expect(done.status).toBe('completed');
    expect(done.transcript).toContain('ตอบ');
    expect(done.recording_path).toBe(`${session.id}/rec.wav`);
    expect((done.metadata as { ended_reason?: string }).ended_reason).toBe('hangup');
    expect(await listMyCallSessions(asOther, ready.id)).toEqual([]);
  });

  it('marks partial when the recording cannot be fetched, and ignores unknown calls', async () => {
    const { session } = await startCallSession(asReady, ready.id, LIVE_ENV);
    await attachVapiCall(ready.id, session.id, 'it-call-2');
    const report = parseVapiMessage({
      message: {
        type: 'end-of-call-report',
        call: { id: 'it-call-2' },
        artifact: { transcript: 'x', recordingUrl: 'https://rec/gone.wav' },
      },
    })!;
    expect(await ingestVapiMessage(report, {}, async () => null)).toBe('applied');
    const { data } = await svc
      .from('call_sessions')
      .select('status, metadata')
      .eq('id', session.id)
      .single();
    expect(data?.status).toBe('partial');
    expect((data?.metadata as { provider_recording_url?: string }).provider_recording_url).toBe(
      'https://rec/gone.wav',
    );

    const unknown = parseVapiMessage({
      message: { type: 'end-of-call-report', call: { id: 'it-call-nope' } },
    })!;
    expect(await ingestVapiMessage(unknown, {})).toBe('no_session');
  });

  it('completes fake sessions with a personalized canned transcript and honours the session cap', async () => {
    const { session, provider, config } = await startCallSession(asReady, ready.id, FAKE_ENV);
    expect(provider).toBe('fake');
    expect(config).toBeNull();
    const done = await completeFakeSession(ready.id, session.id);
    expect(done.status).toBe('completed');
    expect(done.transcript).toContain('บริษัท โทรทดสอบ จำกัด');
    await expect(completeFakeSession(other.id, session.id)).rejects.toMatchObject({
      code: 'not_found',
    });

    await svc.from('policy_config').upsert({ key: 'call_max_sessions', value: 3 });
    await expect(startCallSession(asReady, ready.id, FAKE_ENV)).rejects.toMatchObject({
      code: 'max_sessions',
    });
    await svc.from('policy_config').upsert({ key: 'call_max_sessions', value: null });
  });
});

import { getActiveVersion, syncTrainingVersion } from '@/lib/db/training-versions';
import { moveAssignmentToVersion } from '@/lib/db/pinning';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createMyNameCardUrl,
  generateNameCard,
  getMyLatestNameCard,
  queueNameCardToTelegram,
  nameCardReadiness,
} from '@/lib/db/name-cards';
import { processDueNotifications } from '@/lib/db/notifications';
import { FakeNotifier } from '@/lib/integrations/notify/fake';
import type { PdfRenderer } from '@/lib/integrations/pdf/name-card';
import {
  CONFIRMED_ANSWERS,
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

const HOLDER = { holderNameTh: 'สมชาย ทดสอบ', holderNameEn: 'SOMCHAI TESTER' };

const fakeRenderer: PdfRenderer = {
  name: 'fake',
  async renderNameCard() {
    return new TextEncoder().encode('%PDF-1.4 fake');
  },
};

describe('name cards', () => {
  const svc = adminClient();
  let admin: TestUser;
  let learner: TestUser;
  let other: TestUser;
  let asLearner: Client;
  let asOther: Client;
  let recordId: string;
  let cardId: string;

  beforeAll(async () => {
    [admin, learner, other] = await Promise.all([
      createTestUser('admin'),
      createTestUser('learner', { displayName: 'สมชาย ทดสอบ' }),
      createTestUser('learner'),
    ]);
    [asLearner, asOther] = await Promise.all([clientFor(learner), clientFor(other)]);
    const { data } = await svc
      .from('dbd_records')
      .insert({
        company_name_th: 'บริษัท นามบัตร จำกัด',
        juristic_id: '0105569000134',
        head_office_address: '1 ถนนตัวอย่าง',
        issued_on: '2026-07-13',
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
    await svc.from('policy_config').upsert({ key: 'telegram_admin_chat_ids', value: ['777'] });
  });

  afterAll(async () => {
    await svc.from('notifications').delete().like('idempotency_key', 'name_card:%');
    const { data: cards } = await svc
      .from('name_cards')
      .select('pdf_path')
      .eq('user_id', learner.id);
    if (cards?.length) await svc.storage.from('name-cards').remove(cards.map((c) => c.pdf_path));
    await svc.from('name_cards').delete().eq('user_id', learner.id);
    await svc.from('user_dbd_assignments').delete().eq('dbd_record_id', recordId);
    await svc.from('eligibility_snapshots').delete().eq('dbd_record_id', recordId);
    await svc.from('dbd_records').delete().eq('id', recordId);
    await svc.from('policy_config').upsert({ key: 'telegram_admin_chat_ids', value: [] });
    await Promise.all([admin, learner, other].map((u) => deleteTestUser(u.id)));
  });

  it('rejects invalid phones and learners without an assignment', async () => {
    await expect(
      generateNameCard(learner.id, { phone: '12345', ...HOLDER }, fakeRenderer),
    ).rejects.toMatchObject({
      code: 'invalid_phone',
    });
    await expect(
      generateNameCard(other.id, { phone: '0812345678', ...HOLDER }, fakeRenderer),
    ).rejects.toMatchObject({
      code: 'no_assignment',
    });
  });

  it('refuses a blank holder name', async () => {
    await expect(
      generateNameCard(
        learner.id,
        { phone: '0812345678', holderNameTh: '   ', holderNameEn: null },
        fakeRenderer,
      ),
    ).rejects.toMatchObject({ code: 'invalid_name' });
  });

  it('generates, stores and signs a card only for its owner', async () => {
    const card = await generateNameCard(
      learner.id,
      { phone: '+66 81 234 5678', ...HOLDER },
      fakeRenderer,
    );
    cardId = card.id;
    expect(card.phone_number).toBe('0812345678');
    expect(card.holder_name).toBe('สมชาย ทดสอบ');
    expect(card.holder_name_en).toBe('SOMCHAI TESTER');
    expect(card.template_version).toBe('two-sided-v2');
    expect(card.pdf_path.startsWith(`${learner.id}/`)).toBe(true);

    expect((await getMyLatestNameCard(asLearner, learner.id))?.id).toBe(card.id);
    expect(await getMyLatestNameCard(asOther, learner.id)).toBeNull();
    expect(await createMyNameCardUrl(learner.id, card.id)).toMatch(/name-cards/);
    expect(await createMyNameCardUrl(other.id, card.id)).toBeNull();
  });

  it('refuses when the pinned sheet lacks a required field — a record change reaches the learner only by a move (D75)', async () => {
    const moveToNewest = async () => {
      await syncTrainingVersion(svc, recordId, null);
      const [{ data: assignment }, active] = await Promise.all([
        svc
          .from('user_dbd_assignments')
          .select('id')
          .eq('user_id', learner.id)
          .eq('active', true)
          .single(),
        getActiveVersion(svc, recordId),
      ]);
      await moveAssignmentToVersion(svc, { assignmentId: assignment!.id, versionId: active!.id });
    };
    await svc.from('dbd_records').update({ head_office_address: null }).eq('id', recordId);
    // The live row changed; the learner is still on the version that has the address.
    expect((await nameCardReadiness(learner.id)).missingFields).toEqual([]);
    await moveToNewest();
    await expect(
      generateNameCard(learner.id, { phone: '0812345678', ...HOLDER }, fakeRenderer),
    ).rejects.toMatchObject({
      code: 'missing_fields',
      fields: ['head_office_address'],
    });
    await svc
      .from('dbd_records')
      .update({ head_office_address: '1 ถนนตัวอย่าง' })
      .eq('id', recordId);
    await moveToNewest();
  });

  it('queues the PDF for Telegram once per destination and the processor sends it as a document', async () => {
    expect(await queueNameCardToTelegram(learner.id, cardId)).toBe(1);
    expect(await queueNameCardToTelegram(learner.id, cardId)).toBe(1); // idempotent
    const { data: rows } = await svc
      .from('notifications')
      .select('id')
      .like('idempotency_key', `name_card:${cardId}:%`);
    expect(rows).toHaveLength(1);

    const telegram = new FakeNotifier('telegram');
    const summary = await processDueNotifications(() => telegram, 50);
    expect(summary.sent).toBeGreaterThanOrEqual(1);
    const doc = telegram.documents.find((d) => d.message.destination === '777');
    expect(doc?.document.filename).toBe(`name-card-${learner.loginId}.pdf`);
    expect(new TextDecoder().decode(doc!.document.bytes)).toContain('%PDF');
    await expect(queueNameCardToTelegram(other.id, cardId)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});

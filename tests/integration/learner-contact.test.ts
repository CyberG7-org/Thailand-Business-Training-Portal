import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { contactColumns, createLearnerAccount, createManagerAccount } from '@/lib/db/provisioning';
import { learnerContactSchema } from '@/lib/domain/learner-contact';
import {
  adminClient,
  clientFor,
  createTestLearnerIn,
  createTestManager,
  deleteTestUser,
} from './helpers';

const svc = adminClient();
const PASSWORD = 'Test-Password-123!';
const fresh = () => randomUUID().replaceAll('-', '').slice(0, 6);

async function contactOf(id: string) {
  const { data, error } = await svc
    .from('profiles')
    .select('phone, contact_email, website, facebook_page')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

/** D80: the contact details a manager gives a learner. */
describe('learner contact details', () => {
  const created: string[] = [];
  afterAll(async () => {
    for (const id of created.reverse()) await deleteTestUser(id);
  });

  it('are saved with the learner when they are created', async () => {
    const manager = await createManagerAccount({ suffix: fresh(), password: PASSWORD });
    created.push(manager.id);
    const contact = learnerContactSchema.parse({
      phone: '081-234-5678',
      contactEmail: 'somchai@example.co.th',
      website: 'example.co.th',
      facebookPage: 'tharavanich',
    });
    const learner = await createLearnerAccount({
      suffix: 'c1',
      password: PASSWORD,
      managerId: manager.id,
      contact,
    });
    created.push(learner.id);
    expect(await contactOf(learner.id)).toEqual({
      phone: '0812345678',
      contact_email: 'somchai@example.co.th',
      website: 'https://example.co.th',
      facebook_page: 'https://www.facebook.com/tharavanich',
    });
  });

  it('are edited by the learner’s own manager under RLS, and by nobody else', async () => {
    const manager = await createTestManager();
    const other = await createTestManager();
    const learner = await createTestLearnerIn(manager);
    created.push(learner.id, manager.id, other.id);
    const edit = learnerContactSchema.parse({ phone: '0891112222', contactEmail: 'a@b.co' });

    const { error } = await (
      await clientFor(manager)
    )
      .from('profiles')
      .update(contactColumns(edit))
      .eq('id', learner.id)
      .select('id')
      .single();
    expect(error).toBeNull();
    expect((await contactOf(learner.id)).phone).toBe('0891112222');

    // Another team's manager and the learner themself find no row they may change.
    await (
      await clientFor(other)
    )
      .from('profiles')
      .update({ phone: '0800000000' })
      .eq('id', learner.id);
    await (
      await clientFor(learner)
    )
      .from('profiles')
      .update({ phone: '0800000000' })
      .eq('id', learner.id);
    expect((await contactOf(learner.id)).phone).toBe('0891112222');
  });
});

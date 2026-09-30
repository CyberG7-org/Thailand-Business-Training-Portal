'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { LearnerContact } from '@/lib/domain/learner-contact';
import { LearnerContactFields } from '../learner-contact-fields';
import { updateContactAction, type AccountActionState } from './actions';

const initial: AccountActionState = { message: null, error: null };

/** The learner's contact details, as their manager keeps them (D80). */
export function ContactForm({
  userId,
  contact,
}: {
  userId: string;
  contact: Partial<LearnerContact> | null;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.users.contact');
  const [state, formAction, pending] = useActionState(updateContactAction, initial);
  return (
    <form action={formAction} className="staff-card grid max-w-md gap-3" data-testid="contact-form">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="userId" value={userId} />
      <h2 className="font-semibold">{t('title')}</h2>
      <LearnerContactFields values={contact} />
      {state.error && (
        <p role="alert" className="text-sm text-bad-600">
          {state.error}
        </p>
      )}
      {state.message === 'contact-saved' && (
        <p role="status" data-testid="contact-saved" className="text-sm text-ok-600">
          {t('saved')}
        </p>
      )}
      <button type="submit" disabled={pending} className="staff-btn justify-self-start">
        {t('save')}
      </button>
    </form>
  );
}

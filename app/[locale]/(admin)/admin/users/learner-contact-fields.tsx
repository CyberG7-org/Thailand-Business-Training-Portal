'use client';

import { useTranslations } from 'next-intl';
import type { LearnerContact } from '@/lib/domain/learner-contact';

/**
 * A learner's contact details as their manager gives them (D80): phone and email required,
 * website and Facebook page optional. Shared by the create form and the learner's own page, so
 * both post the same field names to the same validation.
 */
export function LearnerContactFields({ values }: { values?: Partial<LearnerContact> | null }) {
  const t = useTranslations('admin.users.contact');
  return (
    <>
      <label className="text-sm">
        {t('phone')}
        <input
          name="phone"
          type="tel"
          required
          inputMode="tel"
          maxLength={20}
          autoComplete="off"
          defaultValue={values?.phone ?? ''}
          placeholder="08X-XXX-XXXX"
          className="staff-input mt-1 tabular-nums"
        />
      </label>
      <label className="text-sm">
        {t('contactEmail')}
        <input
          name="contactEmail"
          type="email"
          required
          maxLength={320}
          autoComplete="off"
          defaultValue={values?.contactEmail ?? ''}
          className="staff-input mt-1"
        />
      </label>
      <label className="text-sm">
        {t('website')} <span className="text-ink-500">{t('optional')}</span>
        <input
          name="website"
          inputMode="url"
          maxLength={300}
          autoComplete="off"
          defaultValue={values?.website ?? ''}
          placeholder="example.co.th"
          className="staff-input mt-1"
        />
      </label>
      <label className="text-sm">
        {t('facebookPage')} <span className="text-ink-500">{t('optional')}</span>
        <input
          name="facebookPage"
          maxLength={300}
          autoComplete="off"
          defaultValue={values?.facebookPage ?? ''}
          placeholder={t('facebookPlaceholder')}
          className="staff-input mt-1"
        />
      </label>
    </>
  );
}

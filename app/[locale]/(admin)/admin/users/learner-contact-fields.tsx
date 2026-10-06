'use client';

import { useTranslations } from 'next-intl';
import type { LearnerContact } from '@/lib/domain/learner-contact';

export type ContactField = 'phone' | 'contactEmail' | 'website' | 'facebookPage';

const ALL: ContactField[] = ['phone', 'contactEmail', 'website', 'facebookPage'];

/**
 * A learner's contact details as their manager gives them (D80): phone and email required,
 * website and Facebook page optional. Shared by the create form and the learner's own page, so
 * both post the same field names to the same validation. The create form lays them out in two
 * sections, so it asks for some of them at a time (`only`) with its bolder labels (`strong`).
 */
export function LearnerContactFields({
  values,
  only = ALL,
  strong = false,
}: {
  values?: Partial<LearnerContact> | null;
  only?: ContactField[];
  strong?: boolean;
}) {
  const t = useTranslations('admin.users.contact');
  const label = strong ? 'font-semibold text-ink-900' : undefined;
  const optional = <span className="font-normal text-ink-500">{t('optional')}</span>;
  // At Create learner (strong) the two required details say what they are for (D101).
  const forCard = strong ? <span className="font-normal text-ink-500"> {t('forCard')}</span> : null;
  const fields: Record<ContactField, React.ReactNode> = {
    phone: (
      <label key="phone" className="text-sm">
        <span className={label}>{t('phone')}</span>
        {forCard}
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
    ),
    contactEmail: (
      <label key="contactEmail" className="text-sm">
        <span className={label}>{t('contactEmail')}</span>
        {forCard}
        <input
          name="contactEmail"
          type="email"
          required
          maxLength={320}
          autoComplete="off"
          defaultValue={values?.contactEmail ?? ''}
          placeholder={t('emailPlaceholder')}
          className="staff-input mt-1"
        />
      </label>
    ),
    website: (
      <label key="website" className="text-sm">
        <span className={label}>{t('website')}</span> {optional}
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
    ),
    facebookPage: (
      <label key="facebookPage" className="text-sm">
        <span className={label}>{t('facebookPage')}</span> {optional}
        <input
          name="facebookPage"
          maxLength={300}
          autoComplete="off"
          defaultValue={values?.facebookPage ?? ''}
          placeholder={t('facebookPlaceholder')}
          className="staff-input mt-1"
        />
      </label>
    ),
  };
  return <>{only.map((field) => fields[field])}</>;
}

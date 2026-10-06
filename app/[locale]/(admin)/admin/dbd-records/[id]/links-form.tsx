'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { saveLinksAction, type ToolState } from '../actions';

const initial: ToolState = { ok: false, error: null };

/**
 * The company's website and Facebook page (D101): read from the zip's link files, printed on
 * the name card, and correctable here.
 */
export function LinksForm({
  recordId,
  website,
  facebookPage,
}: {
  recordId: string;
  website: string | null;
  facebookPage: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd.links');
  const [state, formAction, pending] = useActionState(saveLinksAction, initial);
  return (
    <form action={formAction} className="staff-card grid gap-3" data-testid="record-links">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={recordId} />
      <div>
        <h2 className="text-base font-semibold text-ink-900">{t('title')}</h2>
        <p className="text-sm text-ink-500">{t('hint')}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          <span className="font-semibold text-ink-900">{t('website')}</span>
          <input
            name="website"
            inputMode="url"
            maxLength={300}
            autoComplete="off"
            defaultValue={website ?? ''}
            placeholder="example.co.th"
            className="staff-input mt-1"
          />
        </label>
        <label className="text-sm">
          <span className="font-semibold text-ink-900">{t('facebookPage')}</span>
          <input
            name="facebook_page"
            maxLength={300}
            autoComplete="off"
            defaultValue={facebookPage ?? ''}
            placeholder="facebook.com/…"
            className="staff-input mt-1"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="staff-btn-ghost staff-btn-sm">
          {t('save')}
        </button>
        {state.error && (
          <p role="alert" className="text-sm text-bad-600">
            {t('invalid')}
          </p>
        )}
        {state.ok && (
          <p role="status" data-testid="links-saved" className="text-sm text-ok-600">
            {t('saved')}
          </p>
        )}
      </div>
    </form>
  );
}

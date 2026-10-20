import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { requireStaffOrSubmanager } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { displayLoginId } from '@/lib/domain/login-id';
import { ChangePasswordForm } from './password-form';

const DATE_LOCALES: Record<AppLocale, string> = {
  th: 'th-TH',
  en: 'en-GB',
  zh: 'zh-CN',
  ms: 'ms-MY',
};

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const staff = await requireStaffOrSubmanager(locale);
  const [t, db] = await Promise.all([getTranslations('profile'), createSupabaseServerClient()]);
  const { data: profile } = await db
    .from('profiles')
    .select('password_changed_at')
    .eq('id', staff.id)
    .maybeSingle();
  const changedAt = profile?.password_changed_at ?? null;
  const date = changedAt
    ? new Intl.DateTimeFormat(DATE_LOCALES[locale as AppLocale], {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Bangkok',
      }).format(new Date(changedAt))
    : null;

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="staff-title">{t('title')}</h1>
        <p className="staff-intro">{t('intro')}</p>
      </div>
      <div className="staff-card grid max-w-xl gap-5">
        <div className="border-b border-ink-100 pb-4">
          <p className="text-xs font-semibold tracking-wide text-ink-500 uppercase">
            {t('account')}
          </p>
          <p className="mt-1 font-semibold text-brand-900">
            {staff.displayName ?? displayLoginId(staff.loginId)}
          </p>
          <p className="text-sm text-ink-500">{displayLoginId(staff.loginId)}</p>
          <div className="mt-4 text-sm">
            <p className="text-ink-500">{t('lastPasswordUpdate')}</p>
            <p className="font-medium text-ink-900" data-testid="last-password-update">
              {changedAt && date ? (
                <time dateTime={changedAt}>
                  {date} {t('bangkokTime')}
                </time>
              ) : (
                t('lastPasswordUpdateUnknown')
              )}
            </p>
          </div>
        </div>
        <ChangePasswordForm />
      </div>
    </section>
  );
}

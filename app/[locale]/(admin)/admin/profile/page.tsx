import { getTranslations } from 'next-intl/server';
import { requireStaff } from '@/lib/auth/session';
import { displayLoginId } from '@/lib/domain/login-id';
import { ChangePasswordForm } from './password-form';

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const staff = await requireStaff(locale);
  const t = await getTranslations('profile');

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
        </div>
        <ChangePasswordForm />
      </div>
    </section>
  );
}

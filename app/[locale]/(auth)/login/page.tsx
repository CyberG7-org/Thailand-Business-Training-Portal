import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { LanguageToggle } from '@/components/language-toggle';
import { getCurrentUser, homePathFor } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reason?: string }>;
}) {
  const { locale } = await params;
  const { reason } = await searchParams;
  const user = await getCurrentUser();
  if (user && user.status === 'active') {
    redirect(homePathFor(user.role, locale));
  }
  const [t, ta] = await Promise.all([getTranslations('auth'), getTranslations('app')]);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <div className="fixed top-4 right-4">
        <LanguageToggle label={ta('language')} />
      </div>
      <h1 className="mb-6 text-2xl font-semibold">{t('title')}</h1>
      {reason === 'disabled' && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {t('accountDisabled')}
        </p>
      )}
      <LoginForm
        labels={{
          loginId: t('loginId'),
          password: t('password'),
          submit: t('submit'),
          invalid: t('invalidCredentials'),
          disabled: t('accountDisabled'),
        }}
      />
    </main>
  );
}

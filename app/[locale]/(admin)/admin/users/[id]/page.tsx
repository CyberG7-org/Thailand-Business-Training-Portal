import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { AccountControls } from './account-controls';

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  await requireAdmin(locale);
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (!user) notFound();
  const t = await getTranslations('admin.users');
  return (
    <section className="grid gap-6">
      <Link href="/admin/users" className="text-sm underline">
        ← {t('title')}
      </Link>
      <h1 className="text-2xl font-semibold">{user.login_id}</h1>
      <dl className="grid max-w-md grid-cols-2 gap-1 text-sm">
        <dt>{t('displayName')}</dt>
        <dd>{user.display_name ?? '—'}</dd>
        <dt>{t('role')}</dt>
        <dd>{user.role}</dd>
        <dt>{t('language')}</dt>
        <dd>{user.preferred_language}</dd>
        <dt>{t('status')}</dt>
        <dd data-testid="account-status">{user.status}</dd>
      </dl>
      <AccountControls userId={user.id} status={user.status as 'active' | 'disabled'} />
    </section>
  );
}

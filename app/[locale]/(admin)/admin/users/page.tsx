import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { NewUserForm } from './new-user-form';

export default async function UsersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireAdmin(locale);
  const supabase = await createSupabaseServerClient();
  const { data: users } = await supabase
    .from('profiles')
    .select('id, login_id, role, display_name, status, created_at')
    .order('created_at', { ascending: false });
  const t = await getTranslations('admin.users');
  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <NewUserForm />
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">{t('loginId')}</th>
            <th>{t('displayName')}</th>
            <th>{t('role')}</th>
            <th>{t('status')}</th>
          </tr>
        </thead>
        <tbody>
          {(users ?? []).map((u) => (
            <tr key={u.id} className="border-b">
              <td className="py-2">
                <Link href={`/admin/users/${u.id}`} className="underline">
                  {u.login_id}
                </Link>
              </td>
              <td>{u.display_name ?? '—'}</td>
              <td>{u.role}</td>
              <td>{u.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

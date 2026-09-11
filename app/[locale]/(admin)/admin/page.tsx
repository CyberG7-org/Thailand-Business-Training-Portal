import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export default async function AdminHome() {
  const t = await getTranslations('admin');
  return (
    <section>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <ul className="mt-4 list-disc pl-6">
        <li>
          <Link href="/admin/users" className="underline">
            {t('nav.users')}
          </Link>
        </li>
      </ul>
    </section>
  );
}

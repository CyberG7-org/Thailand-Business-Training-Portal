import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LOCALES } from '@/i18n/routing';
import { requireStaff } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { listStudyMaterials } from '@/lib/db/study';
import { loadStarterCardsAction } from './actions';

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ loaded?: string }>;
}) {
  const { locale } = await params;
  const { loaded } = await searchParams;
  await requireStaff(locale);
  const materials = await listStudyMaterials(await createSupabaseServerClient());
  const t = await getTranslations('admin.content');
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="staff-title">{t('title')}</h1>
        <div className="flex gap-2">
          <form action={loadStarterCardsAction}>
            <input type="hidden" name="locale" value={locale} />
            <button
              type="submit"
              data-testid="load-starter-cards"
              className="staff-btn-ghost staff-btn-sm"
            >
              {t('loadStarterCards')}
            </button>
          </form>
          <Link href="/admin/content/new" className="staff-btn staff-btn-sm">
            {t('new')}
          </Link>
        </div>
      </div>
      {loaded !== undefined && (
        <p role="status" data-testid="starter-loaded" className="text-sm text-ok-600">
          {t('starterLoaded', { count: Number(loaded) })}
        </p>
      )}
      <div className="staff-table-wrap">
        <table className="staff-table">
          <thead>
            <tr>
              <th>{t('key')}</th>
              <th>{t('type')}</th>
              <th>{t('sortOrder')}</th>
              <th>{t('active')}</th>
              <th>{t('languages')}</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.id}>
                <td>
                  <Link href={`/admin/content/${m.id}`} className="staff-link">
                    {m.content_key}
                  </Link>
                </td>
                <td>{m.type}</td>
                <td>{m.sort_order}</td>
                <td>{m.active ? '✓' : '—'}</td>
                <td>
                  {LOCALES.filter((l) =>
                    m.study_material_localizations.some((loc) => loc.language === l),
                  ).join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

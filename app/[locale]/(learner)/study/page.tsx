import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/db/server';
import { getMyStudyProgress, listStudyMaterials, pickLocalization } from '@/lib/db/study';

export default async function StudyListPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const db = await createSupabaseServerClient();
  const [materials, progress] = await Promise.all([
    listStudyMaterials(db),
    getMyStudyProgress(db, user.id),
  ]);
  const t = await getTranslations('study');
  const progressById = new Map(progress.map((p) => [p.material_id, p]));

  return (
    <section className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {materials.length === 0 && <p className="text-sm">{t('empty')}</p>}
      <ul className="grid gap-3">
        {materials.map((m) => {
          const loc = pickLocalization(m, locale as AppLocale);
          const p = progressById.get(m.id);
          const state = p?.completed_at ? 'completed' : p ? 'viewed' : 'new';
          return (
            <li
              key={m.id}
              className="flex items-center justify-between rounded border p-4"
              data-testid={`study-item-${m.content_key}`}
            >
              <div>
                {loc ? (
                  <Link href={`/study/${m.content_key}`} className="font-medium underline">
                    {loc.title}
                  </Link>
                ) : (
                  <span className="font-medium text-gray-500">{t('notAvailable')}</span>
                )}
                <p className="text-xs text-gray-500">{m.type === 'pdf' ? 'PDF' : t('card')}</p>
              </div>
              <span
                className="rounded bg-gray-100 px-2 py-0.5 text-xs"
                data-testid={`study-state-${m.content_key}`}
              >
                {t(`state.${state}`)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

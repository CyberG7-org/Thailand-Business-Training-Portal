import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { listQuestions } from '@/lib/db/questions';
import { createSupabaseServerClient } from '@/lib/db/server';

export default async function QuestionsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireAdmin(locale);
  const questions = await listQuestions(await createSupabaseServerClient());
  const t = await getTranslations('admin.questions');
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link
          href="/admin/questions/new"
          className="rounded bg-gray-900 px-3 py-1 text-sm text-white"
        >
          {t('new')}
        </Link>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">{t('key')}</th>
            <th>{t('kind')}</th>
            <th>{t('pools')}</th>
            <th>{t('status')}</th>
            <th>{t('languages')}</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => (
            <tr key={q.id} className="border-b">
              <td className="py-2">
                <Link href={`/admin/questions/${q.id}`} className="underline">
                  {q.question_key}
                </Link>
              </td>
              <td>{q.kind}</td>
              <td>{q.pools.join(', ')}</td>
              <td>{q.approval_status}</td>
              <td>
                {q.question_localizations
                  .map((l) => l.language)
                  .sort()
                  .join(', ') || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

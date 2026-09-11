import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth/session';
import { getPolicy } from '@/lib/config/policy';
import { listMyAttempts } from '@/lib/db/assessment';
import { createSupabaseServerClient } from '@/lib/db/server';
import { StartExamButton } from './start-button';

export default async function ExamHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const [attempts, passingMark, count] = await Promise.all([
    listMyAttempts(await createSupabaseServerClient(), user.id, 'exam'),
    getPolicy('exam_passing_mark_percent'),
    getPolicy('exam_question_count'),
  ]);
  const inProgress = attempts.find((a) => a.status === 'in_progress') ?? null;
  const t = await getTranslations('exam');
  return (
    <section className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="max-w-2xl text-sm text-gray-700">{t('intro', { count, passingMark })}</p>
      <StartExamButton resume={inProgress !== null} />
      {attempts.some((a) => a.status === 'submitted') && (
        <div className="grid gap-2">
          <h2 className="font-semibold">{t('history')}</h2>
          <ul className="grid gap-1 text-sm">
            {attempts
              .filter((a) => a.status === 'submitted')
              .map((a) => (
                <li key={a.id} data-testid={`exam-attempt-${a.attempt_no}`}>
                  <Link href={`/exam/${a.id}/result`} className="underline">
                    {t('attemptLine', {
                      no: a.attempt_no,
                      score: a.score ?? 0,
                      max: a.max_score ?? 0,
                      result: a.result === 'pass' ? t('pass') : t('fail'),
                    })}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}

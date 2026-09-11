import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth/session';
import { getAttemptWithAnswers } from '@/lib/db/assessment';
import { createSupabaseServerClient } from '@/lib/db/server';

/** Score, pass/fail and which questions were wrong — correct answers stay hidden (D21). */
export default async function ExamResultPage({
  params,
}: {
  params: Promise<{ locale: string; attemptId: string }>;
}) {
  const { locale, attemptId } = await params;
  await requireUser(locale);
  const attempt = await getAttemptWithAnswers(await createSupabaseServerClient(), attemptId);
  if (!attempt || attempt.kind !== 'exam') notFound();
  if (attempt.status === 'in_progress') redirect(`/${locale}/exam/${attemptId}`);
  const t = await getTranslations('exam');
  const passed = attempt.result === 'pass';

  return (
    <section className="grid gap-6">
      <Link href="/exam" className="text-sm underline">
        ← {t('title')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('resultTitle')}</h1>
      <p
        className={`inline-block w-fit rounded px-3 py-1 text-lg font-semibold ${passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
        data-testid="exam-result"
        data-result={attempt.result}
      >
        {passed ? t('pass') : t('fail')}
      </p>
      <p data-testid="exam-score">
        {t('scoreLine', {
          score: attempt.score ?? 0,
          max: attempt.max_score ?? 0,
          passingMark: Number(attempt.passing_mark_snapshot ?? 0),
        })}
      </p>
      <p className="text-sm text-gray-600">{t('resultNote')}</p>
      <ol className="grid max-w-2xl gap-2">
        {attempt.assessment_answers.map((a, i) => (
          <li key={a.id} className="flex items-start gap-2 rounded border p-3 text-sm">
            <span className={a.is_correct ? 'text-green-700' : 'text-red-700'}>
              {a.is_correct ? '✓' : '✗'}
            </span>
            <span>
              {i + 1}. {a.rendered_prompt}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

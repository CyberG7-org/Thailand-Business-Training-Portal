import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth/session';
import { getAttemptWithAnswers, getReviewKeys } from '@/lib/db/assessment';
import { createSupabaseServerClient } from '@/lib/db/server';
import type { QuestionOption } from '@/lib/domain/assessment/engine';

export default async function QuizReviewPage({
  params,
}: {
  params: Promise<{ locale: string; attemptId: string }>;
}) {
  const { locale, attemptId } = await params;
  await requireUser(locale);
  const attempt = await getAttemptWithAnswers(await createSupabaseServerClient(), attemptId);
  if (!attempt || attempt.kind !== 'quiz') notFound();
  if (attempt.status === 'in_progress') redirect(`/${locale}/quiz/${attemptId}`);
  const keys = await getReviewKeys(attempt);
  const t = await getTranslations('quiz');

  return (
    <section className="grid gap-6">
      <Link href="/quiz" className="text-sm underline">
        ← {t('title')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('reviewTitle')}</h1>
      <p className="text-lg" data-testid="quiz-score">
        {t('scoreLine', { score: attempt.score ?? 0, max: attempt.max_score ?? 0 })}
      </p>
      <ol className="grid max-w-2xl gap-4">
        {attempt.assessment_answers.map((a, i) => {
          const key = keys.get(a.question_id);
          const options = a.rendered_options as unknown as QuestionOption[];
          return (
            <li key={a.id} className="rounded border p-4" data-testid={`review-${i}`}>
              <p className="font-semibold">
                {i + 1}. {a.rendered_prompt}
              </p>
              <ul className="mt-2 grid gap-1 text-sm">
                {options.map((o) => {
                  const isCorrect = o.key === key?.correctKey;
                  const isSelected = o.key === a.selected_key;
                  return (
                    <li
                      key={o.key}
                      className={
                        isCorrect
                          ? 'text-green-700'
                          : isSelected
                            ? 'text-red-700 line-through'
                            : 'text-gray-600'
                      }
                    >
                      {o.key}. {o.text}
                      {isCorrect ? ` ✓` : ''}
                      {isSelected && !isCorrect ? ` ✗` : ''}
                    </li>
                  );
                })}
              </ul>
              {key?.explanation && <p className="mt-2 text-sm text-gray-700">{key.explanation}</p>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

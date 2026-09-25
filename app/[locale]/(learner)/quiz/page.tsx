import { LearnerShell } from '@/components/shell/learner-shell';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth/session';
import { listMyAttempts } from '@/lib/db/assessment';
import { createSupabaseServerClient } from '@/lib/db/server';
import { StartQuizButton } from './start-button';

export default async function QuizHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const attempts = await listMyAttempts(await createSupabaseServerClient(), user.id, 'quiz');
  const inProgress = attempts.find((a) => a.status === 'in_progress') ?? null;
  const t = await getTranslations('quiz');
  return (
    <LearnerShell title={t('title')} step="quiz">
      <section className="grid gap-6">
        <p className="max-w-2xl text-sm text-gray-700">{t('intro')}</p>
        <StartQuizButton resume={inProgress !== null} />
        {attempts.some((a) => a.status === 'submitted') && (
          <div className="grid gap-2">
            <h2 className="font-semibold">{t('history')}</h2>
            <ul className="grid gap-1 text-sm">
              {attempts
                .filter((a) => a.status === 'submitted')
                .map((a) => (
                  <li key={a.id} data-testid={`attempt-${a.attempt_no}`}>
                    <Link href={`/quiz/${a.id}/review`} className="underline">
                      {t('attemptLine', {
                        no: a.attempt_no,
                        score: a.score ?? 0,
                        max: a.max_score ?? 0,
                      })}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>
    </LearnerShell>
  );
}

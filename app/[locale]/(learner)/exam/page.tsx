import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import { ChevronIcon } from '@/components/icons';
import { LearnerShell } from '@/components/shell/learner-shell';
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
  const submitted = attempts.filter((a) => a.status === 'submitted');
  const t = await getTranslations('exam');
  return (
    <LearnerShell title={t('title')} intro={t('intro', { count, passingMark })} step="exam">
      <div className="mx-auto grid max-w-[780px] gap-6">
        <section className="rise rounded-card bg-white px-5 py-6 shadow-raised md:px-8 md:py-7">
          <StartExamButton resume={inProgress !== null} />
        </section>
        {submitted.length > 0 && (
          <section
            className="rise overflow-hidden rounded-card bg-white shadow-raised"
            style={{ '--rise-delay': '80ms' } as CSSProperties}
          >
            <div className="border-b border-brand-100 bg-brand-50 px-5 py-3 md:px-6">
              <h2 className="font-display text-[18px] leading-[1.45] font-semibold text-brand-900 md:text-[22px]">
                {t('history')}
              </h2>
            </div>
            <ul>
              {submitted.map((a) => (
                <li
                  key={a.id}
                  data-testid={'exam-attempt-' + a.attempt_no}
                  className="border-b border-ink-100 last:border-b-0"
                >
                  <Link
                    href={'/exam/' + a.id + '/result'}
                    className="flex min-h-14 items-center justify-between gap-3 px-5 text-base font-medium text-brand-700 tabular-nums transition-colors hover:bg-brand-50 md:px-6"
                  >
                    <span>
                      {t('attemptLine', {
                        no: a.attempt_no,
                        score: a.score ?? 0,
                        max: a.max_score ?? 0,
                        result: a.result === 'pass' ? t('pass') : t('fail'),
                      })}
                    </span>
                    <span className="flex items-center gap-3">
                      <span
                        className={
                          'rounded-full px-2.5 py-px text-sm font-medium ' +
                          (a.result === 'pass'
                            ? 'bg-gold-100 text-gold-700'
                            : 'bg-warn-50 text-warn-700')
                        }
                      >
                        {a.result === 'pass' ? t('pass') : t('fail')}
                      </span>
                      <ChevronIcon className="text-ink-500" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </LearnerShell>
  );
}

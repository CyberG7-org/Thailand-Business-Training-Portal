import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import { ChevronIcon } from '@/components/icons';
import { LearnerShell } from '@/components/shell/learner-shell';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth/session';
import { getPolicy } from '@/lib/config/policy';
import { listMyAttempts } from '@/lib/db/assessment';
import { createSupabaseServerClient } from '@/lib/db/server';
import { MCQ_CONCEPTS } from '@/lib/domain/concepts/registry';
import { mcqRule } from '@/lib/domain/mcq/result';
import { StartExamButton } from './start-button';

/** How each result is worded and coloured: gold is for a pass alone. */
const RESULT_CHIP = {
  pass: 'bg-gold-100 text-gold-700',
  retest: 'bg-brand-50 text-brand-700',
  fail: 'bg-warn-50 text-warn-700',
} as const;

export default async function ExamHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const [attempts, passScore, retestScore] = await Promise.all([
    listMyAttempts(await createSupabaseServerClient(), user.id, 'exam'),
    getPolicy('mcq_pass_score'),
    getPolicy('mcq_retest_score'),
  ]);
  const rule = mcqRule(passScore, retestScore);
  const inProgress = attempts.find((a) => a.status === 'in_progress') ?? null;
  const submitted = attempts.filter((a) => a.status === 'submitted');
  const t = await getTranslations('exam');
  const resultOf = (result: string | null) =>
    result === 'pass' ? 'pass' : result === 'retest' ? 'retest' : 'fail';
  // What the quiz is, before it starts (D100): how many, how it is marked, what each result means.
  const about = [
    t('about.questions', { count: MCQ_CONCEPTS.length }),
    t('about.marking'),
    t('about.pass', { pass: rule.passScore, critical: rule.criticalKeys.length }),
    ...(rule.retestScore < rule.passScore
      ? [t('about.retest', { retest: rule.retestScore, below: rule.passScore - 1 })]
      : []),
    t('about.fail', { retest: rule.retestScore }),
  ];
  return (
    <LearnerShell title={t('title')} intro={t('intro')} step="exam">
      <div className="mx-auto grid max-w-[780px] gap-6">
        <section
          data-testid="exam-about"
          className="rise rounded-card bg-white px-5 py-6 shadow-raised md:px-8 md:py-7"
        >
          <h2 className="font-display text-[18px] leading-[1.5] font-semibold text-brand-900 md:text-[22px] md:leading-[1.45]">
            {t('about.title')}
          </h2>
          <ul className="mt-3 grid gap-2.5 text-base leading-[1.75] text-ink-900">
            {about.map((line) => (
              <li key={line} className="grid grid-cols-[20px_minmax(0,1fr)] gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-[11px] block size-1.5 justify-self-center rounded-full bg-brand-600"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <StartExamButton resume={inProgress !== null} />
          </div>
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
              {submitted.map((a) => {
                const result = resultOf(a.result);
                return (
                  <li
                    key={a.id}
                    data-testid={'exam-attempt-' + a.attempt_no}
                    data-result={result}
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
                          result: t(result),
                        })}
                      </span>
                      <span className="flex items-center gap-3">
                        <span
                          className={
                            'rounded-full px-2.5 py-px text-sm font-medium ' + RESULT_CHIP[result]
                          }
                        >
                          {t(result)}
                        </span>
                        <ChevronIcon className="text-ink-500" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </LearnerShell>
  );
}

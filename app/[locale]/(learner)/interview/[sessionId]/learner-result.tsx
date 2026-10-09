import {
  BuildingsIcon,
  CalendarBlankIcon,
  CheckCircleIcon,
  IdentificationCardIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react/dist/ssr';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { Verdict } from '@/lib/domain/interview/types';
import {
  SessionResultTranscript,
  type InterviewResultItem,
} from '@/app/[locale]/(admin)/admin/interviews/session-result-transcript';

const DATE_LOCALES: Record<AppLocale, string> = { th: 'th-TH', en: 'en-GB', zh: 'zh-CN' };

export async function LearnerResult({
  verdict,
  score,
  maximum,
  required,
  startedAt,
  company,
  learner,
  locale,
  items,
  closeReason,
}: {
  verdict: 'ready' | 'not_ready' | null;
  score: number;
  maximum: number;
  required: number | null;
  startedAt: string;
  company: string | null;
  learner: string;
  locale: AppLocale;
  items: InterviewResultItem[];
  closeReason: string | null;
}) {
  const [t, ti] = await Promise.all([
    getTranslations('admin.interviews'),
    getTranslations('interview'),
  ]);
  const ready = verdict === 'ready';
  const percentage = maximum > 0 ? Math.round((score / maximum) * 100) : 0;
  const date = new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(startedAt));

  return (
    <div className="mx-auto grid w-full max-w-[1240px] gap-5">
      <section className="overflow-hidden rounded-card bg-white shadow-raised">
        <div className="border-b border-brand-100 px-5 py-4 md:px-6">
          <h2 className="font-display text-xl font-semibold text-brand-900 md:text-2xl">
            {t('summaryTitle')}
          </h2>
          <p className="mt-1 text-sm leading-6 text-ink-500">{t('summaryIntro')}</p>
        </div>
        <div className="grid divide-y divide-brand-100 md:grid-cols-[1fr_1fr_1.25fr] md:divide-x md:divide-y-0">
          <div className="flex items-center gap-4 p-5 md:p-6">
            <div
              role="progressbar"
              aria-label={t('overallResult')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percentage}
              className="relative grid size-24 shrink-0 place-items-center text-xl font-semibold text-brand-900"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 100 100"
                className="absolute inset-0 size-full -rotate-90"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke="var(--color-brand-100)"
                  strokeWidth="9"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke="var(--color-brand-600)"
                  strokeWidth="9"
                  pathLength="100"
                  strokeDasharray={`${percentage} 100`}
                  strokeLinecap="round"
                />
              </svg>
              {maximum > 0 ? `${percentage}%` : '—'}
            </div>
            <div>
              <p className="text-xs font-medium text-ink-500">{t('overallResult')}</p>
              <p className="mt-1 font-display text-2xl font-semibold text-brand-900">
                {score} / {maximum}
              </p>
              <p className="mt-1 text-xs text-ink-500">{t('correctAnswers')}</p>
            </div>
          </div>
          <div className="flex items-center p-5 md:p-6">
            <div
              data-testid="interview-verdict"
              data-verdict={verdict ?? 'abandoned'}
              className={`flex w-full items-center gap-3 rounded-card p-4 ${ready ? 'bg-ok-50' : 'bg-warn-50'}`}
            >
              <span
                className={`grid size-12 shrink-0 place-items-center rounded-full text-white ${ready ? 'bg-ok-600' : 'bg-warn-600'}`}
              >
                {ready ? (
                  <CheckCircleIcon size={30} weight="fill" />
                ) : (
                  <WarningCircleIcon size={30} weight="fill" />
                )}
              </span>
              <div>
                <p className="text-xs font-medium text-ink-500">{t('readinessStatus')}</p>
                <p
                  data-testid="interview-outcome"
                  data-outcome={ready ? 'can_open' : 'cannot_open'}
                  className="mt-1 font-semibold text-brand-900"
                >
                  {verdict ? t(`verdicts.${verdict}`) : t('noVerdict')}
                </p>
                {required !== null && (
                  <p className="mt-1 text-xs text-ink-500">
                    {ti(ready ? 'outcome.scoreReady' : 'outcome.scorePractice', {
                      score,
                      maximum,
                      required,
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
          <dl className="grid content-center gap-3 p-5 text-sm md:p-6">
            <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5">
              <CalendarBlankIcon size={21} className="text-brand-700" />
              <div>
                <dt className="text-xs text-ink-500">{t('interviewDate')}</dt>
                <dd className="font-medium text-brand-900">{date}</dd>
              </div>
            </div>
            <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5">
              <BuildingsIcon size={21} className="text-brand-700" />
              <div>
                <dt className="text-xs text-ink-500">{t('company')}</dt>
                <dd className="font-medium text-brand-900">{company ?? '—'}</dd>
              </div>
            </div>
            <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5">
              <IdentificationCardIcon size={21} className="text-brand-700" />
              <div>
                <dt className="text-xs text-ink-500">{t('learnerId')}</dt>
                <dd className="font-medium text-brand-900">{learner}</dd>
              </div>
            </div>
          </dl>
        </div>
        {closeReason && closeReason !== 'plan_complete' && (
          <p
            data-testid="close-reason"
            className="border-t border-brand-100 px-5 py-3 text-sm text-ink-700 md:px-6"
          >
            {ti(`closeReason.${closeReason}` as never)}
          </p>
        )}
      </section>
      <SessionResultTranscript
        items={items}
        labels={{
          title: t('transcriptTitle'),
          intro: t('transcriptIntro'),
          explanation: t('explanation'),
          expected: t('expectedAnswer'),
          unanswered: t('unanswered'),
          verdicts: Object.fromEntries(
            (['correct', 'partial', 'wrong', 'evasive', 'pasted', 'off_topic'] as Verdict[]).map(
              (v) => [v, t(`assessment.${v}`)],
            ),
          ) as Record<Verdict, string>,
        }}
      />
      <div className="flex flex-wrap gap-3">
        {!ready && (
          <Link
            href="/interview"
            className="inline-flex min-h-12 items-center rounded-control bg-brand-600 px-6 font-semibold text-white"
          >
            {ti('debrief.tryAgain')}
          </Link>
        )}
        <Link
          href="/dashboard"
          className="inline-flex min-h-12 items-center rounded-control border border-ink-300 px-5 font-medium text-brand-700"
        >
          {ti('debrief.toDashboard')}
        </Link>
      </div>
    </div>
  );
}

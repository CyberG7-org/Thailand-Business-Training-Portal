import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import { ChevronIcon } from '@/components/icons';
import { LearnerShell } from '@/components/shell/learner-shell';
import { cachedStageStatuses } from '@/components/shell/stage-status';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { listMyInterviews } from '@/lib/db/interviews';
import { createSupabaseServerClient } from '@/lib/db/server';
import { resolveInterviewProvider } from '@/lib/integrations/interview';
import { StartInterviewButton } from './start-button';

const DATE_LOCALES: Record<AppLocale, string> = { th: 'th-TH', en: 'en-GB', zh: 'zh-CN' };
const TAG = {
  ready: 'bg-gold-100 text-gold-700',
  not_ready: 'bg-warn-50 text-warn-700',
  abandoned: 'bg-ink-100 text-ink-700',
} as const;

/**
 * The interview's front door (spec §9): what the officer will ask, the primary start (or
 * resume) button, and past sessions as rows with their verdict leading to their debrief.
 */
export default async function InterviewHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const [db, t, ts, stages] = await Promise.all([
    createSupabaseServerClient(),
    getTranslations('interview'),
    getTranslations('stages'),
    cachedStageStatuses(user.id),
  ]);
  const gate = stages.interview;
  const open = ['available', 'in_progress', 'done'].includes(gate.status);
  const configured = resolveInterviewProvider() !== 'off';
  const sessions = open ? await listMyInterviews(db, user.id) : [];
  const resume = sessions.some((s) => s.status === 'in_progress');
  const history = sessions.filter((s) => s.status !== 'in_progress');
  const dates = new Intl.DateTimeFormat(DATE_LOCALES[locale as AppLocale], {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  });

  return (
    <LearnerShell title={t('title')} intro={t('intro')} step="interview">
      <div className="mx-auto grid max-w-[780px] gap-6">
        <section className="rise rounded-card bg-white px-5 py-6 shadow-raised md:px-8 md:py-7">
          <p className="mb-4 rounded-control bg-brand-50 px-3.5 py-2.5 text-sm font-medium text-brand-700">
            {t('thaiOnly')}
          </p>
          {!open && (
            <p
              data-testid="interview-blocked"
              className="rounded-control bg-warn-50 px-3.5 py-2.5 text-sm font-medium text-warn-700"
            >
              {gate.reason ? ts(`reasons.${gate.reason}`) : ts(`status.${gate.status}`)}
            </p>
          )}
          {open && !configured && (
            <p
              data-testid="interview-blocked"
              className="rounded-control bg-ink-50 px-3.5 py-2.5 text-sm text-ink-700"
            >
              {t('errors.not_configured')}
            </p>
          )}
          {open && configured && <StartInterviewButton resume={resume} />}
        </section>
        {history.length > 0 && (
          <section
            data-testid="interview-history"
            className="rise overflow-hidden rounded-card bg-white shadow-raised"
            style={{ '--rise-delay': '80ms' } as CSSProperties}
          >
            <div className="border-b border-brand-100 bg-brand-50 px-5 py-3 md:px-6">
              <h2 className="font-display text-[18px] leading-[1.45] font-semibold text-brand-900 md:text-[22px]">
                {t('history')}
              </h2>
            </div>
            <ul>
              {history.map((s) => {
                const tag =
                  s.verdict === 'ready' || s.verdict === 'not_ready' ? s.verdict : 'abandoned';
                return (
                  <li
                    key={s.id}
                    data-testid={'interview-session-' + s.id}
                    data-verdict={tag}
                    className="border-b border-ink-100 last:border-b-0"
                  >
                    <Link
                      href={'/interview/' + s.id}
                      className="flex min-h-14 items-center justify-between gap-3 px-5 text-base font-medium text-brand-700 tabular-nums transition-colors hover:bg-brand-50 md:px-6"
                    >
                      <span>{dates.format(new Date(s.started_at))}</span>
                      <span className="flex items-center gap-3">
                        <span
                          className={
                            'rounded-full px-2.5 py-px text-xs leading-[1.7] font-semibold ' +
                            TAG[tag]
                          }
                        >
                          {t(`verdict.${tag}`)}
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

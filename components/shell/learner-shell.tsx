import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/auth/session';
import type { StageKey } from '@/lib/domain/progression';
import { BackPill } from './back-pill';
import { ShellHeader } from './shell-header';
import { cachedStageStatuses } from './stage-status';
import { StepSegments } from './step-segments';

/**
 * The shared learner shell (design handoff, "Shared shell"): a navy band holding the glass
 * header, the back pill, the step segments and the page title, with the page's content on the
 * dot grid below. A page passes only what differs; the user and the stage statuses are read once
 * per request.
 */
export async function LearnerShell({
  title,
  titleTestId,
  intro,
  step,
  home = false,
  children,
}: {
  title: ReactNode;
  /** Kept for the tests that read the page title by id. */
  titleTestId?: string;
  intro?: ReactNode;
  /** The stage this page belongs to; sets the segments. Absent on the dashboard. */
  step?: StageKey;
  /** The dashboard: no back pill and no segments. */
  home?: boolean;
  children: ReactNode;
}) {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations('app')]);
  const statuses = step && user ? await cachedStageStatuses(user.id) : null;
  return (
    <>
      <div className="band rounded-b-[28px] px-4 pt-4 pb-8 md:rounded-b-[36px] md:px-6 md:pb-10">
        <ShellHeader user={user} />
        {!home && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <BackPill home="/dashboard" label={t('back')} />
            {step && <StepSegments current={step} statuses={statuses} />}
          </div>
        )}
        <h1
          data-testid={titleTestId}
          className="mt-6 font-display text-[26px] leading-[1.35] font-medium text-white md:text-[32px]"
        >
          {title}
        </h1>
        {intro && (
          <p className="mt-2 max-w-[680px] text-base leading-[1.75] text-brand-100">{intro}</p>
        )}
      </div>
      <main className="px-4 py-6 md:px-12 md:py-7">{children}</main>
    </>
  );
}

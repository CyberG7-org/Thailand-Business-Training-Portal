import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/auth/session';
import type { StageKey } from '@/lib/domain/progression';
import { BackPill } from './back-pill';
import { LearnerNav } from './learner-nav';
import { isPrimaryStage, LearnerStageTabs } from './learner-stage-tabs';
import { ShellHeader } from './shell-header';
import { cachedStageStatuses } from './stage-status';
import { StepSegments } from './step-segments';

/**
 * The shared learner shell (design handoff, "Shared shell"): a navy band holding the glass
 * header, the back pill, the step segments and the page title, with the page's content on the
 * dot grid below. A page passes only what differs; the user and the stage statuses are read once
 * per request. The dashboard swaps the title for its hero and adds the stepper to the band; a
 * card page points the back pill at its list and shows its place there instead of the steps.
 * The four primary learner stages share the same compact navigation at every breakpoint. Legacy
 * learner routes retain the sidebar until they are folded into the primary journey.
 */
export async function LearnerShell({
  title,
  titleTestId,
  intro,
  step,
  home = false,
  back,
  subBarRight,
  hero,
  bandFooter,
  tone = 'blue',
  hideBack = false,
  hideSubBar = false,
  stageNavigation = 'automatic',
  headerVariant = 'default',
  mainClassName = '',
  children,
}: {
  /** The page title in the band; the dashboard passes `hero` instead. */
  title?: ReactNode;
  /** Kept for the tests that read the page title by id. */
  titleTestId?: string;
  intro?: ReactNode;
  /** The stage this page belongs to; sets the segments. Absent on the dashboard. */
  step?: StageKey;
  /** The dashboard: no back pill and no segments. */
  home?: boolean;
  /** A fixed destination for the back pill; otherwise it steps back through the history. */
  back?: { href: string; label: string };
  /** Replaces the step segments on the right of the sub-bar. */
  subBarRight?: ReactNode;
  /** Replaces the title block; must carry the page's h1. */
  hero?: ReactNode;
  /** Rendered at the foot of the band, still on navy (the dashboard's stepper). */
  bandFooter?: ReactNode;
  /** The band's colour: gold for an earned moment (a passed exam). */
  tone?: 'blue' | 'gold';
  /** Remove the history control while retaining progress on the right. */
  hideBack?: boolean;
  /** Remove the entire row between the header and title. */
  hideSubBar?: boolean;
  /** Study's overview places its completion summary before the shared navigation. */
  stageNavigation?: 'automatic' | 'page';
  headerVariant?: 'default' | 'study';
  mainClassName?: string;
  children: ReactNode;
}) {
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations('app')]);
  const statuses = !home && user ? await cachedStageStatuses(user.id) : null;
  const usesPrimaryLayout = isPrimaryStage(step);
  const showsAutomaticStageTabs =
    usesPrimaryLayout && statuses !== null && stageNavigation === 'automatic';
  return (
    <>
      <div
        className={
          'band px-4 pt-4 md:rounded-b-[36px] md:px-6 md:pb-10 ' +
          (home ? 'dashboard-home-band rounded-b-[24px] pb-4' : 'rounded-b-[28px] pb-8') +
          (tone === 'gold' ? ' band-gold' : '')
        }
      >
        <ShellHeader user={user} compact={home} variant={headerVariant} />
        {!home && !hideSubBar && (
          <div
            className={`mt-8 flex flex-wrap items-center gap-4 ${hideBack ? 'justify-end' : 'justify-between'}`}
          >
            {!hideBack && (
              <BackPill home="/dashboard" label={back?.label ?? t('back')} href={back?.href} />
            )}
            {subBarRight ?? (step && <StepSegments current={step} statuses={statuses} />)}
          </div>
        )}
        {hero ?? (
          <>
            <h1
              data-testid={titleTestId}
              className="mt-6 font-display text-[26px] leading-[1.35] font-medium text-white md:text-[32px]"
            >
              {title}
            </h1>
            {intro && (
              <p className="mt-2 max-w-[680px] text-base leading-[1.75] text-brand-100">{intro}</p>
            )}
          </>
        )}
        {bandFooter}
      </div>
      <main
        className={`${home ? 'px-3 py-4 md:px-12 md:py-7' : 'px-4 py-6 md:px-12 md:py-7'} ${mainClassName}`}
      >
        {home ? (
          children
        ) : usesPrimaryLayout ? (
          <div className="mx-auto grid w-full max-w-[1240px] gap-6">
            {showsAutomaticStageTabs && <LearnerStageTabs current={step} statuses={statuses} />}
            <div className="min-w-0">{children}</div>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-6">
            <LearnerNav current={step} statuses={statuses} />
            <div className="min-w-0">{children}</div>
          </div>
        )}
      </main>
    </>
  );
}

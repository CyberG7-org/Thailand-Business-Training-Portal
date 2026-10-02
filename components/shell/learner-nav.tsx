import { getTranslations } from 'next-intl/server';
import { StageCircle } from '@/app/[locale]/(learner)/dashboard/stage-marks';
import { STAGE_ROUTES } from '@/app/[locale]/(learner)/dashboard/stage-row';
import { HomeIcon } from '@/components/icons';
import { Link } from '@/i18n/navigation';
import type { StageInfo, StageKey } from '@/lib/domain/progression';
import { LEARNER_STAGES } from '@/lib/domain/stage-progress';

const ROW =
  'flex min-h-11 items-center gap-3 rounded-control px-3 py-1.5 text-sm whitespace-nowrap lg:py-2 lg:whitespace-normal';
const HERE = 'bg-brand-50 text-brand-700 shadow-[inset_4px_0_0_var(--color-brand-700)]';

/**
 * The learner's steps beside every page (the owner, 2026-10-02, "like the manager's sidebar"):
 * home, then the five steps with where each stands, the page's own step marked. A step that is
 * not open yet is shown but not a link. On a phone it becomes one scrolling strip, as the staff
 * sidebar does.
 */
export async function LearnerNav({
  current,
  statuses,
}: {
  /** The step this page belongs to; the practice round belongs to none. */
  current?: StageKey;
  statuses: Record<StageKey, StageInfo> | null;
}) {
  const [t, ts, td] = await Promise.all([
    getTranslations('app'),
    getTranslations('stages'),
    getTranslations('dashboard'),
  ]);
  return (
    <nav
      data-testid="learner-nav"
      aria-label={td('steps.title')}
      className="min-w-0 rounded-card bg-white p-2 shadow-raised lg:sticky lg:top-6 lg:self-start lg:p-3"
    >
      <p className="hidden px-3 pb-2 text-sm font-semibold text-ink-500 lg:block">
        {td('steps.title')}
      </p>
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        <li className="shrink-0">
          <Link
            href="/dashboard"
            data-testid="learner-nav-home"
            className={`${ROW} font-medium text-ink-900 transition-colors hover:bg-ink-50`}
          >
            <span className="grid size-8 shrink-0 place-items-center text-brand-700">
              <HomeIcon />
            </span>
            {t('home')}
          </Link>
        </li>
        {LEARNER_STAGES.map((key, i) => {
          const info = statuses?.[key] ?? { status: 'available' };
          const locked = info.status === 'locked' || info.status === 'pending';
          const href = locked ? null : (STAGE_ROUTES[key] ?? null);
          const here = key === current;
          const body = (
            <>
              <StageCircle index={i} status={info.status} current={false} className="size-8" />
              <span className="min-w-0">
                <span className="block leading-[1.5] font-semibold lg:hidden">
                  {ts(`short.${key}`)}
                </span>
                <span className="hidden leading-[1.5] font-semibold lg:block">
                  {ts(`titles.${key}`)}
                </span>
                <span className="hidden leading-[1.6] text-ink-500 lg:block">
                  {ts(`status.${info.status}`)}
                </span>
              </span>
            </>
          );
          return (
            <li key={key} className="shrink-0" data-testid={`learner-nav-${key}`}>
              {href ? (
                <Link
                  href={href}
                  aria-current={here ? 'page' : undefined}
                  data-status={info.status}
                  className={`${ROW} ${here ? HERE : 'text-ink-900 transition-colors hover:bg-ink-50'}`}
                >
                  {body}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  data-status={info.status}
                  className={`${ROW} ${here ? HERE : 'text-ink-700'}`}
                >
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

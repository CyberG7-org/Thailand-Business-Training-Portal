import {
  BankIcon,
  BookOpenTextIcon,
  ExamIcon,
  HouseIcon,
  IdentificationCardIcon,
} from '@phosphor-icons/react/dist/ssr';
import { getTranslations } from 'next-intl/server';
import { STAGE_ROUTES } from '@/app/[locale]/(learner)/dashboard/stage-row';
import { Link } from '@/i18n/navigation';
import type { StageInfo, StageKey } from '@/lib/domain/progression';

export const PRIMARY_STAGES = ['study', 'exam', 'interview', 'nameCard'] as const;
export type PrimaryStage = (typeof PRIMARY_STAGES)[number];
type Tab = 'home' | PrimaryStage;

export function isPrimaryStage(stage: StageKey | undefined): stage is PrimaryStage {
  return stage !== undefined && PRIMARY_STAGES.includes(stage as PrimaryStage);
}

function StageIcon({ stage }: { stage: Tab }) {
  const className = 'hidden size-5 shrink-0 sm:block';
  if (stage === 'home') return <HouseIcon className={className} weight="duotone" />;
  if (stage === 'study') return <BookOpenTextIcon className={className} weight="duotone" />;
  if (stage === 'exam') return <ExamIcon className={className} weight="duotone" />;
  if (stage === 'nameCard')
    return <IdentificationCardIcon className={className} weight="duotone" />;
  return <BankIcon className={className} weight="duotone" />;
}

/** All learner destinations stay in the same order on every primary page. */
export async function LearnerStageTabs({
  current,
  statuses,
}: {
  current: Tab;
  statuses: Record<StageKey, StageInfo>;
}) {
  const t = await getTranslations('study.tabs');
  const tabs: Tab[] = ['home', ...PRIMARY_STAGES];
  return (
    <nav
      aria-label={t('label')}
      data-testid="learner-stage-tabs"
      className="grid grid-cols-5 overflow-hidden rounded-sheet bg-white p-1.5 shadow-raised md:p-2"
    >
      {tabs.map((stage, index) => {
        const info = stage === 'home' ? null : statuses[stage];
        const locked = info ? info.status === 'locked' || info.status === 'pending' : false;
        const active = stage === current;
        const href =
          active || locked ? null : stage === 'home' ? '/dashboard' : STAGE_ROUTES[stage];
        const content = (
          <>
            <StageIcon stage={stage} />
            <span className="whitespace-nowrap">{t(stage)}</span>
          </>
        );
        const className = `relative flex min-h-14 min-w-0 items-center justify-center gap-1 rounded-control px-0.5 text-center text-[10px] leading-tight font-semibold sm:text-sm md:min-h-16 md:gap-2 md:px-3 md:text-base ${
          active
            ? 'bg-brand-50 text-brand-900 shadow-[inset_0_-3px_0_var(--color-brand-700)]'
            : locked
              ? 'text-ink-500'
              : 'text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600'
        } ${index > 0 ? 'before:absolute before:top-3 before:bottom-3 before:left-0 before:w-px before:bg-brand-100' : ''}`;
        return href ? (
          <Link
            key={stage}
            href={href}
            data-testid={`learner-stage-tab-${stage}`}
            className={className}
          >
            {content}
          </Link>
        ) : (
          <span
            key={stage}
            aria-current={active ? 'page' : undefined}
            aria-disabled={locked && !active ? 'true' : undefined}
            data-testid={`learner-stage-tab-${stage}`}
            className={className}
          >
            {content}
          </span>
        );
      })}
    </nav>
  );
}

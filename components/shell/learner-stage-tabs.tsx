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
  const className = 'size-5 shrink-0';
  if (stage === 'home') return <HouseIcon className={className} weight="duotone" />;
  if (stage === 'study') return <BookOpenTextIcon className={className} weight="duotone" />;
  if (stage === 'exam') return <ExamIcon className={className} weight="duotone" />;
  if (stage === 'nameCard')
    return <IdentificationCardIcon className={className} weight="duotone" />;
  return <BankIcon className={className} weight="duotone" />;
}

/** The four learner destinations shown on every primary-stage page at every breakpoint. */
export async function LearnerStageTabs({
  current,
  statuses,
}: {
  current: PrimaryStage;
  statuses: Record<StageKey, StageInfo>;
}) {
  const t = await getTranslations('study.tabs');
  const tabs: Tab[] = ['home', ...PRIMARY_STAGES.filter((stage) => stage !== current)];
  return (
    <nav
      aria-label={t('label')}
      data-testid="learner-stage-tabs"
      className="grid grid-cols-4 overflow-hidden rounded-sheet bg-white p-1.5 shadow-raised md:p-2"
    >
      {tabs.map((stage, index) => {
        const info = stage === 'home' ? null : statuses[stage];
        const locked = info ? info.status === 'locked' || info.status === 'pending' : false;
        const href = stage === 'home' ? '/dashboard' : locked ? null : STAGE_ROUTES[stage];
        const content = (
          <>
            <StageIcon stage={stage} />
            <span className="whitespace-nowrap">{t(stage)}</span>
          </>
        );
        const className = `relative flex min-h-14 min-w-0 items-center justify-center gap-1 px-0.5 text-[11px] leading-tight font-semibold sm:text-sm md:min-h-16 md:gap-2 md:px-4 md:text-base ${
          locked
            ? 'text-ink-500'
            : 'text-brand-700 transition-colors hover:rounded-[14px] hover:bg-brand-50 focus-visible:rounded-[14px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600'
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
            aria-disabled="true"
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

import {
  BankIcon,
  BookOpenTextIcon,
  ExamIcon,
  IdentificationCardIcon,
} from '@phosphor-icons/react/dist/ssr';
import { getTranslations } from 'next-intl/server';
import { STAGE_ROUTES } from '@/app/[locale]/(learner)/dashboard/stage-row';
import { Link } from '@/i18n/navigation';
import type { StageInfo, StageKey } from '@/lib/domain/progression';

const TABS = ['study', 'exam', 'interview', 'nameCard'] as const satisfies readonly StageKey[];

function StageIcon({ stage }: { stage: (typeof TABS)[number] }) {
  const className = 'size-5 shrink-0';
  if (stage === 'study') return <BookOpenTextIcon className={className} weight="duotone" />;
  if (stage === 'exam') return <ExamIcon className={className} weight="duotone" />;
  if (stage === 'nameCard')
    return <IdentificationCardIcon className={className} weight="duotone" />;
  return <BankIcon className={className} weight="duotone" />;
}

/** Four phone-sized destinations from the selected study-page design; no horizontal scrolling. */
export async function LearnerStageTabs({
  current,
  statuses,
}: {
  current: (typeof TABS)[number];
  statuses: Record<StageKey, StageInfo>;
}) {
  const t = await getTranslations('study.tabs');
  return (
    <nav
      aria-label={t('label')}
      data-testid="learner-stage-tabs"
      className="grid grid-cols-4 overflow-hidden rounded-sheet bg-white p-1.5 shadow-raised lg:hidden"
    >
      {TABS.map((stage, index) => {
        const active = current === stage;
        const info = statuses[stage];
        const locked = info.status === 'locked' || info.status === 'pending';
        const href = locked ? null : STAGE_ROUTES[stage];
        const content = (
          <>
            <StageIcon stage={stage} />
            <span className="whitespace-nowrap">{t(stage)}</span>
          </>
        );
        const className = `relative flex min-h-14 min-w-0 items-center justify-center gap-1 px-0.5 text-[11px] leading-tight font-semibold sm:text-sm ${
          active
            ? 'rounded-[14px] bg-brand-50 text-brand-700 shadow-[inset_0_-3px_0_var(--color-brand-700)]'
            : locked
              ? 'text-ink-500'
              : 'text-brand-700 transition-colors hover:bg-brand-50'
        } ${index > 0 && !active ? 'before:absolute before:top-3 before:bottom-3 before:left-0 before:w-px before:bg-brand-100' : ''}`;
        return href ? (
          <Link
            key={stage}
            href={href}
            aria-current={active ? 'page' : undefined}
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

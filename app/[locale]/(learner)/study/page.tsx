import type { CSSProperties } from 'react';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/ssr';
import { getTranslations } from 'next-intl/server';
import { LearnerShell } from '@/components/shell/learner-shell';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { getPolicy } from '@/lib/config/policy';
import { BANK_INTERVIEW_CARDS } from '@/lib/content/bank-interview-cards';
import { studyPreview } from '@/lib/content/study-preview';
import { toTemplateRecord } from '@/lib/db/assessment';
import { createSupabaseAdminClient } from '@/lib/db/admin';
import { getActiveAssignmentForUser } from '@/lib/db/assignments';
import { cachedFactTranslationsFor } from '@/lib/db/fact-translations';
import { pinnedFactsFor } from '@/lib/db/pinning';
import { createSupabaseServerClient } from '@/lib/db/server';
import { getMyStudyProgress, listStudyMaterials, pickLocalization } from '@/lib/db/study';
import { renderTemplateLenient } from '@/lib/domain/assessment/template';
import { translatedRecord } from '@/lib/domain/facts/localization';
import { studyDisplayRecord } from '@/lib/domain/facts/study-display';
import { templateRecordFromSnapshot } from '@/lib/domain/facts/snapshot';
import { isCardDone } from '@/lib/domain/study-progress';
import { pageTitle } from '@/i18n/page-title';

export const generateMetadata = pageTitle('stages.titles', 'study');

type State = 'new' | 'viewed' | 'completed';

const TAG: Record<State, string> = {
  completed: 'bg-ok-50 text-ok-600',
  viewed: 'bg-brand-100 text-brand-700',
  new: 'bg-ink-100 text-ink-700',
};
const SEGMENT = { done: 'bg-gold-500', viewed: 'bg-brand-600', new: 'bg-ink-100' } as const;

const rise = (delay: string) => ({ '--rise-delay': delay }) as CSSProperties;

/**
 * The study list (design handoff, 01): numbered rows with the card's state, the first card not
 * yet done marked "continue here", and a side card with the count done, one segment per card and
 * the way to the next card. What counts as done follows the completion-tracking policy: a viewed
 * card under "viewed", an explicitly completed one under "completed".
 */
export default async function StudyListPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const user = await requireUser(locale);
  const db = await createSupabaseServerClient();
  const [materials, progress, tracking, t, assignment] = await Promise.all([
    listStudyMaterials(db),
    getMyStudyProgress(db, user.id),
    getPolicy('study_completion_tracking'),
    getTranslations('study'),
    getActiveAssignmentForUser(db, user.id),
  ]);
  const loc = locale as AppLocale;
  const language = loc;
  const admin = assignment ? createSupabaseAdminClient() : null;
  const pinned = assignment && admin ? await pinnedFactsFor(admin, assignment) : null;
  const templateRecord = pinned
    ? templateRecordFromSnapshot(pinned.snapshot, pinned.role)
    : assignment
      ? toTemplateRecord(assignment.dbd_records, assignment)
      : null;
  const translations =
    pinned && templateRecord && admin
      ? await cachedFactTranslationsFor(admin, pinned.version.id, templateRecord, language)
      : {};
  const shownRecord = templateRecord
    ? studyDisplayRecord(translatedRecord(templateRecord, translations), language)
    : null;
  const progressById = new Map(progress.map((p) => [p.material_id, p]));

  const rows = materials.map((m, i) => {
    const localization = pickLocalization(m, loc);
    const p = progressById.get(m.id);
    const state: State = p?.completed_at ? 'completed' : p ? 'viewed' : 'new';
    const starterCard = BANK_INTERVIEW_CARDS.find((card) => card.contentKey === m.content_key)
      ?.localizations[language];
    const preview =
      localization && m.type === 'card'
        ? studyPreview(
            renderTemplateLenient(
              starterCard?.body ?? localization.body ?? '',
              shownRecord,
              language,
            ),
          )
        : null;
    return {
      key: m.content_key,
      index: i + 1,
      title: localization ? (starterCard?.title ?? localization.title) : null,
      description: localization && m.type === 'pdf' ? 'PDF' : null,
      preview,
      href: localization ? `/study/${m.content_key}` : null,
      state,
      // The same rule the steps use to call study Done.
      done: isCardDone(p, tracking),
    };
  });
  const total = rows.length;
  const done = rows.filter((r) => r.done).length;
  const next = rows.find((r) => !r.done && r.href) ?? null;

  return (
    <LearnerShell
      title={t('title')}
      intro={total > 0 ? t('intro', { count: total }) : undefined}
      step="study"
      hideSubBar
      mainClassName="bg-gradient-to-b from-brand-50 to-white"
    >
      <div className="relative z-10 -mt-14 grid gap-5 lg:mt-0">
        <aside
          data-testid="study-summary"
          className="rise rounded-sheet bg-white px-5 py-5 shadow-raised md:px-8 md:py-6"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="font-display text-[19px] leading-tight font-semibold whitespace-nowrap text-brand-900 md:text-xl">
                {t('completed')}
              </div>
              <div className="mt-1 font-display text-[52px] leading-none font-semibold text-brand-900 tabular-nums md:text-[58px]">
                {done}/{total}
              </div>
              <span className="sr-only">{t('summary.ofTotal', { done, total })}</span>
            </div>
            <div
              className={`flex min-h-14 max-w-[190px] items-center gap-2 rounded-card px-3 text-xs leading-snug font-semibold md:max-w-none md:px-6 md:text-base ${
                total > 0 && done === total ? 'bg-ok-50 text-ok-600' : 'bg-brand-50 text-brand-700'
              }`}
            >
              {total > 0 && done === total ? (
                <CheckCircleIcon className="size-7 shrink-0" weight="fill" />
              ) : (
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-600 text-sm text-white tabular-nums">
                  {Math.max(total - done, 0)}
                </span>
              )}
              <span>
                {total > 0 && done === total
                  ? t('summary.ready')
                  : t('summary.remaining', { count: Math.max(total - done, 0) })}
              </span>
            </div>
          </div>
          <div data-testid="study-segments" aria-hidden="true" className="mt-5 flex gap-1.5">
            {rows.map((row) => {
              const state = row.done ? 'done' : row.state === 'viewed' ? 'viewed' : 'new';
              return (
                <span
                  key={row.key}
                  data-state={state}
                  className={`h-2 min-w-1 flex-1 rounded-full ${SEGMENT[state]}`}
                />
              );
            })}
          </div>
        </aside>

        <section className="rise grid gap-3" style={rise('80ms')}>
          {total === 0 && <p className="px-6 py-5 text-sm text-ink-700">{t('empty')}</p>}
          <ol className="grid gap-3">
            {rows.map((row) => {
              const current = row === next;
              const displayState: State = row.done ? 'completed' : row.state;
              return (
                <li key={row.key}>
                  {row.href ? (
                    <Link
                      href={row.href}
                      data-testid={`study-item-${row.key}`}
                      data-study-item={row.key}
                      data-current={current || undefined}
                      className={`grid min-h-[104px] grid-cols-[58px_minmax(0,1fr)_auto] items-start gap-3 rounded-sheet bg-white px-4 py-4 shadow-glass transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:bg-brand-50 hover:shadow-raised focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 active:translate-y-0 md:min-h-[112px] md:grid-cols-[70px_minmax(0,1fr)_auto] md:gap-5 md:px-6 ${current ? 'ring-2 ring-brand-100' : ''}`}
                    >
                      <span
                        className={`grid size-14 place-items-center rounded-full bg-gold-100 font-display text-xl font-semibold tabular-nums md:size-16 md:text-2xl ${row.done ? 'text-gold-700' : current ? 'text-brand-900' : 'text-ink-500'}`}
                      >
                        {row.index}/{total}
                      </span>
                      <div className="min-w-0">
                        <div
                          data-testid={`study-overview-title-${row.key}`}
                          className="text-base leading-[1.45] font-semibold text-brand-900"
                        >
                          {row.title}
                        </div>
                        {row.preview?.introduction && (
                          <p className="mt-2 line-clamp-2 text-sm leading-[1.5] text-ink-700">
                            {row.preview.introduction}
                          </p>
                        )}
                        {row.preview && row.preview.facts.length > 0 && (
                          <dl className="mt-3 grid gap-2 border-t border-ink-100 pt-3 text-sm leading-[1.45]">
                            {row.preview.facts.map((fact) => (
                              <div
                                key={fact.label}
                                className="grid min-w-0 gap-0.5 sm:grid-cols-[minmax(0,150px)_minmax(0,1fr)] sm:gap-3"
                              >
                                <dt className="font-medium text-ink-500">{fact.label}</dt>
                                <dd className="line-clamp-2 min-w-0 text-ink-900">{fact.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {row.description && (
                          <div className="mt-1 line-clamp-2 text-sm leading-[1.45] text-ink-500">
                            {row.description}
                          </div>
                        )}
                      </div>
                      <span
                        data-testid={`study-state-${row.key}`}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-[1.5] font-semibold whitespace-nowrap md:text-sm ${TAG[displayState]}`}
                      >
                        {row.done && <CheckCircleIcon className="size-4" weight="fill" />}
                        {t(`state.${displayState}`)}
                      </span>
                    </Link>
                  ) : (
                    <div
                      data-testid={`study-item-${row.key}`}
                      className="grid min-h-[104px] grid-cols-[58px_minmax(0,1fr)] items-center gap-3 rounded-sheet bg-white px-4 py-4 shadow-glass md:min-h-[112px] md:grid-cols-[70px_minmax(0,1fr)] md:gap-5 md:px-6"
                    >
                      <span className="grid size-14 place-items-center rounded-full bg-gold-100 font-display text-xl font-semibold text-ink-500 tabular-nums md:size-16 md:text-2xl">
                        {row.index}/{total}
                      </span>
                      <div className="text-base leading-[1.45] font-semibold text-ink-500">
                        {t('notAvailable')}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </LearnerShell>
  );
}

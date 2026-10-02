import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import { ChevronIcon } from '@/components/icons';
import { LearnerShell } from '@/components/shell/learner-shell';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { getPolicy } from '@/lib/config/policy';
import { createSupabaseServerClient } from '@/lib/db/server';
import { getMyStudyProgress, listStudyMaterials, pickLocalization } from '@/lib/db/study';
import { isCardDone } from '@/lib/domain/study-progress';

type State = 'new' | 'viewed' | 'completed';

const TAG: Record<State, string> = {
  completed: 'bg-gold-100 text-gold-700',
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
  const [materials, progress, tracking, t] = await Promise.all([
    listStudyMaterials(db),
    getMyStudyProgress(db, user.id),
    getPolicy('study_completion_tracking'),
    getTranslations('study'),
  ]);
  const progressById = new Map(progress.map((p) => [p.material_id, p]));

  const rows = materials.map((m, i) => {
    const loc = pickLocalization(m, locale as AppLocale);
    const p = progressById.get(m.id);
    const state: State = p?.completed_at ? 'completed' : p ? 'viewed' : 'new';
    return {
      key: m.content_key,
      index: i + 1,
      title: loc?.title ?? null,
      href: loc ? `/study/${m.content_key}` : null,
      type: m.type === 'pdf' ? 'PDF' : t('card'),
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
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <section className="rise overflow-hidden rounded-card bg-white shadow-raised">
          {total === 0 && <p className="px-6 py-5 text-sm text-ink-700">{t('empty')}</p>}
          <ol>
            {rows.map((row) => {
              const current = row === next;
              return (
                <li
                  key={row.key}
                  data-testid={`study-item-${row.key}`}
                  data-current={current || undefined}
                  className={`relative grid min-h-[72px] grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-b border-ink-100 px-4 py-3 last:border-b-0 focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-brand-600 md:min-h-20 md:grid-cols-[48px_minmax(0,1fr)_auto_20px] md:gap-4 md:px-6 ${
                    current
                      ? 'bg-gradient-to-r from-brand-100 to-brand-50 shadow-[inset_4px_0_0_var(--color-brand-700)]'
                      : 'transition-colors hover:bg-brand-50'
                  }`}
                >
                  <span
                    className={`font-display text-xl font-semibold tabular-nums ${
                      row.done ? 'text-gold-700' : current ? 'text-brand-900' : 'text-ink-500'
                    }`}
                  >
                    {row.index}/{total}
                  </span>
                  <div className="min-w-0">
                    {row.href ? (
                      <Link
                        href={row.href}
                        className={`text-base leading-[1.5] font-semibold outline-none after:absolute after:inset-0 after:content-[''] ${
                          current ? 'text-brand-900' : 'text-ink-900'
                        }`}
                      >
                        {row.title}
                      </Link>
                    ) : (
                      <span className="text-base leading-[1.5] font-semibold text-ink-500">
                        {t('notAvailable')}
                      </span>
                    )}
                    <div
                      className={`text-sm leading-[1.7] ${current ? 'text-ink-700' : 'text-ink-500'}`}
                    >
                      {row.type}
                      {current && ` · ${t('continueHere')}`}
                    </div>
                  </div>
                  <span
                    data-testid={`study-state-${row.key}`}
                    className={`inline-flex rounded-full px-2.5 py-px text-sm leading-[1.6] font-medium whitespace-nowrap ${
                      current && row.state === 'viewed' ? 'bg-white text-brand-700' : TAG[row.state]
                    }`}
                  >
                    {t(`state.${row.state}`)}
                  </span>
                  <ChevronIcon
                    className={`hidden md:block ${current ? 'text-brand-700' : 'text-ink-500'}`}
                  />
                </li>
              );
            })}
          </ol>
        </section>

        <aside
          data-testid="study-summary"
          className="rise flex flex-col gap-3.5 rounded-card bg-white px-6 py-5 shadow-raised"
          style={rise('80ms')}
        >
          <div className="text-sm leading-[1.7] text-ink-700">{t('completed')}</div>
          <div className="font-display text-[28px] leading-[1.4] font-semibold text-brand-900 tabular-nums">
            {t('summary.ofTotal', { done, total })}
          </div>
          <div data-testid="study-segments" aria-hidden="true" className="flex gap-1">
            {rows.map((row) => {
              const state = row.done ? 'done' : row.state === 'viewed' ? 'viewed' : 'new';
              return (
                <span
                  key={row.key}
                  data-state={state}
                  className={`h-1.5 min-w-1 flex-1 rounded-sm ${SEGMENT[state]}`}
                />
              );
            })}
          </div>
          {next ? (
            <Link
              data-testid="study-continue"
              href={next.href!}
              className="mt-1 flex min-h-12 items-center justify-center rounded-control bg-brand-600 px-6 text-base font-semibold text-white transition-colors hover:bg-brand-700"
            >
              {t('continue', { n: next.index })}
            </Link>
          ) : (
            total > 0 && (
              <p className="mt-1 rounded-control bg-ok-50 px-3.5 py-2.5 text-sm font-medium text-ok-600">
                {t('allDone')}
              </p>
            )
          )}
        </aside>
      </div>
    </LearnerShell>
  );
}

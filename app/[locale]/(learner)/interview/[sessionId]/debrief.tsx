import type { CSSProperties } from 'react';
import { getTranslations } from 'next-intl/server';
import { CheckIcon } from '@/components/icons';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { BANK_INTERVIEW_CONCEPTS } from '@/lib/domain/bank-interview';
import { readinessItem } from '@/lib/domain/interview/plan';
import type { Verdict, VerdictReason } from '@/lib/domain/interview/types';
import type { ChatTurn } from '../actions';

const rise = (delay: string) => ({ '--rise-delay': delay }) as CSSProperties;

const ASSESSMENT_TONE: Record<Verdict, string> = {
  correct: 'bg-ok-50 text-ok-600',
  partial: 'bg-warn-50 text-warn-700',
  wrong: 'bg-bad-50 text-bad-600',
  evasive: 'bg-warn-50 text-warn-700',
  pasted: 'bg-bad-50 text-bad-600',
  off_topic: 'bg-ink-100 text-ink-700',
};

const BUBBLE = {
  officer:
    'max-w-[85%] rounded-card rounded-tl-sm bg-brand-50 px-4 py-3 text-sm leading-[1.7] text-ink-900',
  learner:
    'ml-auto max-w-[85%] rounded-card rounded-tr-sm bg-brand-700 px-4 py-3 text-sm leading-[1.7] text-white',
} as const;

const PRIMARY =
  'inline-flex min-h-12 items-center justify-center rounded-control bg-brand-600 px-6 text-base font-semibold text-white transition-colors hover:bg-brand-700';
const GHOST =
  'inline-flex min-h-12 items-center justify-center rounded-control border border-ink-300 px-5 text-base font-medium text-ink-700 transition-colors hover:bg-ink-50';

/**
 * The verdict in the exam-result treatment — with, first of all, whether the learner can open
 * the account or not — the officer's narrative, then every judged concept
 * with the correct value now — this is where the teaching happens (spec §4.4) — and the
 * transcript. The chrome follows the learner's language; the officer's words stay Thai.
 */
export async function Debrief({
  verdict,
  narrative,
  reasons,
  expected,
  locale,
  turns,
  closeReason,
  score,
  focusedReview,
}: {
  verdict: 'ready' | 'not_ready' | null;
  narrative: string;
  reasons: VerdictReason[];
  /** The record's value per concept, from the session's plan. */
  expected: Record<string, string>;
  locale: AppLocale;
  turns: ChatTurn[];
  /** Why the session ended, in the learner's language; null when unknown. */
  closeReason: string | null;
  score: { value: number; maximum: number; required: number } | null;
  /** V2 teaches only the answers that need work; legacy sessions keep their original review. */
  focusedReview: boolean;
}) {
  const t = await getTranslations('interview');
  const ready = verdict === 'ready';
  const tag = verdict ?? 'abandoned';
  const reviewReasons = focusedReview
    ? reasons.filter((reason) => reason.verdict !== 'correct')
    : reasons;
  // What the learner came to find out, in plain words (Owner, 2026-10-02): can they open the
  // account or not. The chip, the officer's narrative and the answers below explain why.
  const label = (concept: string) =>
    focusedReview && readinessItem(concept)
      ? readinessItem(concept)!.question[locale]
      : concept === 'juristic_id'
        ? t('concept.juristic_id')
        : (BANK_INTERVIEW_CONCEPTS.find((c) => c.id === concept)?.question[locale] ?? concept);

  return (
    <div className="mx-auto grid max-w-[780px] gap-6">
      <section
        data-testid="interview-verdict"
        data-verdict={tag}
        className={
          'glass-strong rise grid grid-cols-[88px_minmax(0,1fr)] items-center gap-5 rounded-sheet p-5 text-ink-900 md:grid-cols-[112px_minmax(0,1fr)] ' +
          (ready
            ? 'border-gold-100/90 shadow-[0_12px_32px_rgb(12_26_58/0.25),inset_0_0_0_1px_rgb(200_150_62/0.35)]'
            : 'shadow-[0_12px_32px_rgb(12_26_58/0.25)]')
        }
        style={rise('0ms')}
      >
        {ready ? (
          <div
            data-testid="medallion"
            className="medallion pop grid size-[88px] place-items-center rounded-full text-brand-900 md:size-28"
          >
            <CheckIcon size={44} />
          </div>
        ) : (
          <div
            aria-hidden="true"
            className="grid size-[88px] place-items-center rounded-full bg-warn-50 text-warn-700 md:size-28"
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v6M12 16.5v.5" />
            </svg>
          </div>
        )}
        <div>
          <span
            className={
              'inline-block rounded-full px-3 py-px text-sm leading-[1.7] font-semibold ' +
              (ready ? 'bg-gold-100 text-gold-700' : 'bg-warn-50 text-warn-700')
            }
          >
            {t(`verdict.${tag}`)}
          </span>
          <h2
            data-testid="interview-outcome"
            data-outcome={ready ? 'can_open' : 'cannot_open'}
            className={
              'mt-2 font-display text-[20px] leading-[1.45] font-semibold md:text-[22px] ' +
              (ready ? 'text-brand-900' : 'text-warn-700')
            }
          >
            {score
              ? t(ready ? 'outcome.readyTitle' : 'outcome.practiceTitle')
              : t(`outcome.${tag}.title`)}
          </h2>
          <p className="mt-1 text-base leading-[1.75] text-ink-900">
            {score
              ? t(ready ? 'outcome.scoreReady' : 'outcome.scorePractice', {
                  score: score.value,
                  maximum: score.maximum,
                  required: score.required,
                })
              : t(`outcome.${tag}.detail`)}
          </p>
          {closeReason && closeReason !== 'plan_complete' && (
            <p data-testid="close-reason" className="mt-2 text-sm leading-[1.7] text-ink-700">
              {t(`closeReason.${closeReason}` as never)}
            </p>
          )}
          {narrative && (
            <p lang="th" className="mt-2 text-base leading-[1.75] text-ink-900">
              {narrative}
            </p>
          )}
        </div>
      </section>

      {reviewReasons.length > 0 && (
        <section
          className="rise overflow-hidden rounded-card bg-white shadow-raised"
          style={rise('80ms')}
        >
          <div className="border-b border-brand-100 bg-brand-50 px-5 py-3 md:px-6">
            <h2 className="font-display text-[18px] leading-[1.45] font-semibold text-brand-900 md:text-[22px]">
              {t(focusedReview ? 'debrief.reviewNeeded' : 'debrief.reasons')}
            </h2>
          </div>
          <ol data-testid="verdict-reasons">
            {reviewReasons.map((r) => (
              <li
                key={r.concept}
                data-testid={'verdict-reason-' + r.concept}
                data-verdict={r.verdict}
                className="grid gap-1.5 border-b border-ink-100 px-5 py-4 last:border-b-0 md:px-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-base font-semibold text-ink-900">{label(r.concept)}</span>
                  <span
                    className={
                      'rounded-full px-2.5 py-px text-xs leading-[1.7] font-semibold ' +
                      ASSESSMENT_TONE[r.verdict]
                    }
                  >
                    {t(`assessment.${r.verdict}`)}
                  </span>
                </div>
                {r.note && (
                  <p lang="th" className="text-sm leading-[1.7] text-ink-700">
                    {r.note}
                  </p>
                )}
                {r.verdict !== 'correct' && expected[r.concept] && (
                  <p className="text-sm leading-[1.7] text-ink-900">
                    {t('debrief.correctValue', { value: expected[r.concept] })}
                  </p>
                )}
                {r.verdict !== 'correct' && r.cardKey && (
                  <Link
                    href={'/study/' + r.cardKey}
                    className="justify-self-start text-sm font-medium text-brand-600 underline underline-offset-[3px]"
                  >
                    {t('debrief.review')}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {turns.length > 0 && (
        <section
          className="rise overflow-hidden rounded-card bg-white shadow-raised"
          style={rise('160ms')}
        >
          <div className="border-b border-brand-100 bg-brand-50 px-5 py-3 md:px-6">
            <h2 className="font-display text-[18px] leading-[1.45] font-semibold text-brand-900 md:text-[22px]">
              {t('debrief.transcript')}
            </h2>
          </div>
          <ol className="grid gap-3 px-4 py-5 md:px-6">
            {turns.map((turn) => (
              <li
                key={turn.id}
                data-testid="chat-message"
                data-role={turn.role}
                className={BUBBLE[turn.role]}
              >
                <p lang="th" className="whitespace-pre-wrap">
                  {turn.content}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="rise flex flex-wrap gap-3" style={rise('240ms')}>
        {ready ? (
          <Link href="/dashboard" className={PRIMARY}>
            {t('debrief.toDashboard')}
          </Link>
        ) : (
          <>
            <Link href="/interview" className={PRIMARY}>
              {t('debrief.tryAgain')}
            </Link>
            <Link href="/dashboard" className={GHOST}>
              {t('debrief.toDashboard')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

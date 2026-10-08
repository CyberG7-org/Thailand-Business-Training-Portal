import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  BuildingsIcon,
  CalendarBlankIcon,
  CheckCircleIcon,
  IdentificationCardIcon,
  UserCircleIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react/dist/ssr';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getInterviewWithTurns } from '@/lib/db/interviews';
import { createSupabaseServerClient } from '@/lib/db/server';
import { BANK_INTERVIEW_CONCEPTS } from '@/lib/domain/bank-interview';
import type { InterviewPlan, Verdict, VerdictReason } from '@/lib/domain/interview/types';
import { displayLoginId } from '@/lib/domain/login-id';
import { type InterviewResultItem, SessionResultTranscript } from './session-result-transcript';

const DATE_LOCALES: Record<AppLocale, string> = { th: 'th-TH', en: 'en-GB', zh: 'zh-CN' };
const VERDICTS: Verdict[] = ['correct', 'partial', 'wrong', 'evasive', 'pasted', 'off_topic'];

type StoredSummary = {
  reasons?: VerdictReason[];
  narrative?: string;
  score?: number;
  maxScore?: number;
  passScore?: number;
};
type StoredAssessment = { concept?: string; verdict?: string; note?: string };

const verdictOf = (v: string | null) => (v === 'ready' || v === 'not_ready' ? v : null);
const assessmentOf = (v: unknown): Verdict | null =>
  VERDICTS.includes(v as Verdict) ? (v as Verdict) : null;

/**
 * One session for the staff: who, the verdict, the officer's narrative, every assessment, the
 * transcript. Shared by Readiness interviews and a learner's Chatbot history (D82); the caller
 * has already required staff, and RLS keeps a manager to their own team (anything else is a 404).
 */
export async function InterviewSessionView({
  locale,
  id,
  back,
  learnerId,
}: {
  locale: string;
  id: string;
  back: { href: string; label: string };
  /** When given, a session of any other learner is not found either. */
  learnerId?: string;
}) {
  const [db, t, ti] = await Promise.all([
    createSupabaseServerClient(),
    getTranslations('admin.interviews'),
    getTranslations('interview'),
  ]);
  // RLS: a manager reads only their team's sessions; anything else is a 404, not a refusal.
  const found = await getInterviewWithTurns(db, id);
  if (!found || (learnerId && found.session.user_id !== learnerId)) notFound();
  const { session, turns } = found;
  const [{ data: profile }, { data: record }] = await Promise.all([
    db.from('profiles').select('login_id, display_name').eq('id', session.user_id).maybeSingle(),
    db.from('dbd_records').select('company_name_th').eq('id', session.dbd_record_id).maybeSingle(),
  ]);
  const dates = new Intl.DateTimeFormat(DATE_LOCALES[locale as AppLocale], {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  });
  const summary = (session.summary ?? null) as StoredSummary | null;
  const verdict = verdictOf(session.verdict);
  const plan = session.plan as unknown as InterviewPlan;
  const expected = Object.fromEntries(
    (plan.items ?? []).map((item) => [item.concept, item.expected]),
  );
  const label = (concept: string) =>
    concept === 'juristic_id'
      ? ti('concept.juristic_id')
      : (BANK_INTERVIEW_CONCEPTS.find((c) => c.id === concept)?.question[locale as AppLocale] ??
        concept);

  const resultItems: InterviewResultItem[] = [];
  let officerTurn: (typeof turns)[number] | null = null;
  for (const [turnIndex, turn] of turns.entries()) {
    if (turn.role === 'officer') {
      officerTurn = turn;
      continue;
    }
    const reply = turns[turnIndex + 1];
    const assessment = (turn.assessment ??
      (reply?.role === 'officer' ? reply.assessment : null)) as StoredAssessment | null;
    const assessedVerdict = assessmentOf(assessment?.verdict ?? null);
    const concept = assessment?.concept ?? null;
    resultItems.push({
      id: turn.id,
      question: officerTurn?.content ?? (concept ? label(concept) : '—'),
      questionHint: concept && label(concept) !== concept ? label(concept) : null,
      answer: turn.content,
      verdict: assessedVerdict,
      note: assessment?.note ?? null,
      expected: concept ? (expected[concept] ?? null) : null,
    });
    officerTurn = null;
  }

  const assessed = resultItems.filter((item) => item.verdict !== null);
  const finalReasons = summary?.reasons ?? [];
  const derivedScore = finalReasons.length
    ? finalReasons.filter((item) => item.verdict === 'correct').length
    : assessed.filter((item) => item.verdict === 'correct').length;
  const score = typeof summary?.score === 'number' ? summary.score : derivedScore;
  const maximum =
    typeof summary?.maxScore === 'number'
      ? summary.maxScore
      : Math.max(finalReasons.length || assessed.length, score);
  const percentage = maximum > 0 ? Math.round((score / maximum) * 100) : null;
  const ready = verdict === 'ready';

  return (
    <section className="grid gap-4 md:gap-5">
      <Link href={back.href} className="staff-link text-sm">
        {back.label}
      </Link>
      <div data-testid="admin-assessments" className="grid gap-4 md:gap-5">
        <section className="overflow-hidden rounded-card bg-white shadow-raised">
          <div className="border-b border-brand-100 px-5 py-4 md:px-6">
            <h1 className="font-display text-xl font-semibold text-brand-900 md:text-2xl">
              {t('summaryTitle')}
            </h1>
            <p className="mt-1 text-sm leading-6 text-ink-500">{t('summaryIntro')}</p>
          </div>

          <div className="grid divide-y divide-brand-100 md:grid-cols-[1fr_1fr_1.25fr] md:divide-x md:divide-y-0">
            <div className="flex items-center gap-4 p-5 md:p-6">
              <div
                role="progressbar"
                aria-label={t('overallResult')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percentage ?? 0}
                className="relative grid size-24 shrink-0 place-items-center text-xl font-semibold text-brand-900"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 100 100"
                  className="absolute inset-0 size-full -rotate-90"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="44"
                    fill="none"
                    stroke="var(--color-brand-100)"
                    strokeWidth="9"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="44"
                    fill="none"
                    stroke="var(--color-brand-600)"
                    strokeWidth="9"
                    pathLength="100"
                    strokeDasharray={`${percentage ?? 0} 100`}
                    strokeLinecap="round"
                  />
                </svg>
                {percentage === null ? '—' : `${percentage}%`}
              </div>
              <div>
                <p className="text-xs font-medium text-ink-500">{t('overallResult')}</p>
                <p className="mt-1 font-display text-2xl font-semibold text-brand-900">
                  {maximum > 0 ? `${score} / ${maximum}` : '—'}
                </p>
                <p className="mt-1 text-xs text-ink-500">{t('correctAnswers')}</p>
              </div>
            </div>

            <div className="flex items-center p-5 md:p-6">
              <div
                data-testid="admin-verdict"
                data-verdict={verdict ?? undefined}
                className={`flex w-full items-center gap-3 rounded-card p-4 ${ready ? 'bg-ok-50' : 'bg-warn-50'}`}
              >
                <span
                  className={`grid size-12 shrink-0 place-items-center rounded-full text-white ${ready ? 'bg-ok-600' : 'bg-warn-600'}`}
                >
                  {ready ? (
                    <CheckCircleIcon size={30} weight="fill" />
                  ) : (
                    <WarningCircleIcon size={30} weight="fill" />
                  )}
                </span>
                <div>
                  <p className="text-xs font-medium text-ink-500">{t('readinessStatus')}</p>
                  <p className="mt-1 font-semibold text-brand-900">
                    {verdict ? t(`verdicts.${verdict}`) : t('noVerdict')}
                  </p>
                </div>
              </div>
            </div>

            <dl className="grid content-center gap-3 p-5 text-sm md:p-6">
              <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5">
                <CalendarBlankIcon size={21} className="text-brand-700" />
                <div>
                  <dt className="text-xs text-ink-500">{t('interviewDate')}</dt>
                  <dd className="font-medium text-brand-900">
                    {dates.format(new Date(session.started_at))}
                  </dd>
                </div>
              </div>
              <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5">
                <BuildingsIcon size={21} className="text-brand-700" />
                <div>
                  <dt className="text-xs text-ink-500">{t('company')}</dt>
                  <dd className="font-medium text-brand-900">{record?.company_name_th ?? '—'}</dd>
                </div>
              </div>
              <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5">
                {profile?.display_name ? (
                  <UserCircleIcon size={21} className="text-brand-700" />
                ) : (
                  <IdentificationCardIcon size={21} className="text-brand-700" />
                )}
                <div>
                  <dt className="text-xs text-ink-500">{t('learnerId')}</dt>
                  <dd className="font-medium text-brand-900">
                    {profile ? displayLoginId(profile.login_id) : '—'}
                    {profile?.display_name ? ` · ${profile.display_name}` : ''}
                  </dd>
                </div>
              </div>
            </dl>
          </div>

          {summary?.narrative && (
            <div className="border-t border-brand-100 bg-brand-50/60 px-5 py-3 md:px-6">
              <p className="text-xs font-medium text-ink-500">{t('narrative')}</p>
              <p lang="th" className="mt-1 text-sm leading-6 text-ink-700">
                {summary.narrative}
              </p>
            </div>
          )}
        </section>

        <SessionResultTranscript
          items={resultItems}
          labels={{
            title: t('transcriptTitle'),
            intro: t('transcriptIntro'),
            explanation: t('explanation'),
            expected: t('expectedAnswer'),
            unanswered: t('unanswered'),
            verdicts: {
              correct: t('assessment.correct'),
              partial: t('assessment.partial'),
              wrong: t('assessment.wrong'),
              evasive: t('assessment.evasive'),
              pasted: t('assessment.pasted'),
              off_topic: t('assessment.off_topic'),
            },
          }}
        />
      </div>
    </section>
  );
}

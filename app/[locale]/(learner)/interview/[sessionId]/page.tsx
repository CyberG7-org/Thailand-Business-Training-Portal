import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LearnerShell } from '@/components/shell/learner-shell';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { MAX_INPUT_CHARS, getInterviewWithTurns, turnBudget } from '@/lib/db/interviews';
import { getMyCompany } from '@/lib/db/learner';
import { createSupabaseServerClient } from '@/lib/db/server';
import { BANK_INTERVIEW_CONCEPTS } from '@/lib/domain/bank-interview';
import { readinessItem } from '@/lib/domain/interview/plan';
import type { InterviewPlan, Verdict, VerdictReason } from '@/lib/domain/interview/types';
import { displayLoginId } from '@/lib/domain/login-id';
import type { InterviewResultItem } from '@/app/[locale]/(admin)/admin/interviews/session-result-transcript';
import type { ChatTurn } from '../actions';
import { nextConcept } from '../turns';
import { Chat } from './chat';
import { LearnerResult } from './learner-result';

type StoredSummary = {
  verdict?: 'ready' | 'not_ready';
  reasons?: VerdictReason[];
  narrative?: string;
  closeReason?: string;
  score?: number;
  maxScore?: number;
  passScore?: number;
};

/** The chat while the session is open; the debrief once it has closed (spec §4.4–4.5). */
export default async function InterviewSessionPage({
  params,
}: {
  params: Promise<{ locale: string; sessionId: string }>;
}) {
  const { locale, sessionId } = await params;
  const user = await requireUser(locale);
  const [db, t] = await Promise.all([createSupabaseServerClient(), getTranslations('interview')]);
  const found = await getInterviewWithTurns(db, sessionId);
  // RLS already hides other learners' sessions; a manager's own view lives under /admin.
  if (!found || found.session.user_id !== user.id) notFound();
  const { session, turns } = found;
  const chatTurns: ChatTurn[] = turns.map((r) => ({
    id: r.id,
    role: r.role as ChatTurn['role'],
    content: r.content,
    concept: nextConcept(r.assessment),
  }));
  const back = { href: '/interview', label: t('title') };
  const plan = session.plan as unknown as InterviewPlan;
  const guidedReadiness = plan.version === 2;

  if (session.status === 'in_progress') {
    const budget = {
      used: turns.filter((r) => r.role === 'learner').length,
      max: turnBudget(plan),
    };
    return (
      <LearnerShell step="interview" title={t('title')} intro={t('thaiOnly')} back={back}>
        <Chat
          sessionId={session.id}
          initialTurns={chatTurns}
          maxChars={MAX_INPUT_CHARS}
          initialBudget={budget}
        />
      </LearnerShell>
    );
  }

  const summary = (session.summary ?? null) as StoredSummary | null;
  const closeReason = summary?.closeReason ?? (session.status === 'abandoned' ? 'abandoned' : null);
  const expected = Object.fromEntries((plan.items ?? []).map((i) => [i.concept, i.expected]));
  const verdict =
    session.verdict === 'ready' || session.verdict === 'not_ready' ? session.verdict : null;
  const company = await getMyCompany(db, user.id);
  const labels = await getTranslations('interview');
  const conceptLabel = (concept: string) =>
    guidedReadiness && readinessItem(concept)
      ? readinessItem(concept)!.question[locale as AppLocale]
      : concept === 'juristic_id'
        ? labels('concept.juristic_id')
        : (BANK_INTERVIEW_CONCEPTS.find((c) => c.id === concept)?.question[locale as AppLocale] ??
          concept);
  const validVerdicts: Verdict[] = [
    'correct',
    'partial',
    'wrong',
    'evasive',
    'pasted',
    'off_topic',
  ];
  const resultItems: InterviewResultItem[] = [];
  let officerTurn: (typeof turns)[number] | null = null;
  for (const [turnIndex, turn] of turns.entries()) {
    if (turn.role === 'officer') {
      officerTurn = turn;
      continue;
    }
    const reply = turns[turnIndex + 1];
    const assessment = (turn.assessment ??
      (reply?.role === 'officer' ? reply.assessment : null)) as {
      concept?: string;
      verdict?: string;
      note?: string;
    } | null;
    const concept = assessment?.concept ?? null;
    resultItems.push({
      id: turn.id,
      question: officerTurn?.content ?? (concept ? conceptLabel(concept) : '—'),
      questionHint: concept ? conceptLabel(concept) : null,
      answer: turn.content,
      verdict: validVerdicts.includes(assessment?.verdict as Verdict)
        ? (assessment!.verdict as Verdict)
        : null,
      note: assessment?.note ?? null,
      expected: concept ? (expected[concept] ?? null) : null,
    });
    officerTurn = null;
  }
  const assessed = resultItems.filter((item) => item.verdict !== null);
  const derivedScore =
    (summary?.reasons?.length ?? 0) > 0
      ? summary!.reasons!.filter((item) => item.verdict === 'correct').length
      : assessed.filter((item) => item.verdict === 'correct').length;
  const score = typeof summary?.score === 'number' ? summary.score : derivedScore;
  const maximum =
    typeof summary?.maxScore === 'number'
      ? summary.maxScore
      : Math.max(summary?.reasons?.length ?? assessed.length, score);
  return (
    <LearnerShell
      step="interview"
      title={t('debrief.title')}
      back={back}
      tone={verdict === 'ready' ? 'gold' : 'blue'}
    >
      <LearnerResult
        verdict={verdict}
        score={score}
        maximum={maximum}
        required={typeof summary?.passScore === 'number' ? summary.passScore : null}
        startedAt={session.started_at}
        company={company?.dbd_records?.company_name_th ?? null}
        learner={displayLoginId(user.loginId)}
        locale={locale as AppLocale}
        items={resultItems}
        closeReason={closeReason}
      />
    </LearnerShell>
  );
}

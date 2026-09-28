import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { LearnerShell } from '@/components/shell/learner-shell';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { MAX_INPUT_CHARS, getInterviewWithTurns } from '@/lib/db/interviews';
import { createSupabaseServerClient } from '@/lib/db/server';
import type { InterviewPlan, VerdictReason } from '@/lib/domain/interview/types';
import type { ChatTurn } from '../actions';
import { nextConcept } from '../turns';
import { Chat } from './chat';
import { Debrief } from './debrief';

type StoredSummary = {
  verdict?: 'ready' | 'not_ready';
  reasons?: VerdictReason[];
  narrative?: string;
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

  if (session.status === 'in_progress') {
    return (
      <LearnerShell step="interview" title={t('title')} intro={t('thaiOnly')} back={back}>
        <Chat sessionId={session.id} initialTurns={chatTurns} maxChars={MAX_INPUT_CHARS} />
      </LearnerShell>
    );
  }

  const summary = (session.summary ?? null) as StoredSummary | null;
  const plan = session.plan as unknown as InterviewPlan;
  const expected = Object.fromEntries(plan.items.map((i) => [i.concept, i.expected]));
  const verdict =
    session.verdict === 'ready' || session.verdict === 'not_ready' ? session.verdict : null;
  return (
    <LearnerShell
      step="interview"
      title={t('debrief.title')}
      back={back}
      tone={verdict === 'ready' ? 'gold' : 'blue'}
    >
      <Debrief
        verdict={verdict}
        narrative={summary?.narrative ?? ''}
        reasons={summary?.reasons ?? []}
        expected={expected}
        locale={locale as AppLocale}
        turns={chatTurns}
      />
    </LearnerShell>
  );
}

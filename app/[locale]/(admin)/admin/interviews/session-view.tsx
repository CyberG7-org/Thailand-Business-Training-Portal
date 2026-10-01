import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import { getInterviewWithTurns } from '@/lib/db/interviews';
import { createSupabaseServerClient } from '@/lib/db/server';
import { BANK_INTERVIEW_CONCEPTS } from '@/lib/domain/bank-interview';
import type { Verdict, VerdictReason } from '@/lib/domain/interview/types';
import { displayLoginId } from '@/lib/domain/login-id';

const DATE_LOCALES: Record<AppLocale, string> = { th: 'th-TH', en: 'en-GB', zh: 'zh-CN' };
const VERDICTS: Verdict[] = ['correct', 'partial', 'wrong', 'evasive', 'pasted', 'off_topic'];

type StoredSummary = { reasons?: VerdictReason[]; narrative?: string };
type StoredAssessment = { concept?: string; verdict?: string; note?: string };

const statusOf = (s: string) =>
  s === 'in_progress' || s === 'completed' || s === 'abandoned' ? s : 'abandoned';
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
  const label = (concept: string) =>
    concept === 'juristic_id'
      ? ti('concept.juristic_id')
      : (BANK_INTERVIEW_CONCEPTS.find((c) => c.id === concept)?.question[locale as AppLocale] ??
        concept);

  return (
    <section className="grid gap-4">
      <Link href={back.href} className="staff-link text-sm">
        {back.label}
      </Link>
      <h1 className="staff-title">{t('detailTitle')}</h1>
      <p className="text-sm text-ink-700">
        {profile ? displayLoginId(profile.login_id) : '—'}
        {profile?.display_name ? ' · ' + profile.display_name : ''}
        {' · '}
        {record?.company_name_th ?? '—'}
        {' · '}
        {dates.format(new Date(session.started_at))}
        {' · '}
        {t(`statuses.${statusOf(session.status)}`)}
        {' · '}
        <span data-testid="admin-verdict" data-verdict={verdict ?? undefined}>
          {verdict ? t(`verdicts.${verdict}`) : t('noVerdict')}
        </span>
      </p>

      <div data-testid="admin-assessments" className="staff-card grid gap-3">
        <h2 className="font-semibold">{t('assessments')}</h2>
        {summary?.narrative && (
          <div>
            <h3 className="text-sm font-medium text-ink-700">{t('narrative')}</h3>
            <p lang="th" className="text-sm">
              {summary.narrative}
            </p>
          </div>
        )}
        {summary?.reasons?.length ? (
          <ul className="grid gap-1 text-sm">
            {summary.reasons.map((r) => (
              <li key={r.concept} data-verdict={r.verdict}>
                <span className="font-medium">{label(r.concept)}</span>
                {' — '}
                {t(`assessment.${r.verdict}`)}
                {r.note ? (
                  <span lang="th" className="text-ink-500">
                    {' — ' + r.note}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-700">{t('noVerdict')}</p>
        )}
      </div>

      <div className="grid gap-2">
        <h2 className="font-semibold">{t('transcript')}</h2>
        <ol data-testid="admin-transcript" className="grid gap-2">
          {turns.map((turn) => {
            const a = (turn.assessment ?? null) as StoredAssessment | null;
            const av = assessmentOf(a?.verdict);
            return (
              <li
                key={turn.id}
                data-role={turn.role}
                className={
                  'max-w-[85%] rounded-control border border-ink-100 px-3 py-2 text-sm ' +
                  (turn.role === 'officer' ? 'bg-ink-50' : 'ml-auto bg-white')
                }
              >
                <span className="block text-xs text-ink-500">
                  {turn.role === 'officer' ? ti('chat.officer') : ti('chat.you')}
                </span>
                <p lang="th" className="whitespace-pre-wrap">
                  {turn.content}
                </p>
                {av && a?.concept ? (
                  <p className="mt-1 text-xs text-ink-500">
                    {label(a.concept)} — {t(`assessment.${av}`)}
                    {a.note ? ' — ' + a.note : ''}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

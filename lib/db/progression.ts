import type { SupabaseClient } from '@supabase/supabase-js';
import { getPolicy } from '@/lib/config/policy';
import type { ProgressionFacts } from '@/lib/domain/progression';
import { todayInBangkok, type ISODate } from '@/lib/domain/thai-date';
import { getActiveAssignmentForUser, getLatestEligibility } from './assignments';
import { examPassedFor } from './exam';
import type { Database } from './database.types';

type Db = SupabaseClient<Database>;

/**
 * Builds the facts `deriveProgression` needs from what the database holds today.
 */
export async function loadProgressionFacts(
  db: Db,
  userId: string,
  options: { today?: ISODate } = {},
): Promise<ProgressionFacts> {
  const [assignment, requireExamPassForBankCall, requireExamPassForNameCard] = await Promise.all([
    getActiveAssignmentForUser(db, userId),
    getPolicy('require_exam_pass_for_bank_call'),
    getPolicy('require_exam_pass_for_name_card'),
  ]);
  const [snapshot, studyRows, quizRows, exam, cardRows, callRows, callsDone] = await Promise.all([
    assignment ? getLatestEligibility(db, userId, assignment.dbd_record_id) : null,
    db.from('study_progress').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db
      .from('assessment_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('kind', 'quiz')
      .eq('status', 'submitted'),
    examPassedFor(userId),
    db.from('name_cards').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('call_sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db
      .from('call_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['completed', 'partial']),
  ]);

  return {
    hasActiveAssignment: assignment !== null,
    studyOpened: (studyRows.count ?? 0) > 0,
    quizAttempts: quizRows.count ?? 0,
    examSubmitted: exam.submitted,
    examPassed: exam.passed,
    nameCardCreated: (cardRows.count ?? 0) > 0,
    eligibility: snapshot
      ? { availableFrom: snapshot.available_from, expiresAt: snapshot.expires_at }
      : null,
    today: options.today ?? todayInBangkok(),
    callSessions: callRows.count ?? 0,
    callsCompleted: callsDone.count ?? 0,
    policy: { requireExamPassForBankCall, requireExamPassForNameCard },
  };
}

/**
 * Same facts for many learners in a fixed number of queries (the admin users list). One
 * learner costs ~10 round trips; a list of 100 must not cost 1,000.
 */
export async function loadProgressionFactsForUsers(
  db: Db,
  userIds: string[],
  options: { today?: ISODate } = {},
): Promise<Map<string, ProgressionFacts>> {
  const out = new Map<string, ProgressionFacts>();
  if (userIds.length === 0) return out;
  const today = options.today ?? todayInBangkok();
  const [
    requireExamPassForBankCall,
    requireExamPassForNameCard,
    examPassRule,
    assignments,
    snapshots,
    study,
    attempts,
    cards,
    calls,
  ] = await Promise.all([
    getPolicy('require_exam_pass_for_bank_call'),
    getPolicy('require_exam_pass_for_name_card'),
    getPolicy('exam_pass_rule'),
    db
      .from('user_dbd_assignments')
      .select('user_id, dbd_record_id')
      .in('user_id', userIds)
      .eq('active', true),
    db
      .from('eligibility_snapshots')
      .select('user_id, dbd_record_id, available_from, expires_at, calculated_at')
      .in('user_id', userIds)
      .order('calculated_at', { ascending: false }),
    db.from('study_progress').select('user_id').in('user_id', userIds),
    db
      .from('assessment_attempts')
      .select('user_id, kind, result, submitted_at')
      .in('user_id', userIds)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false }),
    db.from('name_cards').select('user_id').in('user_id', userIds),
    db.from('call_sessions').select('user_id, status').in('user_id', userIds),
  ]);
  for (const r of [assignments, snapshots, study, attempts, cards, calls]) {
    if (r.error) throw r.error;
  }

  const assignmentByUser = new Map((assignments.data ?? []).map((a) => [a.user_id, a]));
  const latestSnapshot = new Map<string, { available_from: string; expires_at: string | null }>();
  for (const s of snapshots.data ?? []) {
    const a = assignmentByUser.get(s.user_id);
    if (!a || a.dbd_record_id !== s.dbd_record_id || latestSnapshot.has(s.user_id)) continue;
    latestSnapshot.set(s.user_id, { available_from: s.available_from, expires_at: s.expires_at });
  }
  const studied = new Set((study.data ?? []).map((s) => s.user_id));
  const carded = new Set((cards.data ?? []).map((c) => c.user_id));
  const quizCount = new Map<string, number>();
  const examRows = new Map<string, { result: string | null }[]>();
  for (const a of attempts.data ?? []) {
    if (a.kind === 'quiz') quizCount.set(a.user_id, (quizCount.get(a.user_id) ?? 0) + 1);
    else examRows.set(a.user_id, [...(examRows.get(a.user_id) ?? []), { result: a.result }]);
  }
  const callCount = new Map<string, { sessions: number; completed: number }>();
  for (const c of calls.data ?? []) {
    const cur = callCount.get(c.user_id) ?? { sessions: 0, completed: 0 };
    cur.sessions += 1;
    if (c.status === 'completed' || c.status === 'partial') cur.completed += 1;
    callCount.set(c.user_id, cur);
  }

  for (const userId of userIds) {
    const exams = examRows.get(userId) ?? [];
    const examPassed =
      examPassRule === 'latest'
        ? exams[0]?.result === 'pass'
        : exams.some((e) => e.result === 'pass');
    const eligibility = latestSnapshot.get(userId) ?? null;
    const c = callCount.get(userId) ?? { sessions: 0, completed: 0 };
    out.set(userId, {
      hasActiveAssignment: assignmentByUser.has(userId),
      studyOpened: studied.has(userId),
      quizAttempts: quizCount.get(userId) ?? 0,
      examSubmitted: exams.length,
      examPassed,
      nameCardCreated: carded.has(userId),
      eligibility: eligibility
        ? { availableFrom: eligibility.available_from, expiresAt: eligibility.expires_at }
        : null,
      today,
      callSessions: c.sessions,
      callsCompleted: c.completed,
      policy: { requireExamPassForBankCall, requireExamPassForNameCard },
    });
  }
  return out;
}

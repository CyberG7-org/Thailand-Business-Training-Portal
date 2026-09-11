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

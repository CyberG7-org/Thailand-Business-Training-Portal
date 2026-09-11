import type { SupabaseClient } from '@supabase/supabase-js';
import { getPolicy } from '@/lib/config/policy';
import type { ProgressionFacts } from '@/lib/domain/progression';
import { todayInBangkok, type ISODate } from '@/lib/domain/thai-date';
import { getActiveAssignmentForUser, getLatestEligibility } from './assignments';
import type { Database } from './database.types';

type Db = SupabaseClient<Database>;

/**
 * Builds the facts `deriveProgression` needs from what the database holds today.
 * Study, quiz, exam, name-card and call facts are constant here and are wired in by
 * the P3/P4/P5/P6/P8 slices as their tables arrive.
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
  const snapshot = assignment
    ? await getLatestEligibility(db, userId, assignment.dbd_record_id)
    : null;

  return {
    hasActiveAssignment: assignment !== null,
    studyOpened: false,
    quizAttempts: 0,
    examSubmitted: 0,
    examPassed: false,
    nameCardCreated: false,
    eligibility: snapshot
      ? { availableFrom: snapshot.available_from, expiresAt: snapshot.expires_at }
      : null,
    today: options.today ?? todayInBangkok(),
    callSessions: 0,
    callsCompleted: 0,
    policy: { requireExamPassForBankCall, requireExamPassForNameCard },
  };
}

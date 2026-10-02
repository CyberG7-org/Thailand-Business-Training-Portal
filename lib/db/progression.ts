import type { SupabaseClient } from '@supabase/supabase-js';
import { getPolicy } from '@/lib/config/policy';
import type { ProgressionFacts } from '@/lib/domain/progression';
import { isStudyComplete, type CardProgress, type StudyCard } from '@/lib/domain/study-progress';
import { todayInBangkok, type ISODate } from '@/lib/domain/thai-date';
import { getActiveAssignmentForUser, getLatestEligibility } from './assignments';
import { IN_FILTER_CHUNK, allRows } from './chunks';
import { examPassedFor } from './exam';
import type { Database } from './database.types';

type Db = SupabaseClient<Database>;

/** The cards a learner studies: every active one, as the study list shows them, with its languages. */
async function activeCards(db: Db): Promise<StudyCard[]> {
  const { data, error } = await db
    .from('study_materials')
    .select('id, study_material_localizations(language)')
    .eq('active', true);
  if (error) throw error;
  return data.map((m) => ({
    id: m.id,
    languages: m.study_material_localizations.map((l) => l.language),
  }));
}

/** The language a learner last chose; Thai when none is stored. */
async function preferredLanguages(db: Db, userIds: string[]): Promise<Map<string, string>> {
  const { data, error } = await db
    .from('profiles')
    .select('id, preferred_language')
    .in('id', userIds);
  if (error) throw error;
  return new Map(data.map((p) => [p.id, p.preferred_language]));
}

/**
 * Builds the facts `deriveProgression` needs from what the database holds today.
 */
export async function loadProgressionFacts(
  db: Db,
  userId: string,
  /** `language`: the one the learner is reading in; the one they last chose when absent. */
  options: { today?: ISODate; language?: string } = {},
): Promise<ProgressionFacts> {
  const [
    assignment,
    requireExamPassForInterview,
    requireExamPassForNameCard,
    tracking,
    cards,
    language,
  ] = await Promise.all([
    getActiveAssignmentForUser(db, userId),
    getPolicy('require_exam_pass_for_interview'),
    getPolicy('require_exam_pass_for_name_card'),
    getPolicy('study_completion_tracking'),
    activeCards(db),
    options.language ?? preferredLanguages(db, [userId]).then((m) => m.get(userId) ?? 'th'),
  ]);
  const [snapshot, studyRows, quizRows, exam, cardRows, interviews, upcoming] = await Promise.all([
    assignment ? getLatestEligibility(db, userId, assignment.dbd_record_id) : null,
    db.from('study_progress').select('material_id, completed_at').eq('user_id', userId),
    db
      .from('assessment_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('kind', 'quiz')
      .eq('status', 'submitted'),
    examPassedFor(userId),
    db.from('name_cards').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    db.from('interview_sessions').select('verdict').eq('user_id', userId),
    db
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'booked')
      .gte('starts_at', new Date().toISOString()),
  ]);
  if (studyRows.error) throw studyRows.error;
  if (interviews.error) throw interviews.error;
  if (upcoming.error) throw upcoming.error;
  const sessions = interviews.data ?? [];

  return {
    hasActiveAssignment: assignment !== null,
    studyOpened: studyRows.data.length > 0,
    studyComplete: isStudyComplete(cards, studyRows.data, tracking, language),
    quizAttempts: quizRows.count ?? 0,
    examSubmitted: exam.submitted,
    examPassed: exam.passed,
    nameCardCreated: (cardRows.count ?? 0) > 0,
    eligibility: snapshot
      ? { availableFrom: snapshot.available_from, expiresAt: snapshot.expires_at }
      : null,
    today: options.today ?? todayInBangkok(),
    interviewSessions: sessions.length,
    // Ready is one-way (spec §3): the first session that ended ready settles it.
    interviewReady: sessions.some((s) => s.verdict === 'ready'),
    // An upcoming booking; a cancelled or past one returns the step to available (spec §3).
    appointmentBooked: (upcoming.count ?? 0) > 0,
    policy: { requireExamPassForInterview, requireExamPassForNameCard },
  };
}

/**
 * Same facts for many learners in a fixed number of queries (the admin users list). One
 * learner costs ~10 round trips; a list of 100 must not cost 1,000. Longer lists are read 100
 * learners at a time, since every query filters by the ids in its URL.
 */
export async function loadProgressionFactsForUsers(
  db: Db,
  userIds: string[],
  options: { today?: ISODate } = {},
): Promise<Map<string, ProgressionFacts>> {
  const out = new Map<string, ProgressionFacts>();
  if (userIds.length === 0) return out;
  if (userIds.length > IN_FILTER_CHUNK) {
    for (let i = 0; i < userIds.length; i += IN_FILTER_CHUNK) {
      const part = await loadProgressionFactsForUsers(
        db,
        userIds.slice(i, i + IN_FILTER_CHUNK),
        options,
      );
      for (const [id, facts] of part) out.set(id, facts);
    }
    return out;
  }
  const today = options.today ?? todayInBangkok();
  const [
    requireExamPassForInterview,
    requireExamPassForNameCard,
    examPassRule,
    tracking,
    studyCards,
    languages,
    study,
    assignments,
    snapshots,
    attempts,
    cards,
    interviews,
    bookings,
  ] = await Promise.all([
    getPolicy('require_exam_pass_for_interview'),
    getPolicy('require_exam_pass_for_name_card'),
    getPolicy('exam_pass_rule'),
    getPolicy('study_completion_tracking'),
    activeCards(db),
    // Staff see a learner's steps in the language that learner last chose.
    preferredLanguages(db, userIds),
    // One row per learner and card: read a page at a time, never cut off at `max_rows`.
    allRows((from, to) =>
      db
        .from('study_progress')
        .select('id, user_id, material_id, completed_at')
        .in('user_id', userIds)
        .order('id')
        .range(from, to),
    ),
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
    db
      .from('assessment_attempts')
      .select('user_id, kind, result, submitted_at')
      .in('user_id', userIds)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false }),
    db.from('name_cards').select('user_id').in('user_id', userIds),
    db.from('interview_sessions').select('user_id, verdict').in('user_id', userIds),
    db
      .from('appointments')
      .select('user_id')
      .in('user_id', userIds)
      .eq('status', 'booked')
      .gte('starts_at', new Date().toISOString()),
  ]);
  for (const r of [assignments, snapshots, attempts, cards, interviews, bookings]) {
    if (r.error) throw r.error;
  }

  const assignmentByUser = new Map((assignments.data ?? []).map((a) => [a.user_id, a]));
  const latestSnapshot = new Map<string, { available_from: string; expires_at: string | null }>();
  for (const s of snapshots.data ?? []) {
    const a = assignmentByUser.get(s.user_id);
    if (!a || a.dbd_record_id !== s.dbd_record_id || latestSnapshot.has(s.user_id)) continue;
    latestSnapshot.set(s.user_id, { available_from: s.available_from, expires_at: s.expires_at });
  }
  const progressByUser = new Map<string, CardProgress[]>();
  for (const p of study)
    progressByUser.set(p.user_id, [...(progressByUser.get(p.user_id) ?? []), p]);
  const carded = new Set((cards.data ?? []).map((c) => c.user_id));
  const quizCount = new Map<string, number>();
  const examRows = new Map<string, { result: string | null }[]>();
  for (const a of attempts.data ?? []) {
    if (a.kind === 'quiz') quizCount.set(a.user_id, (quizCount.get(a.user_id) ?? 0) + 1);
    else examRows.set(a.user_id, [...(examRows.get(a.user_id) ?? []), { result: a.result }]);
  }

  const bookedUsers = new Set((bookings.data ?? []).map((b) => b.user_id));
  const interviewByUser = new Map<string, { sessions: number; ready: boolean }>();
  for (const s of interviews.data ?? []) {
    const cur = interviewByUser.get(s.user_id) ?? { sessions: 0, ready: false };
    cur.sessions += 1;
    if (s.verdict === 'ready') cur.ready = true;
    interviewByUser.set(s.user_id, cur);
  }

  for (const userId of userIds) {
    const exams = examRows.get(userId) ?? [];
    const interview = interviewByUser.get(userId) ?? { sessions: 0, ready: false };
    const examPassed =
      examPassRule === 'latest'
        ? exams[0]?.result === 'pass'
        : exams.some((e) => e.result === 'pass');
    const eligibility = latestSnapshot.get(userId) ?? null;
    out.set(userId, {
      hasActiveAssignment: assignmentByUser.has(userId),
      studyOpened: progressByUser.has(userId),
      studyComplete: isStudyComplete(
        studyCards,
        progressByUser.get(userId) ?? [],
        tracking,
        languages.get(userId) ?? 'th',
      ),
      quizAttempts: quizCount.get(userId) ?? 0,
      examSubmitted: exams.length,
      examPassed,
      nameCardCreated: carded.has(userId),
      eligibility: eligibility
        ? { availableFrom: eligibility.available_from, expiresAt: eligibility.expires_at }
        : null,
      today,
      interviewSessions: interview.sessions,
      interviewReady: interview.ready,
      appointmentBooked: bookedUsers.has(userId),
      policy: { requireExamPassForInterview, requireExamPassForNameCard },
    });
  }
  return out;
}

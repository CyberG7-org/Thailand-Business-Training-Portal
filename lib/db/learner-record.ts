import type { SupabaseClient } from '@supabase/supabase-js';
import { getPolicy } from '@/lib/config/policy';
import {
  chatbotResult,
  mcqResult,
  type ChatbotResult,
  type McqResult,
} from '@/lib/domain/learner-record';
import { allRows } from './chunks';
import type { Database } from './database.types';

type Db = SupabaseClient<Database>;

export type LearnerRecordRow = {
  id: string;
  loginId: string;
  /** The company of the learner's active assignment, when the caller may read it. */
  company: { id: string; nameTh: string | null; issuedOn: string | null } | null;
  mcq: McqResult | null;
  /** Submitted exam attempts: the MCQ cell links to their history when there is one. */
  mcqAttempts: number;
  chatbot: ChatbotResult | null;
  chatbotSessions: number;
  /** The next booked appointment, if any. */
  appointmentAt: string | null;
};

/**
 * One row per learner the caller can see, newest first (D82). Every read runs under the caller's
 * client, so RLS narrows it to their team (all teams for the admin); none of them lists the
 * learners' ids, which is what made the old list refuse a few hundred learners ("URI too long").
 */
export async function loadLearnerRecords(db: Db): Promise<LearnerRecordRow[]> {
  const now = new Date().toISOString();
  // Each list is read in full, a page at a time (allRows), so a long one is never cut off at
  // the API's row limit; every query is ordered on a unique column for stable pages.
  const [learners, assignments, exams, sessions, bookings, rule] = await Promise.all([
    allRows((from, to) =>
      db
        .from('profiles')
        .select('id, login_id')
        .eq('role', 'learner')
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    ),
    allRows((from, to) =>
      db
        .from('user_dbd_assignments')
        .select('user_id, dbd_records(id, company_name_th, issued_on)')
        .eq('active', true)
        .order('id')
        .range(from, to),
    ),
    allRows((from, to) =>
      db
        .from('assessment_attempts')
        .select('user_id, result, submitted_at')
        .eq('kind', 'exam')
        .eq('status', 'submitted')
        .order('id')
        .range(from, to),
    ),
    allRows((from, to) =>
      db.from('interview_sessions').select('user_id, status, verdict').order('id').range(from, to),
    ),
    allRows((from, to) =>
      db
        .from('appointments')
        .select('user_id, starts_at')
        .eq('status', 'booked')
        .gte('starts_at', now)
        .order('starts_at')
        .order('id')
        .range(from, to),
    ),
    getPolicy('exam_pass_rule'),
  ]);

  const group = <T extends { user_id: string }>(rows: T[]) => {
    const by = new Map<string, T[]>();
    for (const row of rows) by.set(row.user_id, [...(by.get(row.user_id) ?? []), row]);
    return by;
  };
  const companyOf = new Map(
    assignments.map((a) => {
      const r = a.dbd_records as {
        id: string;
        company_name_th: string | null;
        issued_on: string | null;
      } | null;
      return [a.user_id, r ? { id: r.id, nameTh: r.company_name_th, issuedOn: r.issued_on } : null];
    }),
  );
  const examsOf = group(exams);
  const sessionsOf = group(sessions);
  const nextBooking = new Map<string, string>();
  for (const b of bookings) {
    if (!nextBooking.has(b.user_id)) nextBooking.set(b.user_id, b.starts_at);
  }

  return learners.map((l) => {
    const attempts = examsOf.get(l.id) ?? [];
    const learnerSessions = sessionsOf.get(l.id) ?? [];
    return {
      id: l.id,
      loginId: l.login_id,
      company: companyOf.get(l.id) ?? null,
      mcq: mcqResult(attempts, rule),
      mcqAttempts: attempts.length,
      chatbot: chatbotResult(learnerSessions),
      chatbotSessions: learnerSessions.length,
      appointmentAt: nextBooking.get(l.id) ?? null,
    };
  });
}

/** Who a history page is about: a learner the caller may read, and their current company. */
export async function getLearnerHeader(
  db: Db,
  learnerId: string,
): Promise<{ id: string; loginId: string; companyNameTh: string | null } | null> {
  const [{ data: learner, error }, { data: assignment }] = await Promise.all([
    db.from('profiles').select('id, login_id, role').eq('id', learnerId).maybeSingle(),
    db
      .from('user_dbd_assignments')
      .select('dbd_records(company_name_th)')
      .eq('user_id', learnerId)
      .eq('active', true)
      .maybeSingle(),
  ]);
  if (error) throw error;
  // RLS hides another team's learner, which then reads as not found.
  if (!learner || learner.role !== 'learner') return null;
  const record = assignment?.dbd_records as { company_name_th: string | null } | null;
  return {
    id: learner.id,
    loginId: learner.login_id,
    companyNameTh: record?.company_name_th ?? null,
  };
}

export type ExamAttemptSummary = {
  id: string;
  attemptNo: number;
  status: string;
  result: string | null;
  score: number | null;
  maxScore: number | null;
  startedAt: string;
  submittedAt: string | null;
};

/** The learner's exam attempts, newest first (the MCQ history, D82). */
export async function listExamAttempts(db: Db, learnerId: string): Promise<ExamAttemptSummary[]> {
  const { data, error } = await db
    .from('assessment_attempts')
    .select('id, attempt_no, status, result, score, max_score, started_at, submitted_at')
    .eq('user_id', learnerId)
    .eq('kind', 'exam')
    .order('attempt_no', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((a) => ({
    id: a.id,
    attemptNo: a.attempt_no,
    status: a.status,
    result: a.result,
    score: a.score,
    maxScore: a.max_score,
    startedAt: a.started_at,
    submittedAt: a.submitted_at,
  }));
}

export type InterviewSessionSummary = {
  id: string;
  /** 1 for the learner's first session, counted by when each started. */
  attemptNo: number;
  status: string;
  verdict: string | null;
  startedAt: string;
  endedAt: string | null;
};

/** The learner's interview sessions, newest first (the Chatbot history, D82). */
export async function listInterviewSessions(
  db: Db,
  learnerId: string,
): Promise<InterviewSessionSummary[]> {
  const { data, error } = await db
    .from('interview_sessions')
    .select('id, status, verdict, started_at, ended_at')
    .eq('user_id', learnerId)
    .order('started_at', { ascending: true })
    .order('id');
  if (error) throw error;
  return (data ?? [])
    .map((s, i) => ({
      id: s.id,
      attemptNo: i + 1,
      status: s.status,
      verdict: s.verdict,
      startedAt: s.started_at,
      endedAt: s.ended_at,
    }))
    .reverse();
}

'use server';

import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { AssessmentError, answerQuestion } from '@/lib/db/assessment';
import { ExamPolicyError, finalizeExam, startExam } from '@/lib/db/exam';
import type { AnswerState, StartState } from '../quiz/actions';

function code(e: unknown): string {
  if (e instanceof ExamPolicyError) return e.reason;
  return e instanceof AssessmentError ? e.code : e instanceof Error ? e.message : 'unknown';
}

export async function startExamAction(_prev: StartState, formData: FormData): Promise<StartState> {
  const locale = String(formData.get('locale') ?? 'th') as AppLocale;
  const user = await requireUser(locale);
  let attemptId: string;
  try {
    attemptId = (await startExam(user.id, locale)).id;
  } catch (e) {
    return { error: code(e) };
  }
  redirect(`/${locale}/exam/${attemptId}`);
}

/**
 * A question of the Owner's bank is marked the moment it is answered: right or wrong, and when
 * wrong the correct answer with its explanation (D100). An attempt from before the bank keeps
 * its rule: nothing is revealed until it is submitted (EXAM-002, AC-006).
 */
export async function answerExamAction(
  _prev: AnswerState,
  formData: FormData,
): Promise<AnswerState> {
  const locale = String(formData.get('locale') ?? 'th');
  const attemptId = String(formData.get('attemptId') ?? '');
  const questionId = String(formData.get('questionId') ?? '');
  const selectedKey = String(formData.get('selectedKey') ?? '');
  const user = await requireUser(locale);
  try {
    const feedback = await answerQuestion({
      userId: user.id,
      attemptId,
      questionId,
      selectedKey,
      locale: locale as AppLocale,
    });
    return { feedback: feedback.fromBank ? feedback : null, selectedKey, error: null };
  } catch (e) {
    return { feedback: null, selectedKey: null, error: code(e) };
  }
}

export async function submitExamAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'th');
  const attemptId = String(formData.get('attemptId') ?? '');
  const user = await requireUser(locale);
  await finalizeExam(user.id, attemptId);
  redirect(`/${locale}/exam/${attemptId}/result`);
}

'use server';

import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import { getPolicy } from '@/lib/config/policy';
import {
  AssessmentError,
  answerQuestion,
  getOrStartAttempt,
  submitAttempt,
  type AnswerFeedback,
} from '@/lib/db/assessment';

export type StartState = { error: string | null };
export type AnswerState = {
  feedback: AnswerFeedback | null;
  selectedKey: string | null;
  error: string | null;
};

function code(e: unknown): string {
  return e instanceof AssessmentError ? e.code : e instanceof Error ? e.message : 'unknown';
}

export async function startQuizAction(_prev: StartState, formData: FormData): Promise<StartState> {
  const locale = String(formData.get('locale') ?? 'th') as AppLocale;
  const user = await requireUser(locale);
  let attemptId: string;
  try {
    const attempt = await getOrStartAttempt({
      userId: user.id,
      kind: 'quiz',
      language: locale,
      count: await getPolicy('quiz_question_count'),
    });
    attemptId = attempt.id;
  } catch (e) {
    return { error: code(e) };
  }
  redirect(`/${locale}/quiz/${attemptId}`);
}

export async function answerQuizAction(
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
    return { feedback, selectedKey, error: null };
  } catch (e) {
    return { feedback: null, selectedKey: null, error: code(e) };
  }
}

export async function submitQuizAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'th');
  const attemptId = String(formData.get('attemptId') ?? '');
  const user = await requireUser(locale);
  await submitAttempt({ userId: user.id, attemptId });
  redirect(`/${locale}/quiz/${attemptId}/review`);
}

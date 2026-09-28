'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/routing';
import { requireUser } from '@/lib/auth/session';
import {
  InterviewError,
  endInterview,
  startOrResumeInterview,
  submitLearnerMessage,
} from '@/lib/db/interviews';
import { nextConcept } from './turns';

export type StartState = { error: string | null };
export type ChatTurn = {
  id: string;
  role: 'officer' | 'learner';
  content: string;
  /** The concept the officer asks about next; null on a learner bubble or a closing turn. */
  concept: string | null;
};
export type Budget = { used: number; max: number };
export type SendResult =
  { ok: true; turns: ChatTurn[]; closed: boolean; budget: Budget } | { ok: false; error: string };

function code(e: unknown): string {
  return e instanceof InterviewError ? e.code : 'unknown';
}

/** Creates or resumes the learner's session and lands them in it. */
export async function startInterviewAction(
  _prev: StartState,
  formData: FormData,
): Promise<StartState> {
  const locale = String(formData.get('locale') ?? 'th') as AppLocale;
  const user = await requireUser(locale);
  let sessionId: string;
  try {
    sessionId = (await startOrResumeInterview(user.id)).session.id;
  } catch (e) {
    return { error: code(e) };
  }
  revalidatePath(`/${locale}/dashboard`);
  redirect(`/${locale}/interview/${sessionId}`);
}

export async function sendMessageAction(
  locale: string,
  sessionId: string,
  content: string,
): Promise<SendResult> {
  const user = await requireUser(locale);
  try {
    const { turns, closed, budget } = await submitLearnerMessage(user.id, sessionId, content);
    if (closed) {
      revalidatePath(`/${locale}/interview/${sessionId}`);
      revalidatePath(`/${locale}/dashboard`);
    }
    return {
      ok: true,
      closed,
      budget,
      turns: turns.map((t) => ({
        id: t.id,
        role: t.role as ChatTurn['role'],
        content: t.content,
        concept: nextConcept(t.assessment),
      })),
    };
  } catch (e) {
    return { ok: false, error: code(e) };
  }
}

export async function endInterviewAction(
  locale: string,
  sessionId: string,
): Promise<{ error: string | null }> {
  const user = await requireUser(locale);
  try {
    await endInterview(user.id, sessionId);
  } catch (e) {
    return { error: code(e) };
  }
  revalidatePath(`/${locale}/interview/${sessionId}`);
  revalidatePath(`/${locale}/dashboard`);
  return { error: null };
}

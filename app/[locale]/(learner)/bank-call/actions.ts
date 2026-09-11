'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { CallError, attachVapiCall, completeFakeSession, startCallSession } from '@/lib/db/calls';
import { createSupabaseServerClient } from '@/lib/db/server';
import type { WebCallConfig } from '@/lib/integrations/vapi/config';

export type StartCallResult =
  | { ok: true; sessionId: string; provider: 'vapi' | 'fake'; config: WebCallConfig | null }
  | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof CallError) return { ok: false, error: e.code };
  return { ok: false, error: e instanceof Error ? e.message : 'unknown' };
}

export async function startCallSessionAction(locale: string): Promise<StartCallResult> {
  const user = await requireUser(locale);
  try {
    const { session, config, provider } = await startCallSession(
      await createSupabaseServerClient(),
      user.id,
    );
    revalidatePath(`/${locale}/dashboard`);
    return { ok: true, sessionId: session.id, provider, config };
  } catch (e) {
    return fail(e);
  }
}

export async function attachVapiCallAction(
  locale: string,
  sessionId: string,
  vapiCallId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser(locale);
  try {
    await attachVapiCall(user.id, sessionId, vapiCallId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Fake provider only: finishes the session with the canned transcript. */
export async function simulateCallAction(
  locale: string,
  sessionId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser(locale);
  try {
    await completeFakeSession(user.id, sessionId);
    revalidatePath(`/${locale}/bank-call`);
    revalidatePath(`/${locale}/dashboard`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

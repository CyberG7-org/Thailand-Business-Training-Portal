import 'server-only';
import { after } from 'next/server';
import { templateRecordFromSnapshot } from '@/lib/domain/facts/snapshot';
import { createSupabaseAdminClient } from './admin';
import { getActiveAssignmentForUser } from './assignments';
import { factTranslationsFor } from './fact-translations';
import { pinnedFactsFor } from './pinning';

/** Prepare both supported fact languages for the learner's exact pinned version and role. */
export async function prepareQuizFactsForUser(userId: string): Promise<void> {
  if (!process.env.GEMINI_API_KEY) return;
  const admin = createSupabaseAdminClient();
  const assignment = await getActiveAssignmentForUser(admin, userId);
  if (!assignment) return;
  const pinned = await pinnedFactsFor(admin, assignment);
  if (!pinned) return;
  const source = templateRecordFromSnapshot(pinned.snapshot, pinned.role);
  await Promise.all([
    factTranslationsFor(admin, pinned.version.id, source, 'en'),
    factTranslationsFor(admin, pinned.version.id, source, 'zh'),
  ]);
}

/** Do not make a manager save or learner navigation wait for Gemini. */
export function prepareQuizFactsAfter(userId: string): void {
  after(async () => {
    try {
      await prepareQuizFactsForUser(userId);
    } catch (error) {
      console.error('Quiz fact preparation failed', error);
    }
  });
}

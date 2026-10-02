import 'server-only';
import { getLocale } from 'next-intl/server';
import { cache } from 'react';
import { loadProgressionFacts } from '@/lib/db/progression';
import { createSupabaseServerClient } from '@/lib/db/server';
import { stageStatuses, type StageInfo, type StageKey } from '@/lib/domain/progression';

/**
 * The learner's five stage statuses, once per request: the shell asks on every step page for
 * its segments, and a page that also needs them shares the same read. Study counts the cards
 * written in the language the page is in.
 */
export const cachedStageStatuses = cache(
  async (userId: string): Promise<Record<StageKey, StageInfo>> => {
    const db = await createSupabaseServerClient();
    return stageStatuses(await loadProgressionFacts(db, userId, { language: await getLocale() }));
  },
);

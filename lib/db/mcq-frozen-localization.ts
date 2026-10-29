import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import type { AnswerKey } from './mcq-attempt';
import { cachedFactTranslationsFor } from './fact-translations';
import { loadRenderContext } from './mcq-context';
import { listVariants } from './mcq-bank';
import { getVersion, readSnapshot } from './training-versions';
import {
  assignmentFacts,
  templateRecordFromSnapshot,
  type RoleSnapshot,
} from '@/lib/domain/facts/snapshot';
import { translatedRecord } from '@/lib/domain/facts/localization';
import { localizeFrozenQuestion } from '@/lib/domain/mcq/frozen-localization';
import type { PresentedQuestion } from '@/lib/domain/mcq/attempt';

type Attempt = Database['public']['Tables']['assessment_attempts']['Row'];
type Answer = Pick<Database['public']['Tables']['assessment_answers']['Row'], 'id' | 'question_id'>;

/** Read-only compatibility for bank attempts started before Tamil/Malay quiz text was deployed. */
export async function missingFrozenQuizTranslations(
  admin: SupabaseClient<Database>,
  attempt: Attempt,
  answers: readonly Answer[],
  keys: ReadonlyMap<string, AnswerKey>,
  language: 'ms' | 'ta',
): Promise<Map<string, PresentedQuestion>> {
  const missing = answers.filter((answer) => {
    const key = keys.get(answer.id);
    return key && !key.localized[language] && key.localized.en;
  });
  if (!missing.length || !attempt.training_version_id) return new Map();
  try {
    const version = await getVersion(admin, attempt.training_version_id);
    if (!version) return new Map();
    const snapshot = readSnapshot(version);
    const role = (attempt.role_snapshot as RoleSnapshot | null) ?? null;
    const source = templateRecordFromSnapshot(snapshot, role);
    const [context, variants, en, translated] = await Promise.all([
      loadRenderContext(admin, assignmentFacts(snapshot, role)),
      listVariants(admin),
      cachedFactTranslationsFor(admin, version.id, source, 'en'),
      cachedFactTranslationsFor(admin, version.id, source, language),
    ]);
    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    const englishFacts = translatedRecord(context.facts, en);
    const translatedFacts = translatedRecord(context.facts, translated);
    const restored = new Map<string, PresentedQuestion>();
    for (const answer of missing) {
      const variant = byId.get(answer.question_id);
      const frozenEnglish = keys.get(answer.id)?.localized.en;
      if (!variant || !frozenEnglish) continue;
      const input = {
        variant,
        context,
        translatedFacts,
        seed: `${attempt.shuffle_seed}:${variant.id}`,
        language,
        frozenEnglish,
      };
      const view =
        localizeFrozenQuestion({ ...input, englishFacts }) ??
        localizeFrozenQuestion({ ...input, englishFacts: context.facts });
      if (view) restored.set(answer.id, view);
    }
    return restored;
  } catch (error) {
    console.error('Could not reconstruct older quiz translation', error);
    return new Map();
  }
}

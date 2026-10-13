import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppLocale } from '@/i18n/routing';
import { translatableFacts, type FactTranslations } from '@/lib/domain/facts/localization';
import { GeminiFactTranslator } from '@/lib/integrations/translation/gemini';
import type { Database, Json } from './database.types';

type Source = Parameters<typeof translatableFacts>[0];

/**
 * One translation per version, locale and exact source set. A different learner role gets its
 * own hash; an unchanged version reuses the result across study cards and new quiz attempts.
 * Translation failure leaves the Thai source visible rather than inventing an answer.
 */
export async function factTranslationsFor(
  admin: SupabaseClient<Database>,
  versionId: string,
  source: Source,
  locale: AppLocale,
): Promise<FactTranslations> {
  if (locale === 'th') return {};
  const originals = translatableFacts(source);
  if (Object.keys(originals).length === 0) return {};
  const hash = createHash('sha256').update(JSON.stringify(originals)).digest('hex');
  const existing = await admin
    .from('company_fact_translations')
    .select('translations')
    .eq('training_version_id', versionId)
    .eq('locale', locale)
    .eq('source_hash', hash)
    .maybeSingle();
  if (existing.error) {
    console.error('Company fact translation cache unavailable', existing.error);
    return {};
  }
  if (existing.data) return existing.data.translations as FactTranslations;
  if (!process.env.GEMINI_API_KEY) return {};

  try {
    const translated = await new GeminiFactTranslator().translate(originals, locale);
    if (Object.keys(translated).length === 0) return {};
    const { error } = await admin.from('company_fact_translations').upsert({
      training_version_id: versionId,
      locale,
      source_hash: hash,
      translations: translated as Json,
    });
    if (error) throw error;
    return translated;
  } catch (error) {
    // Do not log the source strings: they may include private company details.
    console.error('Company fact translation unavailable', error);
    return {};
  }
}

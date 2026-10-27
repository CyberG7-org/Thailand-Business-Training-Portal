import 'server-only';
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StudyLanguage } from '@/lib/content/bank-interview-cards';
import type { TemplateRecord } from '@/lib/domain/assessment/template';
import { readingAidSource, type ReadingAids } from '@/lib/domain/facts/study-reading-aids';
import { GeminiFactTranslator } from '@/lib/integrations/translation/gemini';
import type { Database, Json } from './database.types';

/** Cache separately from descriptive-fact translations to avoid changing quiz answers. */
export async function studyReadingAidsFor(
  admin: SupabaseClient<Database>,
  versionId: string,
  record: TemplateRecord,
  locale: StudyLanguage,
): Promise<ReadingAids> {
  if (locale === 'th') return {};
  const source = readingAidSource(record);
  if (locale === 'en' && record.company_name_en) delete source.company_name_th;
  if (Object.keys(source).length === 0) return {};
  const sourceHash = createHash('sha256')
    .update(`study-reading-aids:${JSON.stringify(source)}`)
    .digest('hex');
  const existing = await admin
    .from('company_fact_translations')
    .select('translations')
    .eq('training_version_id', versionId)
    .eq('locale', locale)
    .eq('source_hash', sourceHash)
    .maybeSingle();
  if (existing.error) {
    console.error('Study reading-aid cache unavailable', existing.error);
    return {};
  }
  if (existing.data) return existing.data.translations as ReadingAids;
  if (!process.env.GEMINI_API_KEY) return {};
  try {
    const aids = await new GeminiFactTranslator().translateReadingAids(source, locale);
    if (Object.keys(aids).length === 0) return {};
    const { error } = await admin.from('company_fact_translations').upsert({
      training_version_id: versionId,
      locale,
      source_hash: sourceHash,
      translations: aids as Json,
    });
    if (error) throw error;
    return aids;
  } catch (error) {
    console.error('Study reading aids unavailable', error);
    return {};
  }
}

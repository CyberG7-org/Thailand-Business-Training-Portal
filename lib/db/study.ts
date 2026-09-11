import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppLocale } from '@/i18n/routing';
import type { Database } from './database.types';

type Db = SupabaseClient<Database>;
export type StudyMaterialRow = Database['public']['Tables']['study_materials']['Row'];
export type StudyLocalizationRow =
  Database['public']['Tables']['study_material_localizations']['Row'];
export type StudyProgressRow = Database['public']['Tables']['study_progress']['Row'];

export type StudyMaterialWithLocalizations = StudyMaterialRow & {
  study_material_localizations: StudyLocalizationRow[];
};

/** All materials (admins see inactive ones too; learners only active by RLS), with every localization. */
export async function listStudyMaterials(db: Db): Promise<StudyMaterialWithLocalizations[]> {
  const { data, error } = await db
    .from('study_materials')
    .select('*, study_material_localizations(*)')
    .order('sort_order')
    .order('content_key');
  if (error) throw error;
  return data as StudyMaterialWithLocalizations[];
}

export async function getStudyMaterialByKey(
  db: Db,
  contentKey: string,
): Promise<StudyMaterialWithLocalizations | null> {
  const { data, error } = await db
    .from('study_materials')
    .select('*, study_material_localizations(*)')
    .eq('content_key', contentKey)
    .maybeSingle();
  if (error) throw error;
  return (data as StudyMaterialWithLocalizations | null) ?? null;
}

export function pickLocalization(
  material: StudyMaterialWithLocalizations,
  locale: AppLocale,
): StudyLocalizationRow | null {
  return material.study_material_localizations.find((l) => l.language === locale) ?? null;
}

export type StudyMaterialInput = {
  contentKey: string;
  type: 'card' | 'pdf';
  sortOrder: number;
  active: boolean;
};

export async function createStudyMaterial(
  db: Db,
  input: StudyMaterialInput,
  createdBy: string,
): Promise<StudyMaterialRow> {
  const { data, error } = await db
    .from('study_materials')
    .insert({
      content_key: input.contentKey,
      type: input.type,
      sort_order: input.sortOrder,
      active: input.active,
      created_by: createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateStudyMaterial(
  db: Db,
  id: string,
  input: Omit<StudyMaterialInput, 'contentKey'>,
): Promise<void> {
  const { error } = await db
    .from('study_materials')
    .update({ type: input.type, sort_order: input.sortOrder, active: input.active })
    .eq('id', id);
  if (error) throw error;
}

export type LocalizationInput = {
  language: AppLocale;
  title: string;
  body: string | null;
  ttsEnabled: boolean;
};

/** Creates or updates one language of a material; file_path is managed by uploadStudyPdf. */
export async function upsertLocalization(
  db: Db,
  materialId: string,
  input: LocalizationInput,
): Promise<void> {
  const { error } = await db.from('study_material_localizations').upsert(
    {
      material_id: materialId,
      language: input.language,
      title: input.title,
      body: input.body,
      tts_enabled: input.language === 'th' ? input.ttsEnabled : false,
    },
    { onConflict: 'material_id,language' },
  );
  if (error) throw error;
}

export async function uploadStudyPdf(
  db: Db,
  materialId: string,
  language: AppLocale,
  file: File | Blob,
): Promise<string> {
  const path = `${materialId}/${language}/${Date.now()}.pdf`;
  const { error } = await db.storage
    .from('study-materials')
    .upload(path, file, { contentType: 'application/pdf' });
  if (error) throw error;
  const { error: updateError } = await db
    .from('study_material_localizations')
    .update({ file_path: path })
    .eq('material_id', materialId)
    .eq('language', language);
  if (updateError) throw updateError;
  return path;
}

/** Records that the learner opened the material (first/last viewed). */
export async function markViewed(db: Db, userId: string, materialId: string): Promise<void> {
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from('study_progress')
    .select('id')
    .eq('user_id', userId)
    .eq('material_id', materialId)
    .maybeSingle();
  const { error } = existing
    ? await db.from('study_progress').update({ last_viewed_at: now }).eq('id', existing.id)
    : await db.from('study_progress').insert({ user_id: userId, material_id: materialId });
  if (error) throw error;
}

export async function markCompleted(db: Db, userId: string, materialId: string): Promise<void> {
  await markViewed(db, userId, materialId);
  const { error } = await db
    .from('study_progress')
    .update({ completed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('material_id', materialId);
  if (error) throw error;
}

export async function getMyStudyProgress(db: Db, userId: string): Promise<StudyProgressRow[]> {
  const { data, error } = await db.from('study_progress').select('*').eq('user_id', userId);
  if (error) throw error;
  return data;
}

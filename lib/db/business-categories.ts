import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from './database.types';

type Db = SupabaseClient<Database>;
export type BusinessCategoryRow = Database['public']['Tables']['business_categories']['Row'];

const label = z.string().trim().min(1).max(200);
export const businessCategoryInputSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,59}$/),
  label_th: label,
  label_en: label,
  label_zh: label,
  sort_order: z.coerce.number().int().min(0).max(10000).default(0),
  active: z.boolean().default(true),
});
export type BusinessCategoryInput = z.output<typeof businessCategoryInputSchema>;

/** Staff read the dictionary through their own session (RLS: `is_staff()`). */
export async function listBusinessCategories(
  db: Db,
  opts: { activeOnly?: boolean } = {},
): Promise<BusinessCategoryRow[]> {
  let query = db.from('business_categories').select('*').order('sort_order').order('key');
  if (opts.activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/** The Owner's session only (RLS: `is_admin()`), so the audit names them. */
export async function createBusinessCategory(db: Db, input: BusinessCategoryInput): Promise<void> {
  const { error } = await db.from('business_categories').insert(input);
  if (error) throw error;
}

export async function updateBusinessCategory(
  db: Db,
  key: string,
  input: Omit<BusinessCategoryInput, 'key'>,
): Promise<void> {
  const { data, error } = await db
    .from('business_categories')
    .update(input)
    .eq('key', key)
    .select('key');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('not-found');
}

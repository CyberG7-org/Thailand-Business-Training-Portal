import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RegisteredAddress } from '@/lib/domain/geo/resolve';
import type { StudyPlaceNames } from '@/lib/domain/facts/study-display';
import type { Database } from './database.types';

/** Read verified romanizations by resolved geography IDs; never translate a place name. */
export async function studyPlaceNames(
  db: SupabaseClient<Database>,
  address: RegisteredAddress | null | undefined,
): Promise<StudyPlaceNames> {
  const empty: StudyPlaceNames = { province: null, subdistrict: null };
  if (!address) return empty;
  const [province, subdistrict] = await Promise.all([
    address.province_id
      ? db
          .from('geo_provinces')
          .select('name_th, name_en')
          .eq('id', address.province_id)
          .maybeSingle()
      : null,
    address.subdistrict_id
      ? db
          .from('geo_subdistricts')
          .select('name_th, name_en')
          .eq('id', address.subdistrict_id)
          .maybeSingle()
      : null,
  ]);
  if (province?.error || subdistrict?.error) {
    console.error('Study geography unavailable', province?.error ?? subdistrict?.error);
    return empty;
  }
  return {
    province: province?.data
      ? { nameTh: province.data.name_th, nameEn: province.data.name_en }
      : null,
    subdistrict: subdistrict?.data
      ? { nameTh: subdistrict.data.name_th, nameEn: subdistrict.data.name_en }
      : null,
  };
}

// Not `server-only`: public reference tables read with the caller's own client, and the e2e seed
// (plain Node) resolves a seeded address through it.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GeoLookup } from '@/lib/domain/geo/types';
import type { Database } from './database.types';

type Db = SupabaseClient<Database>;

/** The geography tables as a `GeoLookup`; any signed-in client or the service role may read them. */
export function geoLookup(db: Db): GeoLookup {
  return {
    async provinceByName(nameTh) {
      const { data, error } = await db
        .from('geo_provinces')
        .select('id, region_id, name_th, name_en')
        .eq('name_th', nameTh)
        .maybeSingle();
      if (error) throw error;
      return data
        ? { id: data.id, regionId: data.region_id, nameTh: data.name_th, nameEn: data.name_en }
        : null;
    },
    async districtByName(provinceId, nameTh) {
      const { data, error } = await db
        .from('geo_districts')
        .select('id, province_id, name_th, name_en, prefix_th')
        .eq('province_id', provinceId)
        .eq('name_th', nameTh)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            id: data.id,
            provinceId: data.province_id,
            nameTh: data.name_th,
            nameEn: data.name_en,
            prefixTh: data.prefix_th,
          }
        : null;
    },
    async subdistrictByName(districtId, nameTh) {
      const { data, error } = await db
        .from('geo_subdistricts')
        .select('id, district_id, name_th, name_en, prefix_th, postcode')
        .eq('district_id', districtId)
        .eq('name_th', nameTh)
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            id: data.id,
            districtId: data.district_id,
            nameTh: data.name_th,
            nameEn: data.name_en,
            prefixTh: data.prefix_th,
            postcode: data.postcode,
          }
        : null;
    },
  };
}

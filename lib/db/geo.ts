// Not `server-only`: public reference tables read with the caller's own client, and the e2e seed
// (plain Node) resolves a seeded address through it.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GeoDistrict, GeoLookup, GeoProvince, GeoSubdistrict } from '@/lib/domain/geo/types';
import type { GeoName, RenderContext } from '@/lib/domain/mcq/context';
import type { Database } from './database.types';

type Db = SupabaseClient<Database>;

/** The geography tables as a `GeoLookup`; any signed-in client or the service role may read them. */
export function geoLookup(db: Db): GeoLookup {
  const province = (r: {
    id: number;
    region_id: number;
    name_th: string;
    name_en: string;
  }): GeoProvince => ({ id: r.id, regionId: r.region_id, nameTh: r.name_th, nameEn: r.name_en });
  const district = (r: {
    id: number;
    province_id: number;
    name_th: string;
    name_en: string;
    prefix_th: string;
  }): GeoDistrict => ({
    id: r.id,
    provinceId: r.province_id,
    nameTh: r.name_th,
    nameEn: r.name_en,
    prefixTh: r.prefix_th,
  });
  const subdistrict = (r: {
    id: number;
    district_id: number;
    name_th: string;
    name_en: string;
    prefix_th: string;
    postcode: string;
  }): GeoSubdistrict => ({
    id: r.id,
    districtId: r.district_id,
    nameTh: r.name_th,
    nameEn: r.name_en,
    prefixTh: r.prefix_th,
    postcode: r.postcode,
  });
  const PROVINCE = 'id, region_id, name_th, name_en';
  const DISTRICT = 'id, province_id, name_th, name_en, prefix_th';
  const SUBDISTRICT = 'id, district_id, name_th, name_en, prefix_th, postcode';
  return {
    async provinceByName(nameTh) {
      const { data, error } = await db
        .from('geo_provinces')
        .select(PROVINCE)
        .eq('name_th', nameTh)
        .maybeSingle();
      if (error) throw error;
      return data ? province(data) : null;
    },
    async districtByName(provinceId, nameTh) {
      const { data, error } = await db
        .from('geo_districts')
        .select(DISTRICT)
        .eq('province_id', provinceId)
        .eq('name_th', nameTh)
        .maybeSingle();
      if (error) throw error;
      return data ? district(data) : null;
    },
    async subdistrictByName(districtId, nameTh) {
      const { data, error } = await db
        .from('geo_subdistricts')
        .select(SUBDISTRICT)
        .eq('district_id', districtId)
        .eq('name_th', nameTh)
        .maybeSingle();
      if (error) throw error;
      return data ? subdistrict(data) : null;
    },
    // 77 provinces, and at most a few dozen places under any one parent.
    async provinces() {
      const { data, error } = await db.from('geo_provinces').select(PROVINCE);
      if (error) throw error;
      return data.map(province);
    },
    async districtsOf(provinceId) {
      const { data, error } = await db
        .from('geo_districts')
        .select(DISTRICT)
        .eq('province_id', provinceId);
      if (error) throw error;
      return data.map(district);
    },
    async subdistrictsOf(districtId) {
      const { data, error } = await db
        .from('geo_subdistricts')
        .select(SUBDISTRICT)
        .eq('district_id', districtId);
      if (error) throw error;
      return data.map(subdistrict);
    },
  };
}

type Named = { id: number; name_th: string; name_en: string };

const named = (row: Named): GeoName => ({ id: row.id, th: row.name_th, en: row.name_en });

function split(rows: Named[], ownId: number | null): { own: GeoName | null; others: GeoName[] } {
  const own = rows.find((r) => r.id === ownId);
  return { own: own ? named(own) : null, others: rows.filter((r) => r.id !== ownId).map(named) };
}

/**
 * A resolved address's own places and their siblings — the other provinces of its region, the
 * other districts of its province, the other subdistricts of its district — which is all a
 * geography alternate may be drawn from (spec §5.2).
 */
export async function geoNeighbours(
  db: Db,
  ids: { provinceId: number | null; districtId: number | null; subdistrictId: number | null },
): Promise<RenderContext['geo']> {
  const empty: RenderContext['geo'] = {
    province: null,
    district: null,
    subdistrict: null,
    provinces: [],
    districts: [],
    subdistricts: [],
  };
  if (ids.provinceId === null) return empty;
  const { data: province, error } = await db
    .from('geo_provinces')
    .select('region_id')
    .eq('id', ids.provinceId)
    .maybeSingle();
  if (error) throw error;
  if (!province) return empty;
  const [provinces, districts, subdistricts] = await Promise.all([
    db
      .from('geo_provinces')
      .select('id, name_th, name_en')
      .eq('region_id', province.region_id)
      .order('id'),
    db
      .from('geo_districts')
      .select('id, name_th, name_en')
      .eq('province_id', ids.provinceId)
      .order('id'),
    db
      .from('geo_subdistricts')
      .select('id, name_th, name_en')
      .eq('district_id', ids.districtId ?? -1)
      .order('id'),
  ]);
  for (const result of [provinces, districts, subdistricts]) {
    if (result.error) throw result.error;
  }
  const p = split(provinces.data ?? [], ids.provinceId);
  const d = split(districts.data ?? [], ids.districtId);
  const s = split(subdistricts.data ?? [], ids.subdistrictId);
  return {
    province: p.own,
    district: d.own,
    subdistrict: s.own,
    provinces: p.others,
    districts: d.own ? d.others : [],
    subdistricts: s.own ? s.others : [],
  };
}

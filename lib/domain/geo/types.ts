export type GeoProvince = { id: number; regionId: number; nameTh: string; nameEn: string };
export type GeoDistrict = {
  id: number;
  provinceId: number;
  nameTh: string;
  nameEn: string;
  prefixTh: string;
};
export type GeoSubdistrict = {
  id: number;
  districtId: number;
  nameTh: string;
  nameEn: string;
  prefixTh: string;
  postcode: string;
};

/** Name lookups scoped to the parent: 795 subdistrict names occur more than once in Thailand. */
export interface GeoLookup {
  provinceByName(nameTh: string): Promise<GeoProvince | null>;
  districtByName(provinceId: number, nameTh: string): Promise<GeoDistrict | null>;
  subdistrictByName(districtId: number, nameTh: string): Promise<GeoSubdistrict | null>;
}

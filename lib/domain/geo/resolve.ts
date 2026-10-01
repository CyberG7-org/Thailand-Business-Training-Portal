import { z } from 'zod';
import { normalizeThai } from '@/lib/domain/thai-text';
import { normalizePlaceName, parseThaiAddress } from './address';
import type { GeoLookup } from './types';

export const ADDRESS_ISSUES = [
  'no_address',
  'province_not_found',
  'district_not_found',
  'subdistrict_not_found',
  'postcode_mismatch',
] as const;
export type AddressIssue = (typeof ADDRESS_ISSUES)[number];

/** Stored under `dbd_records.structured_data.address` (spec §5.2). */
export const registeredAddressSchema = z.object({
  full: z.string(),
  house_no: z.string().nullable(),
  moo: z.string().nullable(),
  road: z.string().nullable(),
  subdistrict: z.string().nullable(),
  district: z.string().nullable(),
  province: z.string().nullable(),
  postcode: z.string().nullable(),
  province_id: z.number().int().nullable(),
  district_id: z.number().int().nullable(),
  subdistrict_id: z.number().int().nullable(),
  postcode_source: z.enum(['printed', 'geography']).nullable(),
  status: z.enum(['resolved', 'partial', 'unresolved']),
  issues: z.array(z.enum(ADDRESS_ISSUES)),
});
export type RegisteredAddress = z.output<typeof registeredAddressSchema>;

/**
 * Resolves the printed address top-down against the geography tables. A part that does not
 * resolve is reported as an issue; nothing is guessed (D73). A postcode is taken from the
 * subdistrict only when none is printed, and marked so.
 */
export async function resolveRegisteredAddress(
  printed: string | null | undefined,
  lookup: GeoLookup,
): Promise<RegisteredAddress> {
  const full = normalizeThai(printed ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const parsed = parseThaiAddress(full);
  const base: RegisteredAddress = {
    full,
    ...parsed,
    province_id: null,
    district_id: null,
    subdistrict_id: null,
    postcode_source: parsed.postcode ? 'printed' : null,
    status: 'unresolved',
    issues: [],
  };
  if (!full) return { ...base, issues: ['no_address'] };

  const province = parsed.province
    ? await lookup.provinceByName(normalizePlaceName(parsed.province))
    : null;
  if (!province) return { ...base, issues: ['province_not_found'] };
  const withProvince = { ...base, province: province.nameTh, province_id: province.id };

  const district = parsed.district
    ? await lookup.districtByName(province.id, normalizePlaceName(parsed.district))
    : null;
  if (!district) return { ...withProvince, status: 'partial', issues: ['district_not_found'] };
  const withDistrict = { ...withProvince, district: district.nameTh, district_id: district.id };

  const subdistrict = parsed.subdistrict
    ? await lookup.subdistrictByName(district.id, normalizePlaceName(parsed.subdistrict))
    : null;
  if (!subdistrict) {
    return { ...withDistrict, status: 'partial', issues: ['subdistrict_not_found'] };
  }

  const issues: AddressIssue[] = [];
  if (parsed.postcode && parsed.postcode !== subdistrict.postcode) issues.push('postcode_mismatch');
  return {
    ...withDistrict,
    subdistrict: subdistrict.nameTh,
    subdistrict_id: subdistrict.id,
    postcode: parsed.postcode ?? subdistrict.postcode,
    postcode_source: parsed.postcode ? 'printed' : 'geography',
    status: issues.length === 0 ? 'resolved' : 'partial',
    issues,
  };
}

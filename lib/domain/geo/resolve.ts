import { z } from 'zod';
import { lostOnlyMarks, normalizeThai } from '@/lib/domain/thai-text';
import { normalizePlaceName, parseThaiAddress, restoreMooMark } from './address';
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
 *
 * A name that matches no place exactly but is one place's name with marks missing — and only
 * one's under that parent — is that place (D92): a reader that copies a PDF's text layer drops
 * the marks the font keeps as private glyphs. `full` then carries the table's spelling, so
 * nobody is taught the address without its marks; the caller writes it back to the record.
 */
export async function resolveRegisteredAddress(
  printed: string | null | undefined,
  lookup: GeoLookup,
): Promise<RegisteredAddress> {
  let full = restoreMooMark(normalizeThai(printed ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
  const parsed = parseThaiAddress(full);
  /** The table's spelling in place of the printed one, after the word that introduces it. */
  const respell = (markers: string, printedName: string | null, name: string) => {
    if (!printedName || !lostOnlyMarks(normalizePlaceName(printedName), name)) return;
    const at = new RegExp(
      `((?:${markers})\\s*)${printedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    );
    full = full.replace(at, (_, marker: string) => `${marker}${name}`);
  };
  const base = (): RegisteredAddress => ({
    full,
    ...parsed,
    province_id: null,
    district_id: null,
    subdistrict_id: null,
    postcode_source: parsed.postcode ? 'printed' : null,
    status: 'unresolved',
    issues: [],
  });
  if (!full) return { ...base(), issues: ['no_address'] };

  const provinceName = parsed.province ? normalizePlaceName(parsed.province) : null;
  const province = provinceName
    ? ((await lookup.provinceByName(provinceName)) ??
      onlyMarksLost(provinceName, await lookup.provinces()))
    : null;
  if (!province) return { ...base(), issues: ['province_not_found'] };
  respell('จังหวัด|จ\\.', parsed.province, province.nameTh);
  const withProvince = () => ({ ...base(), province: province.nameTh, province_id: province.id });

  const districtName = parsed.district ? normalizePlaceName(parsed.district) : null;
  const district = districtName
    ? ((await lookup.districtByName(province.id, districtName)) ??
      onlyMarksLost(districtName, await lookup.districtsOf(province.id)))
    : null;
  if (!district) return { ...withProvince(), status: 'partial', issues: ['district_not_found'] };
  respell('อำเภอ|เขต|อ\\.', parsed.district, district.nameTh);
  const withDistrict = () => ({
    ...withProvince(),
    district: district.nameTh,
    district_id: district.id,
  });

  const subdistrictName = parsed.subdistrict ? normalizePlaceName(parsed.subdistrict) : null;
  const subdistrict = subdistrictName
    ? ((await lookup.subdistrictByName(district.id, subdistrictName)) ??
      onlyMarksLost(subdistrictName, await lookup.subdistrictsOf(district.id)))
    : null;
  if (!subdistrict) {
    return { ...withDistrict(), status: 'partial', issues: ['subdistrict_not_found'] };
  }
  respell('ตำบล|แขวง|ต\\.', parsed.subdistrict, subdistrict.nameTh);

  const issues: AddressIssue[] = [];
  if (parsed.postcode && parsed.postcode !== subdistrict.postcode) issues.push('postcode_mismatch');
  return {
    ...withDistrict(),
    subdistrict: subdistrict.nameTh,
    subdistrict_id: subdistrict.id,
    postcode: parsed.postcode ?? subdistrict.postcode,
    postcode_source: parsed.postcode ? 'printed' : 'geography',
    status: issues.length === 0 ? 'resolved' : 'partial',
    issues,
  };
}

/**
 * The one place whose name is `name` with marks missing; null when none is, or when two are —
 * choosing between them would be a guess.
 */
function onlyMarksLost<T extends { nameTh: string }>(name: string, places: readonly T[]): T | null {
  const hits = places.filter((place) => lostOnlyMarks(name, place.nameTh));
  return hits.length === 1 ? hits[0] : null;
}

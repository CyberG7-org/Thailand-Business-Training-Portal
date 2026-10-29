import type { TemplateRecord } from '@/lib/domain/assessment/template';
import { normalizePlaceName, parseThaiAddress } from '@/lib/domain/geo/address';
import type { StudyLanguage } from '@/lib/content/bank-interview-cards';

export type StudyPlaceNames = {
  province: { nameTh: string; nameEn: string } | null;
  subdistrict: { nameTh: string; nameEn: string } | null;
};

/** Display only source identity facts in study cards; never invent translated legal identities. */
export function studyDisplayRecord(
  record: TemplateRecord,
  language: StudyLanguage,
  places: StudyPlaceNames = { province: null, subdistrict: null },
): TemplateRecord {
  const address = parseThaiAddress(record.head_office_address ?? '');
  const verifiedName = (printed: string | null, place: StudyPlaceNames['province']) =>
    printed && place && normalizePlaceName(printed) === normalizePlaceName(place.nameTh)
      ? place.nameEn
      : printed;
  return {
    ...record,
    company_name_en: record.company_name_en?.trim() || record.company_name_th,
    province:
      language === 'th' ? address.province : verifiedName(address.province, places.province),
    subdistrict:
      language === 'th'
        ? address.subdistrict
        : verifiedName(address.subdistrict, places.subdistrict),
  };
}

import type { TemplateRecord } from '@/lib/domain/assessment/template';
import type { StudyLanguage } from '@/lib/content/bank-interview-cards';

export type ReadingAids = Record<string, string>;
const THAI = /[\u0e00-\u0e7f]/u;
const LINE_BREAK = '\u2028';

/** Only visible legal names and addresses are sent for a reading aid; source facts stay intact. */
export function readingAidSource(record: TemplateRecord): ReadingAids {
  const source: ReadingAids = {};
  const add = (key: string, value: string | null | undefined) => {
    if (value && THAI.test(value)) source[key] = value;
  };
  add('company_name_th', record.company_name_th);
  add('head_office_address', record.head_office_address);
  add('business_address', record.business_address);
  add('my_name', record.my_name);
  record.directors?.forEach((director, index) => add(`director_${index}`, director.name_th));
  record.shareholders?.forEach((shareholder, index) =>
    add(`shareholder_${index}`, shareholder.name),
  );
  return source;
}

/** Put the Thai legal value first, then the cached reading aid on a second visual line. */
export function withReadingAids(
  record: TemplateRecord,
  aids: ReadingAids,
  language: StudyLanguage,
): TemplateRecord {
  if (language === 'th') return record;
  const bilingual = (original: string | null, aid?: string) => {
    const translated = aid?.trim().replace(/\s+/gu, ' ').replaceAll('|', '／');
    return original && translated && translated !== original
      ? `${original}${LINE_BREAK}${translated}`
      : original;
  };
  return {
    ...record,
    company_name_th: bilingual(
      record.company_name_th,
      language === 'en' ? (record.company_name_en ?? aids.company_name_th) : aids.company_name_th,
    ),
    head_office_address: bilingual(record.head_office_address, aids.head_office_address),
    business_address: bilingual(record.business_address, aids.business_address),
    my_name: bilingual(record.my_name, aids.my_name),
    directors:
      record.directors?.map((director, index) => ({
        ...director,
        name_th: bilingual(director.name_th, aids[`director_${index}`]) ?? director.name_th,
      })) ?? null,
    shareholders:
      record.shareholders?.map((shareholder, index) => ({
        ...shareholder,
        name: bilingual(shareholder.name, aids[`shareholder_${index}`]) ?? shareholder.name,
      })) ?? null,
  };
}

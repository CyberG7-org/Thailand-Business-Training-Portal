import { BANK_INTERVIEW_CONCEPTS } from '@/lib/domain/bank-interview';
import type { InterviewProfile } from '@/lib/domain/bank-interview';
import type { BusinessProfile } from '@/lib/domain/dbd-profile';
import type { Director } from '@/lib/domain/dbd-record';

/**
 * PII-free description of the Thai company affidavit (หนังสือรับรอง) issued by the Department of
 * Business Development. Every generation run receives it so questions are anchored on what the
 * learner's own certificate says (decision D36). The structure mirrors the owner's sample
 * certificates; no values from them are reproduced here.
 */
export const DBD_CERTIFICATE_REFERENCE = `THE DOCUMENT LEARNERS MUST KNOW: the DBD company affidavit (หนังสือรับรอง / Certificate), issued by the
Department of Business Development (กรมพัฒนาธุรกิจการค้า), Ministry of Commerce, through a provincial or Bangkok
Partnership and Company Registration Office. A bank officer verifies a director against exactly this document.

Header: certificate number (e.g. "No. E5300…"); the registration office that issued it; the statement that the
company was registered as a juristic person under the Civil and Commercial Code on a date (B.E. year on the Thai
original) with a 13-digit juristic person registration number (เลขทะเบียนนิติบุคคล).

Numbered particulars as of the issue date:
1. Company name (ชื่อบริษัท) — Thai name on the Thai original; the English name appears on translations.
2. Number of directors and their names (กรรมการ).
3. Directors authorised to sign and bind the company (กรรมการซึ่งลงชื่อผูกพันบริษัท) — e.g. "one director signs
   and affixes the company seal".
4. Registered capital (ทุนจดทะเบียน) in Baht, written in figures and words.
5. Head office address (ที่ตั้งสำนักงานใหญ่): house/building number, Moo, subdistrict (ตำบล/แขวง), district
   (อำเภอ/เขต), province.
6. Number of objectives (วัตถุประสงค์) with a signed list attached as a separate sheet.

Footer: issue date (วันที่ออกหนังสือรับรอง — the date the +45-day bank window is counted from), the Registrar's name
and signature, a QR code and a note that the certificate can be verified on the DBD website (www.dbd.go.th) within
1 year from issuance. Important notes explain that only registered particulars are certified, that the Registrar may
revoke incorrect registrations, and that the document is a printed copy of an electronic original.

Placeholders that map to these particulars (the app fills each learner's own values):
{company_name_th} (item 1), {company_name_en} (item 1, translation), {juristic_id} (13-digit number),
{certificate_no} (header), {registered_on} (registration date), {issued_on} (issue date), {registered_capital}
(item 4, in Baht), {head_office_address} (item 5), {directors} (item 2, names), {signing_authority} (item 3),
{objectives_count} (item 6), {province} (item 5, province only).
Level 2 placeholders from the other DBD documents (empty for learners whose record lacks them — the app skips such
questions for them): {objectives} (numbered objectives, joined), {business_categories}, {shareholders} (names),
{promoters} (names), {total_shares}, {par_value} (Baht per share).

Good personalised questions (kind "dbd_template") ask the learner for a fact from their own certificate and offer
plausible distractors built with variants, e.g. "ทุนจดทะเบียนของ {company_name_th} คือเท่าใด" with options
"{registered_capital} บาท", "{registered_capital|x2} บาท", "{registered_capital|x0.5} บาท", "{registered_capital|x10} บาท";
or "บริษัทจดทะเบียนเมื่อใด" with "{registered_on}", "{registered_on|+1m}", "{registered_on|-1y}", "{issued_on}";
or "กรรมการของบริษัทคือใคร" with "{directors}" against generic wrong names written out in the option text;
or "บริษัทมีหุ้นทั้งหมดกี่หุ้น" with "{total_shares}", "{total_shares|x2}", "{total_shares|x0.5}", "{total_shares|x10}";
or "ใครเป็นผู้ถือหุ้นของบริษัท" with "{shareholders}" against generic wrong names.
Derived and interview placeholders: {directors_count}, {shareholders_count}, {account_purpose}, {monthly_volume},
{clients_location}, {suppliers_location}, {source_of_funds}, {business_address}, {operations_status}, and the learner's own
role {my_name}, {my_position}, {my_responsibilities}, {my_relationship}, {my_shares}, {my_share_percent} (numeric variants
work on the counts and shares, e.g. {my_shares|x2}).

THE BANK'S INTERVIEW — every quiz/exam must be built around these concepts (the bank's actual question list; vary the
wording, keep the ground):
${BANK_INTERVIEW_CONCEPTS.map((c, i) => `${i + 1}. [${c.group}] ${c.question.en} — placeholders: ${c.placeholders.map((p) => `{${p}}`).join(', ') || 'none'}`).join('\n')}
Spread a batch across these concepts. For the identity/ownership concepts ask for the fact through placeholders. For the
business-plan and personal concepts, when the placeholder exists ask for the fact the same way; otherwise write a
judgement question about the RIGHT WAY to answer (consistent with the company's registered facts, concise, no guessing).

Good generic questions (kind "generic") test understanding of the document itself: who issues it, what each numbered
item means, what the issue date is used for, how long the QR verification is valid, what a bank officer checks.`;

export type DbdReferenceRecord = {
  company_name_th: string | null;
  company_name_en: string | null;
  juristic_id: string | null;
  certificate_no: string | null;
  registered_on: string | null;
  issued_on: string | null;
  registered_capital: number | string | null;
  head_office_address: string | null;
  directors: Director[] | null;
  signing_authority: string | null;
  objectives_count: number | null;
  issuing_office: string | null;
  registrar_name: string | null;
  province?: string | null;
  business?: BusinessProfile | null;
  interview?: InterviewProfile | null;
};

/**
 * Literal values of a reference record that must never appear in a stored question: questions are
 * shared by every learner and are personalised through placeholders instead. Short/numeric-only
 * values (objective counts, years) are not banned because they occur naturally in question text.
 */
export function bannedLiterals(record: DbdReferenceRecord): string[] {
  const values: (string | null | undefined)[] = [
    record.company_name_th,
    record.company_name_en,
    record.juristic_id,
    record.certificate_no,
    record.head_office_address,
    record.registrar_name,
    ...(record.directors ?? []).flatMap((d) => [d.name_th, d.name_en]),
    ...(record.business?.shareholders ?? []).map((sh) => sh.name),
    ...(record.business?.promoters ?? []).map((p) => p.name),
    record.interview?.contact_email,
    record.interview?.contact_phone,
  ];
  // What the company sells is the subject of the questions, so a short answer ("ค้าปลีก",
  // "retail") would reject honest generic ones. Only prose long enough to identify this one
  // company is banned.
  for (const prose of [record.interview?.nature_of_business, record.interview?.products_services]) {
    if (prose && prose.trim().length >= 12) values.push(prose.trim());
  }
  const capital = record.registered_capital === null ? null : Number(record.registered_capital);
  if (capital !== null && Number.isFinite(capital) && capital > 0) {
    values.push(String(capital), capital.toLocaleString('en-US'), capital.toFixed(2));
  }
  return [
    ...new Set(values.map((v) => v?.trim()).filter((v): v is string => !!v && v.length >= 4)),
  ];
}

/** Rendered for the model as the concrete example a generation run is based on. */
export function describeReference(record: DbdReferenceRecord): string {
  const lines = [
    `Company (TH): ${record.company_name_th ?? '-'}`,
    `Company (EN): ${record.company_name_en ?? '-'}`,
    `Juristic ID: ${record.juristic_id ?? '-'}`,
    `Certificate no.: ${record.certificate_no ?? '-'}`,
    `Registered on: ${record.registered_on ?? '-'}`,
    `Issued on: ${record.issued_on ?? '-'}`,
    `Registered capital: ${record.registered_capital ?? '-'}`,
    `Head office: ${record.head_office_address ?? '-'}`,
    `Directors: ${(record.directors ?? []).map((d) => d.name_th).join(', ') || '-'}`,
    `Signing authority: ${record.signing_authority ?? '-'}`,
    `Objectives: ${record.objectives_count ?? '-'}`,
    `Issuing office: ${record.issuing_office ?? '-'}`,
    `Registrar: ${record.registrar_name ?? '-'}`,
    `Province: ${record.province ?? '-'}`,
  ];
  const b = record.business;
  if (b) {
    lines.push(
      `Objectives (${b.objectives.length}): ${
        b.objectives
          .slice(0, 15)
          .map((o) => (o.no === null ? o.text : `${o.no}. ${o.text}`))
          .join(' | ') || '-'
      }`,
      `Business categories: ${b.business_categories.join(', ') || '-'}`,
      `Share structure: total ${b.share_structure.total_shares ?? '-'} shares, par value ${b.share_structure.par_value ?? '-'}, paid-up ${b.share_structure.paid_up_capital ?? '-'}, type ${b.share_structure.share_type ?? '-'}`,
      `Shareholders: ${b.shareholders.map((sh) => `${sh.name} (${sh.shares ?? '?'} shares)`).join(', ') || '-'}`,
      `Promoters: ${b.promoters.map((p) => p.name).join(', ') || '-'}`,
    );
  }
  const iv = record.interview;
  if (iv) {
    lines.push(
      `Bank-interview answers: purpose ${iv.account_purpose ?? '-'}; monthly volume ${iv.monthly_volume ?? '-'}; clients ${iv.clients_location ?? '-'}; suppliers ${iv.suppliers_location ?? '-'}; source of funds ${iv.source_of_funds ?? '-'}; place of business ${iv.business_address ?? '-'}; operations ${iv.operations_status ?? '-'}`,
    );
  }
  return lines.join('\n');
}

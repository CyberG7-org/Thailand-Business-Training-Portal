import { z } from 'zod';

/**
 * Every value carries its provenance (Level 3 of the three-level model, decision D38):
 * confidence, the printed snippet, the page and which uploaded document it came from.
 */
const field = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value.nullable(),
    confidence: z.number().min(0).max(1),
    source_text: z.string().nullable(),
    /** 1-based page inside the source document; null when not applicable. */
    source_page: z.number().int().nullable(),
    /** 1-based index of the uploaded document the value was read from. */
    source_document: z.number().int().nullable(),
  });

const text = field(z.string());
const number = field(z.number());

export const DOCUMENT_TYPES = [
  'certificate',
  'objectives_sheet',
  'shareholder_list',
  'memorandum',
  'articles',
  'other',
] as const;

/** The structured output the model must return for a DBD document pack. */
export const dbdExtractionSchema = z.object({
  // ---- Level 1: company identity (หนังสือรับรอง) --------------------------------------------
  company_name_th: text,
  company_name_en: text,
  juristic_id: text,
  /** Dates as printed (Buddhist or Common Era, DD/MM/YYYY or YYYY-MM-DD); normalized later. */
  registered_on: text,
  registered_capital: number,
  directors: field(
    z.array(
      z.object({
        name_th: z.string(),
        name_en: z.string().nullable(),
      }),
    ),
  ),
  signing_authority: text,
  head_office_address: text,
  province: text,

  // ---- Level 2: business profile (objectives sheet, บอจ.5, บอจ.2) ---------------------------
  objectives: field(
    z.array(
      z.object({
        no: z.number().int().nullable(),
        text: z.string(),
      }),
    ),
  ),
  business_categories: field(z.array(z.string())),
  share_structure: field(
    z.object({
      total_shares: z.number().nullable(),
      par_value: z.number().nullable(),
      paid_up_capital: z.number().nullable(),
      share_type: z.string().nullable(),
    }),
  ),
  shareholders: field(
    z.array(
      z.object({
        name: z.string(),
        nationality: z.string().nullable(),
        shares: z.number().nullable(),
        percent: z.number().nullable(),
      }),
    ),
  ),
  promoters: field(
    z.array(
      z.object({
        name: z.string(),
        nationality: z.string().nullable(),
      }),
    ),
  ),

  // ---- Level 3: document metadata ------------------------------------------------------------
  /** Per uploaded document, in upload order: what it is. */
  documents: z.array(
    z.object({
      index: z.number().int(),
      document_type: z.enum(DOCUMENT_TYPES),
      title_as_printed: z.string().nullable(),
      pages: z.number().int().nullable(),
    }),
  ),
  certificate_no: text,
  document_ref: text,
  issued_on: text,
  registrar_name: text,
  issuing_office: text,
  objectives_count: number,
});

export type DbdExtractionOutput = z.infer<typeof dbdExtractionSchema>;

/** Field groups, used by the review UI to lay the form out in the three levels. */
export const EXTRACTION_LEVELS = {
  identity: [
    'company_name_th',
    'company_name_en',
    'juristic_id',
    'registered_on',
    'registered_capital',
    'directors',
    'signing_authority',
    'head_office_address',
    'province',
  ],
  business: ['objectives', 'business_categories', 'share_structure', 'shareholders', 'promoters'],
  document: [
    'documents',
    'certificate_no',
    'document_ref',
    'issued_on',
    'registrar_name',
    'issuing_office',
    'objectives_count',
  ],
} as const;

/** Stored extractions predate the provenance fields; fill what is missing before parsing. */
export function normalizeStoredExtraction(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  const emptyField = {
    value: null,
    confidence: 0,
    source_text: null,
    source_page: null,
    source_document: null,
  };
  const fieldKeys = [
    ...EXTRACTION_LEVELS.identity,
    ...EXTRACTION_LEVELS.business,
    ...EXTRACTION_LEVELS.document.filter((k) => k !== 'documents'),
  ];
  for (const key of fieldKeys) {
    const current = out[key];
    if (!current || typeof current !== 'object') {
      out[key] = { ...emptyField };
      continue;
    }
    out[key] = { source_page: null, source_document: null, ...(current as object) };
  }
  if (!Array.isArray(out.documents)) out.documents = [];
  return out;
}

export const EXTRACTION_INSTRUCTIONS = `You are reading Thai Department of Business Development (DBD) company documents, uploaded as one or more PDFs
(possibly scanned, possibly with an English translation attached). Read the Thai original; use a translation only to
confirm. Extract every field exactly as printed and classify each uploaded document.

The documents you may see and what each one supplies:
- หนังสือรับรอง (company certificate/affidavit): company name (item 1), directors (item 2), signing authority
  (item 3), registered capital (item 4), head office address (item 5), number of objectives (item 6); header:
  certificate number, registration office, registration date, 13-digit juristic id; footer: issue date
  (ออกให้ ณ วันที่), Registrar's name; the reference number (Ref:/เลขที่อ้างอิง) printed near the QR code.
- วัตถุที่ประสงค์ (objectives sheet attached to the certificate): the numbered list of business objectives.
- บัญชีรายชื่อผู้ถือหุ้น (บอจ.5, shareholder list): total shares, par value, paid-up capital, each shareholder with
  nationality, number of shares (and percentage if printed).
- หนังสือบริคณห์สนธิ (บอจ.2, memorandum of association): the promoters (ผู้เริ่มก่อการ) with nationality, initial
  share structure.
- ข้อบังคับ (articles of association) or anything else: classify as "articles" / "other".

Rules:
- Never invent a value. If a field is not present in ANY uploaded document, return value null (or an empty list)
  with confidence 0.
- Dates: copy the printed date. Keep Buddhist Era years as printed (e.g. 13/07/2569); do not convert.
- issued_on is the certificate's issue date at the bottom of the certificate, NOT the company registration date.
- registered_on is the juristic person registration date (จดทะเบียน).
- juristic_id is the 13-digit juristic person registration number.
- registered_capital, total_shares, par_value, paid_up_capital: numeric amounts without separators.
- province: the province (จังหวัด) of the head office, as printed in the address.
- directors: one entry per director; name_en only if an English name is printed.
- objectives: every numbered objective as printed on the objectives sheet (Thai text), in order.
- business_categories: short Thai labels summarising what kinds of business the objectives cover (e.g. "ค้าปลีก",
  "นำเข้า-ส่งออก", "บริการให้คำปรึกษา"), at most 10; empty when no objectives are readable.
- documents: one entry per uploaded PDF, in upload order (index starts at 1), with its type and printed title.
- confidence: 1.0 when the value is printed unambiguously, lower when inferred, OCR-uncertain or partially legible.
- source_text: the exact printed snippet the value came from; source_page: the 1-based page within the document;
  source_document: the 1-based index of the uploaded PDF.`;

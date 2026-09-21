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

// ---- API-facing schema ----------------------------------------------------------------------
// Structured outputs cap union-typed parameters (16) and the size of the compiled grammar. The
// stored schema above wraps every field in a provenance object with nullable members — far too
// big to send. The model therefore returns a flat, union-free shape: plain values (empty sentinels
// "" / 0 / [] when not printed) plus one compact `provenance` list; `fromApiExtraction` rebuilds
// the stored three-level shape.
export const PROVENANCE_FIELDS = [
  'company_name_th',
  'company_name_en',
  'juristic_id',
  'registered_on',
  'registered_capital',
  'directors',
  'signing_authority',
  'head_office_address',
  'province',
  'objectives',
  'business_categories',
  'share_structure',
  'shareholders',
  'promoters',
  'certificate_no',
  'document_ref',
  'issued_on',
  'registrar_name',
  'issuing_office',
  'objectives_count',
] as const;
export type ProvenanceField = (typeof PROVENANCE_FIELDS)[number];

export const dbdExtractionApiSchema = z.object({
  company_name_th: z.string(),
  company_name_en: z.string(),
  juristic_id: z.string(),
  registered_on: z.string(),
  registered_capital: z.number(),
  /** name_en "" when not printed. */
  directors: z.array(z.object({ name_th: z.string(), name_en: z.string() })),
  signing_authority: z.string(),
  head_office_address: z.string(),
  province: z.string(),
  /** no 0 when the item is not numbered. */
  objectives: z.array(z.object({ no: z.number().int(), text: z.string() })),
  business_categories: z.array(z.string()),
  /** 0 / "" when a figure is not printed. */
  share_structure: z.object({
    total_shares: z.number(),
    par_value: z.number(),
    paid_up_capital: z.number(),
    share_type: z.string(),
  }),
  /** nationality "" and shares/percent 0 when not printed. */
  shareholders: z.array(
    z.object({
      name: z.string(),
      nationality: z.string(),
      shares: z.number(),
      percent: z.number(),
    }),
  ),
  promoters: z.array(z.object({ name: z.string(), nationality: z.string() })),
  /** title_as_printed "" and pages 0 when unknown. */
  documents: z.array(
    z.object({
      index: z.number().int(),
      document_type: z.enum(DOCUMENT_TYPES),
      title_as_printed: z.string(),
      pages: z.number().int(),
    }),
  ),
  certificate_no: z.string(),
  document_ref: z.string(),
  issued_on: z.string(),
  registrar_name: z.string(),
  issuing_office: z.string(),
  objectives_count: z.number(),
  /** One entry per field that was actually read; fields without an entry are absent. */
  provenance: z.array(
    z.object({
      field: z.enum(PROVENANCE_FIELDS),
      confidence: z.number().min(0).max(1),
      /** "" when there is no printed snippet. */
      source_text: z.string(),
      /** 1-based page inside the source document; 0 when unknown. */
      source_page: z.number().int(),
      /** 1-based index of the uploaded document; 0 when unknown. */
      source_document: z.number().int(),
    }),
  ),
});

export type DbdExtractionApi = z.infer<typeof dbdExtractionApiSchema>;

const textOrNull = (s: string) => (s.trim() === '' ? null : s);
const numberOrNull = (n: number) => (n === 0 ? null : n);
const intOrNull = (n: number) => (n > 0 ? n : null);

/** The model's flat, union-free answer → the stored three-level shape (nulls for everything absent). */
export function fromApiExtraction(api: DbdExtractionApi): DbdExtractionOutput {
  const provenance = new Map(api.provenance.map((p) => [p.field, p]));
  const wrap = <T>(field: ProvenanceField, value: T | null) => {
    const p = provenance.get(field);
    const present = value !== null && (!Array.isArray(value) || value.length > 0);
    return {
      value: present ? value : null,
      confidence: present && p ? p.confidence : 0,
      source_text: present && p ? textOrNull(p.source_text) : null,
      source_page: present && p ? intOrNull(p.source_page) : null,
      source_document: present && p ? intOrNull(p.source_document) : null,
    };
  };
  const share = api.share_structure;
  const shareValue = {
    total_shares: numberOrNull(share.total_shares),
    par_value: numberOrNull(share.par_value),
    paid_up_capital: numberOrNull(share.paid_up_capital),
    share_type: textOrNull(share.share_type),
  };
  const shareEmpty = Object.values(shareValue).every((v) => v === null);
  return {
    company_name_th: wrap('company_name_th', textOrNull(api.company_name_th)),
    company_name_en: wrap('company_name_en', textOrNull(api.company_name_en)),
    juristic_id: wrap('juristic_id', textOrNull(api.juristic_id)),
    registered_on: wrap('registered_on', textOrNull(api.registered_on)),
    registered_capital: wrap('registered_capital', numberOrNull(api.registered_capital)),
    directors: wrap(
      'directors',
      api.directors.map((d) => ({ name_th: d.name_th, name_en: textOrNull(d.name_en) })),
    ),
    signing_authority: wrap('signing_authority', textOrNull(api.signing_authority)),
    head_office_address: wrap('head_office_address', textOrNull(api.head_office_address)),
    province: wrap('province', textOrNull(api.province)),
    objectives: wrap(
      'objectives',
      api.objectives.map((o) => ({ no: intOrNull(o.no), text: o.text })),
    ),
    business_categories: wrap('business_categories', api.business_categories),
    share_structure: wrap('share_structure', shareEmpty ? null : shareValue),
    shareholders: wrap(
      'shareholders',
      api.shareholders.map((sh) => ({
        name: sh.name,
        nationality: textOrNull(sh.nationality),
        shares: numberOrNull(sh.shares),
        percent: numberOrNull(sh.percent),
      })),
    ),
    promoters: wrap(
      'promoters',
      api.promoters.map((p) => ({ name: p.name, nationality: textOrNull(p.nationality) })),
    ),
    documents: api.documents.map((d) => ({
      index: d.index,
      document_type: d.document_type,
      title_as_printed: textOrNull(d.title_as_printed),
      pages: intOrNull(d.pages),
    })),
    certificate_no: wrap('certificate_no', textOrNull(api.certificate_no)),
    document_ref: wrap('document_ref', textOrNull(api.document_ref)),
    issued_on: wrap('issued_on', textOrNull(api.issued_on)),
    registrar_name: wrap('registrar_name', textOrNull(api.registrar_name)),
    issuing_office: wrap('issuing_office', textOrNull(api.issuing_office)),
    objectives_count: wrap('objectives_count', numberOrNull(api.objectives_count)),
  };
}

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
- Never invent a value. If a field is not present in ANY uploaded document, return it empty ("" for text, 0 for
  numbers, [] for lists) and give it no provenance entry.
- Inside lists and objects use "" for a text that is not printed and 0 for a number that is not printed (e.g. an
  unnumbered objective has no 0, a shareholder without a printed percentage has percent 0).
- provenance: one entry per field you actually read — {field, confidence, source_text, source_page, source_document}.
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
- In provenance: source_text is the exact printed snippet the value came from ("" if none); source_page the 1-based
  page within the document and source_document the 1-based index of the uploaded PDF (0 for either when unknown).`;

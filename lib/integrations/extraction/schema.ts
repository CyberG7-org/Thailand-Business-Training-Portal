import { z } from 'zod';

const field = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value.nullable(),
    confidence: z.number().min(0).max(1),
    source_text: z.string().nullable(),
  });

const text = field(z.string());
const number = field(z.number());

/** The structured output the model must return for a DBD certificate (spec §11). */
export const dbdExtractionSchema = z.object({
  juristic_id: text,
  certificate_no: text,
  document_ref: text,
  company_name_th: text,
  company_name_en: text,
  /** Dates as printed (Buddhist or Common Era, DD/MM/YYYY or YYYY-MM-DD); normalized later. */
  registered_on: text,
  issued_on: text,
  registered_capital: number,
  head_office_address: text,
  signing_authority: text,
  objectives_count: number,
  issuing_office: text,
  registrar_name: text,
  directors: field(
    z.array(
      z.object({
        name_th: z.string(),
        name_en: z.string().nullable(),
      }),
    ),
  ),
});

export type DbdExtractionOutput = z.infer<typeof dbdExtractionSchema>;

export const EXTRACTION_INSTRUCTIONS = `You are reading a Thai Department of Business Development (DBD) company certificate (หนังสือรับรอง), possibly with an English translation attached.
Extract every field exactly as printed. Rules:
- Never invent a value. If a field is not present, return value null with confidence 0.
- Dates: copy the printed date. Keep Buddhist Era years as printed (e.g. 13/07/2569); do not convert.
- issued_on is the certificate's "Issued on" / ออกให้ ณ วันที่ date (bottom of the certificate), NOT the company registration date.
- registered_on is the juristic person registration date (จดทะเบียน).
- juristic_id is the 13-digit juristic person registration number.
- registered_capital is the numeric amount in Baht without separators.
- directors: one entry per director; name_en only if an English name is printed.
- confidence: 1.0 when the value is printed unambiguously, lower when inferred, OCR-uncertain or partially legible.
- source_text: the exact printed snippet the value came from.`;

import { missingBusinessAnswers, type InterviewProfile } from './bank-interview';
import { z } from 'zod';
import { parseDateInput } from './thai-date';

export type Director = { name_th: string; name_en: string | null };

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(500).nullable().default(null));

/** Accepts DD/MM/YYYY (BE or CE) or YYYY-MM-DD; stores CE ISO dates. */
const dateInput = z.preprocess(
  emptyToNull,
  z
    .string()
    .transform((v, ctx) => {
      const iso = parseDateInput(v);
      if (!iso) {
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid date. Use DD/MM/YYYY (BE or CE) or YYYY-MM-DD.',
        });
        return z.NEVER;
      }
      return iso;
    })
    .nullable()
    .default(null),
);

const numberInput = (integer: boolean) =>
  z.preprocess(
    emptyToNull,
    z
      .union([z.string(), z.number()])
      .transform((v, ctx) => {
        const n = typeof v === 'number' ? v : Number(v.replace(/,/g, '').trim());
        if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) {
          ctx.addIssue({
            code: 'custom',
            message: integer ? 'Must be a whole number' : 'Must be a non-negative number',
          });
          return z.NEVER;
        }
        return n;
      })
      .nullable()
      .default(null),
  );

export const directorSchema = z.object({
  name_th: z.string().trim().min(1),
  name_en: z.preprocess(emptyToNull, z.string().trim().nullable().default(null)),
});

export const dbdRecordInputSchema = z
  .object({
    juristic_id: z.preprocess(
      emptyToNull,
      z
        .string()
        .trim()
        .regex(/^\d{13}$/, 'Juristic ID must be 13 digits')
        .nullable()
        .default(null),
    ),
    certificate_no: optionalText,
    document_ref: optionalText,
    company_name_th: optionalText,
    company_name_en: optionalText,
    registered_on: dateInput,
    issued_on: dateInput,
    registered_capital: numberInput(false),
    head_office_address: optionalText,
    province: optionalText,
    signing_authority: optionalText,
    objectives_count: numberInput(true),
    issuing_office: optionalText,
    registrar_name: optionalText,
    directors: z.array(directorSchema).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.issued_on && v.registered_on && v.issued_on < v.registered_on) {
      ctx.addIssue({
        code: 'custom',
        path: ['issued_on'],
        message: 'Issued-on date cannot be before the registration date',
      });
    }
  });

export type DbdRecordInput = z.output<typeof dbdRecordInputSchema>;

/** One director per line: "Thai name | English name" (English part optional). */
export function parseDirectorsText(text: string): Director[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [th = '', en] = line.split('|').map((s) => s.trim());
      return { name_th: th, name_en: en ? en : null };
    });
}

export function directorsToText(directors: Director[]): string {
  return directors.map((d) => (d.name_en ? `${d.name_th} | ${d.name_en}` : d.name_th)).join('\n');
}

export const CONFIRMATION_REQUIRED_FIELDS = ['juristic_id', 'company_name_th'] as const;

/**
 * Everything that must be in place before a record may be confirmed: the two certificate facts
 * the document supplies, and the four answers only the manager can write (owner, 2026-09-24).
 * The interview profile is a required argument so no caller can forget to weigh it.
 */
export function missingFieldsForConfirmation(
  record: Pick<DbdRecordInput, (typeof CONFIRMATION_REQUIRED_FIELDS)[number]>,
  interview: InterviewProfile | null,
): string[] {
  return [
    ...CONFIRMATION_REQUIRED_FIELDS.filter((f) => !record[f]),
    ...missingBusinessAnswers(interview),
  ];
}

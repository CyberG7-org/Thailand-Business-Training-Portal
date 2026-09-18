import {
  dbdRecordInputSchema,
  directorsToText,
  parseDirectorsText,
  type DbdRecordInput,
} from './dbd-record';
import { normalizeYear, parseDateInput, type ISODate } from './thai-date';
import {
  EXTRACTION_NUMBER_FIELDS,
  EXTRACTION_TEXT_FIELDS,
  type DbdExtraction,
} from '@/lib/integrations/extraction/types';

export const LOW_CONFIDENCE_THRESHOLD = 0.8;
const DATE_FIELDS = new Set(['registered_on', 'issued_on']);
const DMY_YEAR = /(\d{4})\s*$/;
const ISO_YEAR = /^(\d{4})-/;

export type DateNote = { raw: string; iso: ISODate | null; wasBe: boolean };

export type ExtractionSuggestions = {
  /** Form field name → string value ready for an input's defaultValue (dates as CE ISO). */
  values: Record<string, string>;
  /** Field names whose confidence is below the threshold (only fields with a value). */
  lowConfidence: string[];
  /** Field → the printed date, its CE reading, and whether the printed year was Buddhist Era. */
  dateNotes: Record<string, DateNote>;
  /** Field → confidence for display. */
  confidence: Record<string, number>;
};

function printedYear(raw: string): number | null {
  const m = ISO_YEAR.exec(raw.trim()) ?? DMY_YEAR.exec(raw.trim());
  return m ? Number(m[1]) : null;
}

/** Turns an extraction into form defaults; never fabricates — missing values become empty strings. */
export function extractionToFormValues(extraction: DbdExtraction): ExtractionSuggestions {
  const values: Record<string, string> = {};
  const lowConfidence: string[] = [];
  const dateNotes: Record<string, DateNote> = {};
  const confidence: Record<string, number> = {};

  const note = (field: string, conf: number, hasValue: boolean) => {
    confidence[field] = conf;
    if (hasValue && conf < LOW_CONFIDENCE_THRESHOLD) lowConfidence.push(field);
  };

  for (const field of EXTRACTION_TEXT_FIELDS) {
    const { value, confidence: conf } = extraction[field];
    if (DATE_FIELDS.has(field) && value) {
      const iso = parseDateInput(value);
      const year = printedYear(value);
      dateNotes[field] = { raw: value, iso, wasBe: year !== null && normalizeYear(year).wasBe };
      values[field] = iso ?? value;
    } else {
      values[field] = value ?? '';
    }
    note(field, conf, value !== null);
  }
  for (const field of EXTRACTION_NUMBER_FIELDS) {
    const { value, confidence: conf } = extraction[field];
    values[field] = value === null ? '' : String(value);
    note(field, conf, value !== null);
  }
  const directors = extraction.directors;
  values.directors_text = directors.value ? directorsToText(directors.value) : '';
  note(
    'directors_text',
    directors.confidence,
    directors.value !== null && directors.value.length > 0,
  );

  return { values, lowConfidence, dateNotes, confidence };
}

/** Form-shaped view of a stored record: every column as the string the form would show. */
export type RecordFormValues = Record<string, string>;

export type ExtractionPatch = {
  /** Validated input to store (record values kept where present, extraction filling the gaps). */
  input: DbdRecordInput;
  /** Fields the extraction filled. */
  applied: string[];
  /** Fields the extraction offered but whose value failed validation (kept empty). */
  rejected: string[];
};

/**
 * Fills the record's empty fields from an extraction (decision D37). Existing values always win,
 * each extracted value is validated on its own, and anything invalid is dropped rather than
 * failing the whole fill — the admin sees what was filled and still confirms explicitly.
 */
export function applyExtractionToRecord(
  extraction: DbdExtraction,
  current: RecordFormValues,
): ExtractionPatch {
  const suggestions = extractionToFormValues(extraction);
  const isEmpty = (v: string | undefined) => v === undefined || v.trim() === '';
  const candidates = Object.entries(suggestions.values).filter(
    ([field, value]) => !isEmpty(value) && isEmpty(current[field]),
  );
  const rejected: string[] = [];
  let applied = candidates.map(([field]) => field);

  for (let attempt = 0; attempt <= candidates.length; attempt++) {
    const merged: Record<string, string> = { ...current };
    for (const [field, value] of candidates) if (applied.includes(field)) merged[field] = value;
    const parsed = dbdRecordInputSchema.safeParse({
      ...merged,
      directors: parseDirectorsText(merged.directors_text ?? ''),
    });
    if (parsed.success) return { input: parsed.data, applied, rejected };
    const bad = parsed.error.issues
      .map((issue) => String(issue.path[0] ?? ''))
      .map((f) => (f === 'directors' ? 'directors_text' : f))
      .filter((f) => applied.includes(f));
    if (bad.length === 0) break; // the record's own values are invalid; nothing more to drop
    applied = applied.filter((f) => !bad.includes(f));
    rejected.push(...bad.filter((f) => !rejected.includes(f)));
  }
  const parsed = dbdRecordInputSchema.safeParse({
    ...current,
    directors: parseDirectorsText(current.directors_text ?? ''),
  });
  if (!parsed.success) throw new Error('Record values are invalid; fix them before extracting');
  return { input: parsed.data, applied: [], rejected: candidates.map(([f]) => f) };
}

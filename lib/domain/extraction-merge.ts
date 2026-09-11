import { directorsToText } from './dbd-record';
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

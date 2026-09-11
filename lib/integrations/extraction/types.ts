import type { Director } from '@/lib/domain/dbd-record';

/** One extracted value with the model's confidence and the text it was read from. */
export type ExtractedField<T> = {
  value: T | null;
  /** 0–1; fields below 0.8 are highlighted for the admin (spec §11). */
  confidence: number;
  source_text: string | null;
};

export const EXTRACTION_TEXT_FIELDS = [
  'juristic_id',
  'certificate_no',
  'document_ref',
  'company_name_th',
  'company_name_en',
  'registered_on',
  'issued_on',
  'head_office_address',
  'signing_authority',
  'issuing_office',
  'registrar_name',
] as const;
export const EXTRACTION_NUMBER_FIELDS = ['registered_capital', 'objectives_count'] as const;

export type ExtractionTextField = (typeof EXTRACTION_TEXT_FIELDS)[number];
export type ExtractionNumberField = (typeof EXTRACTION_NUMBER_FIELDS)[number];

export type DbdExtraction = Record<ExtractionTextField, ExtractedField<string>> &
  Record<ExtractionNumberField, ExtractedField<number>> & {
    directors: ExtractedField<Director[]>;
  };

export interface DbdExtractor {
  readonly name: string;
  extract(pdf: Uint8Array): Promise<DbdExtraction>;
}

export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly code:
      'not_configured' | 'provider' | 'invalid_output' | 'no_document' | 'not_allowed',
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

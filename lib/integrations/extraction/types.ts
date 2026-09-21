import type { Director } from '@/lib/domain/dbd-record';
import type { Slice, TranscribedPage } from '@/lib/domain/rag/transcript';
import type { DbdExtractionOutput } from './schema';
import type { DocumentType, SweepResult } from './transcript-schema';

/** One extracted value with the model's confidence and where it was read (decision D38). */
export type ExtractedField<T> = {
  value: T | null;
  /** 0–1; fields below 0.8 are highlighted for the admin (spec §11). */
  confidence: number;
  source_text: string | null;
  source_page: number | null;
  source_document: number | null;
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
  'province',
  'signing_authority',
  'issuing_office',
  'registrar_name',
] as const;
export const EXTRACTION_NUMBER_FIELDS = ['registered_capital', 'objectives_count'] as const;

export type ExtractionTextField = (typeof EXTRACTION_TEXT_FIELDS)[number];
export type ExtractionNumberField = (typeof EXTRACTION_NUMBER_FIELDS)[number];

/** The full three-level extraction; the flat text/number fields are typed for the merge code. */
export type DbdExtraction = DbdExtractionOutput &
  Record<ExtractionTextField, ExtractedField<string>> &
  Record<ExtractionNumberField, ExtractedField<number>> & {
    directors: ExtractedField<Director[]>;
  };

export interface DbdExtractor {
  readonly name: string;
  /** All of a record's uploaded documents, in upload order. */
  extract(documents: Uint8Array[]): Promise<DbdExtraction>;
  /**
   * Page-by-page transcript of one slice of a document (P14, decision D41). `slice` is a PDF
   * holding only pages `range.firstPage..lastPage`; pages come back numbered as in the original.
   * Throws `MissingPagesError` when the model skipped a page.
   */
  transcribe(slice: Uint8Array, range: Slice): Promise<TranscribedPage[]>;
  /** Document kind from its first transcribed page (P14c); "other" when unsure. */
  classify(firstPageText: string): Promise<DocumentType>;
  /** Level 1/3 particulars (+ directors) from retrieved passages; list fields stay empty. */
  extractFacts(passages: TranscriptPassage[]): Promise<DbdExtraction>;
  /** Level 2 list rows printed on a batch of consecutive pages of one document. */
  sweep(pages: TranscribedPage[], documentType: DocumentType): Promise<SweepResult>;
}

/** A transcript passage handed to the facts call, labelled for provenance. */
export type TranscriptPassage = { documentPosition: number; page: number; text: string };

export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not_configured'
      | 'provider'
      | 'invalid_output'
      | 'no_document'
      | 'not_allowed'
      | 'too_large'
      /** Nothing small enough to read whole; the transcript path fills the record when its index is ready. */
      | 'deferred',
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

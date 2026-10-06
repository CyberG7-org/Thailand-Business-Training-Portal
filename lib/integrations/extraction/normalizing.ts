import { normalizeThaiDeep } from '@/lib/domain/thai-text';
import type { DbdExtractor } from './types';

/**
 * Whatever a reader returns — particulars, transcripts, list rows — comes back with its Thai
 * text as a keyboard would type it. A PDF's text layer spells the same words with other
 * characters (`lib/domain/thai-text.ts`), and a reader that copies it would otherwise hand them
 * to every screen, comparison and question after it.
 */
export function withThaiNormalization(inner: DbdExtractor): DbdExtractor {
  return {
    name: inner.name,
    extract: async (documents) => normalizeThaiDeep(await inner.extract(documents)),
    transcribe: async (slice, range) => normalizeThaiDeep(await inner.transcribe(slice, range)),
    classify: (firstPageText) => inner.classify(firstPageText),
    extractFacts: async (passages) => normalizeThaiDeep(await inner.extractFacts(passages)),
    sweep: async (pages, documentType) => normalizeThaiDeep(await inner.sweep(pages, documentType)),
    readInvoices: async (documents) => normalizeThaiDeep(await inner.readInvoices(documents)),
    describeBusiness: async (input) => normalizeThaiDeep(await inner.describeBusiness(input)),
  };
}

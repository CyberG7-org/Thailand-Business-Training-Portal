import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { EXTRACTION_INSTRUCTIONS, dbdExtractionSchema } from './schema';
import { ExtractionError, type DbdExtraction, type DbdExtractor } from './types';

const MODEL = 'claude-opus-5';
/** Request ceiling for document content (the API rejects larger payloads). */
export const MAX_TOTAL_PDF_BYTES = 30 * 1024 * 1024;

/**
 * Real extractor: every uploaded document travels as its own document block, in upload order,
 * so `source_document` in the output refers to that order (decision D38).
 */
export class ClaudeDbdExtractor implements DbdExtractor {
  readonly name = 'claude';
  private readonly client: Anthropic;

  constructor(client: Anthropic = new Anthropic()) {
    this.client = client;
  }

  async extract(documents: Uint8Array[]): Promise<DbdExtraction> {
    if (documents.length === 0) throw new ExtractionError('No documents to read', 'no_document');
    const total = documents.reduce((n, d) => n + d.byteLength, 0);
    if (total > MAX_TOTAL_PDF_BYTES) {
      throw new ExtractionError('The uploaded documents exceed 30 MB in total', 'too_large');
    }
    const content: Anthropic.ContentBlockParam[] = documents.flatMap((pdf, i) => [
      { type: 'text' as const, text: `Document ${i + 1} of ${documents.length}:` },
      {
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: 'application/pdf' as const,
          data: Buffer.from(pdf).toString('base64'),
        },
      },
    ]);
    content.push({ type: 'text', text: EXTRACTION_INSTRUCTIONS });

    let response;
    try {
      response = await this.client.messages.parse({
        model: MODEL,
        max_tokens: 24000,
        messages: [{ role: 'user', content }],
        output_config: { format: zodOutputFormat(dbdExtractionSchema) },
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        throw new ExtractionError('Anthropic API key is missing or invalid', 'not_configured');
      }
      if (error instanceof Anthropic.APIError) {
        throw new ExtractionError(
          `Anthropic API error ${error.status}: ${error.message}`,
          'provider',
        );
      }
      throw new ExtractionError(error instanceof Error ? error.message : String(error), 'provider');
    }
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new ExtractionError('The model did not return a valid extraction', 'invalid_output');
    }
    return response.parsed_output as DbdExtraction;
  }
}

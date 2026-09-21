import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { parsePageMarkers, type Slice, type TranscribedPage } from '@/lib/domain/rag/transcript';
import { EXTRACTION_INSTRUCTIONS, dbdExtractionApiSchema, fromApiExtraction } from './schema';
import { transcriptionModel, transcriptionPrompt } from './transcribe';
import { ExtractionError, type DbdExtraction, type DbdExtractor } from './types';

const MODEL = 'claude-opus-5';
/** Request ceiling for document content (the API rejects larger payloads). */
export const MAX_TOTAL_PDF_BYTES = 30 * 1024 * 1024;
/** Output ceiling per slice; a transcript that hits it is refused rather than stored truncated. */
const TRANSCRIPTION_MAX_TOKENS = 32000;
/** A transcription call that has not finished by then is treated as a failed attempt. */
export const TRANSCRIPTION_TIMEOUT_MS = 150_000;

/** Maps SDK failures to ExtractionError codes (shared by extract and transcribe). */
function toExtractionError(error: unknown): ExtractionError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new ExtractionError('Anthropic API key is missing or invalid', 'not_configured');
  }
  if (error instanceof Anthropic.APIError) {
    return new ExtractionError(`Anthropic API error ${error.status}: ${error.message}`, 'provider');
  }
  return new ExtractionError(error instanceof Error ? error.message : String(error), 'provider');
}

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
      // Streamed: the SDK refuses non-streaming requests this long (max_tokens ≥ ~21k).
      response = await this.client.messages
        .stream({
          model: MODEL,
          max_tokens: 24000,
          messages: [{ role: 'user', content }],
          output_config: { format: zodOutputFormat(dbdExtractionApiSchema) },
        })
        .finalMessage();
    } catch (error) {
      throw toExtractionError(error);
    }
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new ExtractionError('The model did not return a valid extraction', 'invalid_output');
    }
    return fromApiExtraction(response.parsed_output) as DbdExtraction;
  }

  async transcribe(slice: Uint8Array, range: Slice): Promise<TranscribedPage[]> {
    let message;
    try {
      // Streaming keeps long Thai transcripts clear of request timeouts.
      message = await this.client.messages
        .stream(
          {
            model: transcriptionModel(),
            max_tokens: TRANSCRIPTION_MAX_TOKENS,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'document',
                    source: {
                      type: 'base64',
                      media_type: 'application/pdf',
                      data: Buffer.from(slice).toString('base64'),
                    },
                  },
                  { type: 'text', text: transcriptionPrompt(range) },
                ],
              },
            ],
          },
          { timeout: TRANSCRIPTION_TIMEOUT_MS },
        )
        .finalMessage();
    } catch (error) {
      throw toExtractionError(error);
    }
    if (message.stop_reason === 'max_tokens') {
      throw new ExtractionError(
        `Transcript of pages ${range.firstPage}–${range.lastPage} exceeded the output limit; lower TRANSCRIBE_SLICE_PAGES`,
        'too_large',
      );
    }
    if (message.stop_reason === 'refusal') {
      throw new ExtractionError('The model refused to transcribe this slice', 'invalid_output');
    }
    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    return parsePageMarkers(text, range);
  }
}

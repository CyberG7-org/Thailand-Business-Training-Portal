import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { EXTRACTION_INSTRUCTIONS, dbdExtractionSchema } from './schema';
import { ExtractionError, type DbdExtraction, type DbdExtractor } from './types';

const MODEL = 'claude-opus-5';

/** Real extractor: Claude reads the PDF as a document block and returns structured output. */
export class ClaudeDbdExtractor implements DbdExtractor {
  readonly name = 'claude';
  private readonly client: Anthropic;

  constructor(client: Anthropic = new Anthropic()) {
    this.client = client;
  }

  async extract(pdf: Uint8Array): Promise<DbdExtraction> {
    let response;
    try {
      response = await this.client.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: Buffer.from(pdf).toString('base64'),
                },
              },
              { type: 'text', text: EXTRACTION_INSTRUCTIONS },
            ],
          },
        ],
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
    return response.parsed_output;
  }
}

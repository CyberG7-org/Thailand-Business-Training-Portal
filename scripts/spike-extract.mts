// Spike S4: run the real Claude extractor on a certificate PDF and print the fields.
// Usage: node scripts/spike-extract.mts "<path to certificate.pdf>"
// Needs ANTHROPIC_API_KEY in the environment (or in .env.local). The PDF itself is never stored.
import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { config } from 'dotenv';
import {
  EXTRACTION_INSTRUCTIONS,
  dbdExtractionSchema,
} from '../lib/integrations/extraction/schema.ts';

config({ path: '.env.local' });

const path = process.argv[2];
if (!path) {
  console.error('Usage: node scripts/spike-extract.mts <certificate.pdf>');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set. Add it to .env.local and retry.');
  process.exit(1);
}

const client = new Anthropic();
const started = Date.now();
const response = await client.messages.parse({
  model: 'claude-opus-5',
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
            data: readFileSync(path).toString('base64'),
          },
        },
        { type: 'text', text: EXTRACTION_INSTRUCTIONS },
      ],
    },
  ],
  output_config: { format: zodOutputFormat(dbdExtractionSchema) },
});

if (!response.parsed_output) {
  console.error('No parsed output. stop_reason =', response.stop_reason);
  process.exit(2);
}
const out = response.parsed_output;
console.log(`Extracted in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`Tokens: in=${response.usage.input_tokens} out=${response.usage.output_tokens}`);
for (const [field, entry] of Object.entries(out)) {
  const value = Array.isArray(entry.value) ? JSON.stringify(entry.value) : entry.value;
  const flag = entry.confidence < 0.8 ? '  <-- low confidence' : '';
  console.log(
    `${field.padEnd(22)} ${String(value).padEnd(48)} ${entry.confidence.toFixed(2)}${flag}`,
  );
}

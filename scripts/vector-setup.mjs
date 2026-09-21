// Creates the Pinecone integrated-embedding index once per project (idempotent). Reads .env.local.
import { config } from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';

config({ path: '.env.local' });
const apiKey = process.env.PINECONE_API_KEY;
if (!apiKey) {
  console.error('PINECONE_API_KEY is not set');
  process.exit(1);
}
const name = process.env.PINECONE_INDEX || 'thai-portal-dbd';
const region = process.env.PINECONE_REGION || 'us-east-1';
const pc = new Pinecone({ apiKey });
const created = await pc.indexes.createForModel({
  name,
  cloud: 'aws',
  region,
  embed: { model: 'multilingual-e5-large', fieldMap: { text: 'chunk_text' } },
  waitUntilReady: true,
  suppressConflicts: true,
});
const model = created ?? (await pc.indexes.describe(name));
console.log(
  `index ${name} ready at ${model.host} (${region}); namespace per environment via PINECONE_NAMESPACE`,
);

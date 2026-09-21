// Opt-in check against the real index: upsert two synthetic chunks in a throwaway namespace,
// search, then delete them. No company data involved.
import { config } from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';

config({ path: '.env.local' });
if (!process.env.PINECONE_API_KEY) {
  console.error('PINECONE_API_KEY is not set');
  process.exit(1);
}
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.index({
  name: process.env.PINECONE_INDEX || 'thai-portal-dbd',
  namespace: `smoke-${Date.now()}`,
});
const ids = ['smoke#1#0', 'smoke#2#0'];
await index.upsertRecords({
  records: [
    {
      _id: ids[0],
      chunk_text: 'ทุนจดทะเบียน 1,000,000 บาท',
      record_id: 'smoke',
      document_id: 'smoke',
      document_type: 'certificate',
      page: 1,
      chunk_index: 0,
    },
    {
      _id: ids[1],
      chunk_text: 'วัตถุที่ประสงค์ ประกอบกิจการค้าปลีก',
      record_id: 'smoke',
      document_id: 'smoke',
      document_type: 'objectives_sheet',
      page: 2,
      chunk_index: 0,
    },
  ],
});
// Serverless indexes are eventually consistent; give the upsert a moment.
await new Promise((r) => setTimeout(r, 10_000));
const res = await index.searchRecords({
  query: {
    topK: 2,
    inputs: { text: 'ทุนจดทะเบียนเท่าไร' },
    filter: { record_id: { $eq: 'smoke' } },
  },
  fields: ['chunk_text', 'page'],
  rerank: { model: 'bge-reranker-v2-m3', rankFields: ['chunk_text'], topN: 1 },
});
console.log(JSON.stringify(res.result.hits, null, 2));
await index.deleteAll();
const ok = res.result.hits[0]?.fields?.page === 1;
console.log(ok ? 'smoke OK' : 'smoke FAILED: page 1 expected first');
process.exit(ok ? 0 : 1);

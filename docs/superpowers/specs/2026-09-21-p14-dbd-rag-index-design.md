# P14 — DBD packs as a retrieval index (RAG on upload)

| | |
|---|---|
| Builds on | P12 three-level extraction (D37/D38), P11 AI question authoring (D33–D36), P13 bank-interview concepts (D39) |
| Requested by | owner (2026-09-21): "for uploading the DBD, let's use the RAG method … the input will be PDFs and does contain lots of pages"; vector store: **Pinecone** |
| Status | Implemented (P14a index pipeline, P14b retrieval consumers, P14c oversized documents) |

## 1. Why

A Claude request carries at most 32 MB and 100 pages, and every page costs 1,500–3,000 tokens plus an image. Today the extractor sends the whole pack in one request and the question generator re-attaches the reference PDF on every batch. Both stop working around 100 pages and get expensive long before. With a retrieval index the pack is read **once, in small slices**; every later use — extraction of big documents, quiz/exam generation, the learner's evidence, admin questions — retrieves only the few passages it needs, each with its page.

## 2. Outcome

- A DBD pack of any size (hundreds of pages, several PDFs) can be uploaded; nothing sends a whole pack to one model call.
- Small documents keep the instant direct read (fields appear on upload, D37). Oversized documents fill their fields when their index is ready, with the same "empty fields only" rule.
- "Generate with AI", the bank-interview study cards and a new admin **Ask the documents** box work from page-cited passages of the learner's/reference record.
- No key → fake provider; unit, integration and e2e suites run without Pinecone or Anthropic, as for every other adapter.

## 3. Pinecone facts that shape the design (docs, 2026-09-21)

| Fact | Consequence |
|---|---|
| Integrated embedding: the index embeds text on upsert with a hosted model; `multilingual-e5-large` (1024-d, ≤ 507 tokens, covers Thai) | No separate embedding vendor; chunks are sized for ~500 e5 tokens |
| Hosted reranker `bge-reranker-v2-m3` (multilingual) via `searchRecords({ rerank })` | Retrieval = dense search top 12 → rerank → top 4 |
| Starter plan: AWS `us-east-1` only, 100 namespaces per index; Singapore (`ap-southeast-1`) needs the Builder plan | **One namespace per environment** (`PINECONE_NAMESPACE`: `staging` / `production`), records separated by a `record_id` metadata filter. Region is the owner's plan decision; the code takes it from `PINECONE_REGION` |
| Serverless deletes by ID list (≤ 1,000 per call) or whole namespace, not by metadata filter | Chunk IDs are deterministic (`<document_id>#<page>#<n>`) and mirrored in Postgres, so removing a document/record removes exactly its vectors |
| Upsert batch ≤ 96 text records; 40 KB metadata per record | Chunks ≤ ~4 KB of text; upserts in batches of 96 |

## 4. Data model (migration 0015)

```
dbd_documents            + page_count integer, index_status text ('none'|'queued'|'indexing'|'ready'|'failed'|'skipped'),
                           indexed_pages integer default 0, index_error text
dbd_pages                (document_id, page) → text, transcribed_at, model      -- page transcripts, source of truth
dbd_chunks               id text pk (= vector id), record_id, document_id, page, chunk_index, chunk_text, char_count, created_at
index_jobs               id, record_id, document_id, kind ('index'|'reindex'), status ('queued'|'running'|'done'|'failed'),
                           next_page, attempts, locked_until, last_error, created_at, updated_at
questions                + source_refs jsonb   -- [{document_id, document_name, document_type, page}] for AI-generated questions
```

RLS: the three new tables are admin-read, service-role-write; learners never read them directly (evidence goes through a server action with the ownership check, D18). `claim_index_jobs(p_limit)` is a security-definer function with execute granted to `service_role` only (same revoke pattern as `claim_notifications`, migration 0012). `dbd_pages` / `dbd_chunks` cascade from `dbd_documents`.

## 5. Pipeline on upload

1. **Upload** (existing) stores the PDF and creates the `dbd_documents` row; new: `page_count` from `pdf-lib`. Documents ≤ `DIRECT_READ_MAX_PAGES` (default 20) go through the existing direct extraction pass exactly as today, taken in upload order while their cumulative size stays within the 30 MB request budget. Every other document (too many pages, or beyond the byte budget) is excluded from that pass and gets its fields from §6 once indexed.
2. **Every document** (small or large) gets an `index_jobs` row. The job is drained by a new cron route `/api/cron/index` (every minute, `CRON_SECRET`, `maxDuration = 300`) using the leased-claim pattern of the notification queue: claim → work → release/advance; 5 attempts with backoff; admin **Retry** / **Re-index** buttons.
3. **Slices.** One worker run processes slices of `TRANSCRIBE_SLICE_PAGES` (default 5) pages until fewer than 90 s of budget remain, then releases the job with `next_page` advanced. A slice is built with `pdf-lib` (copy pages *p..p+4* into a fresh PDF, ≤ 100 pages / 32 MB always holds) and sent to the transcriber.
4. **Transcriber** = new method `DbdExtractor.transcribe(slice, firstPage)` on the extraction adapter (`EXTRACTION_PROVIDER` governs claude/fake). Plain-text output with `=== PAGE n ===` markers (no JSON: fewer tokens, no escaping of Thai, streaming-friendly), Thai preserved verbatim, tables as one row per line, stamps/signatures noted as `[ตราประทับ]`. Streaming request (`stream()` + `finalMessage()`), model `TRANSCRIPTION_MODEL` (default `claude-sonnet-5` for speed; Opus stays the extractor). A slice whose markers do not cover every requested page is retried once, then the job fails with `last_error`.
5. **Persist + chunk + upsert** per slice: `dbd_pages` upsert; chunker (§5.1) → `dbd_chunks` rows → `vector.index(chunks)` in batches of 96. `indexed_pages` advances; the record page shows *indexing 15/200*. When `next_page > page_count` → `index_status = 'ready'`, and if the document was oversized, §6 runs.
6. **Classification** of an oversized document (`document_type`) comes from its first slice's transcript with the existing classification instructions; small documents keep the type the direct pass assigned.

### 5.1 Chunker (`lib/domain/rag/chunk.ts`, pure)

- Chunks never cross a page. Within a page, split at numbered items (`1.`, `๒.`, `(3)`), table rows and blank lines; merge pieces up to **1,000 characters**; pieces longer than that are cut at the last sentence/space boundary with **100-character overlap**.
- Each chunk: `{ id, record_id, document_id, document_type, page, chunk_index, chunk_text }`; `id = <document_id>#<page>#<chunk_index>`.
- Idempotent: re-running a page produces the same ids, so re-index overwrites instead of duplicating; the job first deletes the page's previous ids when `char_count` differs.

## 6. Extraction for oversized documents (transcript path)

Runs when an oversized document becomes `ready`, and from **Read the document again**; fills empty fields only (D37) and refreshes provenance with `{document, page, confidence}` taken from the passages used.

| Target | Method |
|---|---|
| Level 1 + Level 3 single facts (name, juristic id, capital, registration date, address, province, certificate no., issue date, registrar, office) | Retrieval: one Thai query per field group (e.g. `ทุนจดทะเบียน`, `ที่ตั้งสำนักงานใหญ่`, `ออกให้ ณ วันที่`) → top passages → one structured-output call with the existing `dbdExtractionSchema` restricted to those levels |
| Level 2 lists — shareholders (บอจ.5), objectives (หนังสือบริคณห์สนธิ / objectives sheet), directors | **Typed sweep**: iterate the transcript pages of documents typed `shareholder_list` / `objectives_sheet` / `certificate` in batches of 10 pages → structured output for that list only → concatenate, de-duplicate (name + nationality), keep row order |
| Share structure (total shares, par value) | Retrieval query, same call as Level 1 |

The direct path and the transcript path share `applyExtractionToRecord`; nothing the admin typed is ever overwritten.

**As implemented (P14c, after review — D42):** the transcript path is a resumable `transcript` job on the same queue (queued when an oversized document becomes ready, and by *Read the document again*), not an inline call: sweep batches are cached in `dbd_sweeps`, each list is taken only from the document kind authoritative for it (the บอจ.2's subscriber table never becomes the shareholder list), lists are validated and capped before storing, and every write is conditional (still-empty field, unconfirmed record, `updated_at` compare-and-swap). Directors come from the retrieval call rather than a certificate sweep.

## 7. Vector adapter (`lib/integrations/vector/`)

```ts
interface VectorStore {
  readonly name: 'pinecone' | 'fake' | 'off';
  index(chunks: Chunk[]): Promise<void>;                       // upsert, batches of 96
  search(q: { recordId: string; query: string; topK?: number; documentTypes?: DocumentType[] }): Promise<Passage[]>;
  removeDocument(documentId: string, ids: string[]): Promise<void>;
  removeRecord(recordId: string, ids: string[]): Promise<void>;
}
type Passage = { id: string; documentId: string; documentType; page: number; text: string; score: number };
```

- `VECTOR_PROVIDER=pinecone|fake|off`; default `pinecone` when `PINECONE_API_KEY` is set, otherwise `fake` in development and `off` in production (same rule as every adapter). `/api/health` reports `vector`.
- **Pinecone**: `PINECONE_INDEX` (default `thai-portal-dbd`), `PINECONE_NAMESPACE` (`staging`/`production`), `PINECONE_REGION` (default `us-east-1`). `pnpm vector:setup` creates the index if missing (`createIndexForModel`, model `multilingual-e5-large`, `fieldMap: { text: 'chunk_text' }`) and waits until ready. Search: `searchRecords` top 12 filtered by `record_id` (and `document_type` when given), `rerank: { model: 'bge-reranker-v2-m3', rankFields: ['chunk_text'], topN: topK }`. Errors surface as `VectorError` with a code (`unavailable`, `too_large`, `unauthorized`).
- **Fake**: reads the record's `dbd_chunks` from Postgres and scores by Thai character-trigram overlap with the query — deterministic, so e2e/CI need no key. `off`: every consumer falls back (§8) and the record page says indexing is off.
- Provider `off` in production without a key is reported by health, and upload keeps working (direct path only; oversized documents show `skipped`).

## 8. Consumers

| Where | Behaviour | Fallback when no index |
|---|---|---|
| **Generate with AI** (quiz/exam) | For each of the four concept groups (D39) retrieve top 4 passages of the reference record; passages with `[document · page]` replace the whole-PDF block in the prompt. Each generated question stores `source_refs`; the review list shows "หนังสือรับรอง · หน้า 1". D34/D36 validation unchanged | Reference PDF attached as today only if ≤ 20 pages, else particulars only |
| **Study cards** (bank-interview cards) | **"From your documents"** panel: for the card's concepts, top 3 passages from the learner's *own* active record with page labels. Server action with ownership check; no other record is ever queried | Panel hidden |
| **Ask the documents** (admin, record page) | Question → top 5 passages → short Claude answer grounded only in those passages, with citations; passages listed under the answer. Doubles as an extraction checker | Box disabled with a hint |
| **Call script** | Unchanged (facts are variables). Mid-call lookup via a Vapi tool is a later slice | — |

The answer synthesis uses the same Anthropic resolution as question generation (`claude` when `ANTHROPIC_API_KEY`, `fake` in dev returning the top passage, `off` in prod).

## 9. Stages (each merged when green)

1. **P14a — index pipeline**: migration 0015, `pdf-lib`, transcriber, chunker, jobs + cron, vector adapter (Pinecone + fake), record-page status/retry/re-index, deletion propagation, `vector:setup`, health, Ask the documents.
2. **P14b — retrieval consumers**: question generator passages + `source_refs` + review list, learner evidence panel.
3. **P14c — oversized documents**: exclusion from the direct pass, transcript-path extraction (retrieval + typed sweeps), classification from the first slice, e2e with `DIRECT_READ_MAX_PAGES=1`.

## 10. Privacy, security, operations

- Chunk text — names, ID numbers, addresses — is stored at **Pinecone (US region on the Starter plan)**: a new processor, recorded in the decisions log and `docs/security-checklist.md`. `PINECONE_API_KEY` is server-only. Deleting a document or record deletes its vectors first, then the rows.
- The transcripts stay in Postgres under RLS (admin-only); learners only ever see passages of their own record.
- Costs (order of magnitude, verify against current price lists): transcription ≈ 3–5k input + ~1.5k output tokens per page → a 200-page pack ≈ US$5–8 once; e5 embedding and reranking are cents; Pinecone Starter covers the pilot.
- Ops: `Admin → DBD records` list shows index status per record; `index_jobs` failures show `last_error`; runbook section "Index stuck / re-index all".

## 11. Tests

- **Unit**: chunker (Thai text, numbered items, overlap, ids, idempotence), page-marker parser, slice planner, fake scoring, transcript-path merge rules.
- **Integration** (local Supabase, fake providers): job claim/lease/backoff, per-slice progress and `ready`, `dbd_pages`/`dbd_chunks` rows, fake search filtered by record, delete propagation, typed-sweep de-duplication, RLS on the new tables and the claim function grant.
- **E2E** (fake transcriber returns canned Thai pages): upload → *indexing* → *ready* → Generate with AI shows source pages → learner card shows "From your documents" → Ask the documents answers with a page; oversized path with `DIRECT_READ_MAX_PAGES=1`.
- **Opt-in** `pnpm vector:smoke` exercises the real Pinecone index with a synthetic record and cleans up.

## 12. Decisions

- **D40** Pinecone integrated index (`multilingual-e5-large`, `bge-reranker-v2-m3`), one namespace per environment, `record_id` metadata filter, deterministic chunk ids mirrored in `dbd_chunks`.
- **D41** Packs are read once in 5-page slices by a cron job; page transcripts in `dbd_pages` are the source of truth, chunks never cross pages.
- **D42** Documents ≤ 20 pages keep the direct read; larger ones are extracted from transcripts (retrieval for single facts, typed sweeps for lists), always empty-fields-only.
- **D43** Question generation retrieves passages per concept group instead of attaching the PDF; every AI question carries `source_refs`.
- **D44** Learners see passages of their own record only ("From your documents"); admins get Ask the documents.

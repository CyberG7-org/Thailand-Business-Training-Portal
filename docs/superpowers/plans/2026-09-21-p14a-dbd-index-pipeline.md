# P14a — DBD Index Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every uploaded DBD PDF is read once in 5-page slices by a background job, its page transcripts are stored in Postgres, its chunks are indexed in Pinecone (or a fake store), and the admin can ask the documents a question and get a page-cited answer.

**Architecture:** Upload computes the page count and enqueues an `index_jobs` row. A cron route (`/api/cron/index`, every minute) claims one job at a time, slices the PDF with `pdf-lib`, sends each slice to the extraction adapter's new `transcribe()` (Claude, streaming plain text with `=== PAGE n ===` markers; fake returns canned Thai pages), persists `dbd_pages` + `dbd_chunks`, and upserts the chunks into a `VectorStore` adapter (`pinecone` | `fake` | `off`). Retrieval goes through `searchRecordPassages()`; "Ask the documents" answers only from retrieved passages. Stages P14b (question generator + learner evidence) and P14c (oversized-document extraction) build on these interfaces and get their own plans.

**Tech Stack:** Next.js 16 App Router (server actions, route handlers), Supabase Postgres (RLS, security-definer claim function), `@pinecone-database/pinecone@^9.0.0` (integrated embedding `multilingual-e5-large`, reranker `bge-reranker-v2-m3`), `pdf-lib@^1.17.1`, `@anthropic-ai/sdk` (`messages.stream().finalText()`), Vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-21-p14-dbd-rag-index-design.md` (sections 3–5, 7, 8 "Ask the documents", 10, 11; stage 1 of §9).

## Global Constraints

- Pinecone: one namespace per environment (`PINECONE_NAMESPACE`, default `dev`), records separated by a `record_id` metadata filter; chunk ids `<document_id>#<page>#<chunk_index>`; upsert batches ≤ 96; delete batches ≤ 1,000; metadata ≤ 40 KB (chunks ≤ 1,000 characters). Index name `PINECONE_INDEX` (default `thai-portal-dbd`), region `PINECONE_REGION` (default `us-east-1`), model `multilingual-e5-large`, field map `{ text: 'chunk_text' }`, rerank `bge-reranker-v2-m3` over `chunk_text`.
- Provider rule (same as every adapter): `VECTOR_PROVIDER=pinecone|fake|off`; default `pinecone` when `PINECONE_API_KEY` is set, otherwise `fake` outside production and `off` in production. `/api/health` reports it as `vector`.
- Transcription: slices of `TRANSCRIBE_SLICE_PAGES` (default 5) pages; model `TRANSCRIPTION_MODEL` (default `claude-sonnet-5`); plain text with `=== PAGE n ===` markers; a slice missing a page is retried once, then the job fails with `last_error`. Cron route `maxDuration = 300`, work budget 240 s per run, `CRON_SECRET` bearer auth like `/api/cron/notifications`. 5 attempts with backoff 1, 2, 4, 8, 16 minutes.
- Chunker: chunks never cross a page; ≤ 1,000 characters; 100-character overlap when a piece is cut; split at numbered items / blank lines; deterministic and idempotent.
- Data: `dbd_pages`, `dbd_chunks` admin-read + service-role-write; `index_jobs` admins do everything; `claim_index_jobs(p_limit)` executable by `service_role` only (revoke from `public, anon, authenticated`). Deleting a document deletes its vectors first, then the row (pages/chunks cascade).
- Fake vector store scores by Thai character-trigram overlap over `dbd_chunks` rows — unit, integration and e2e suites run without any key. Playwright forces `VECTOR_PROVIDER=fake`.
- No real DBD PDF ever enters the repo (`*.pdf` ignored except `tests/fixtures/*.pdf`, which are generated, text-only fixtures). PII note: chunk text goes to Pinecone (spec §10) — record in the decisions log + security checklist.
- Node ≥ 22 (Pinecone SDK); Vercel project must run Node 22.x. `pnpm`, Prettier, ESLint, `pnpm typecheck` must stay clean; commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Review Focus

1. **Unreadable/encrypted PDF upload** — the upload must still succeed; the document shows `failed` with `index_error = 'unreadable_pdf'` and no job is queued (test in Task 9).
2. **Model returns fewer page markers than requested** — one retry, then the job records `last_error` and backs off; a persistent miss ends in `failed` after 5 attempts, never an infinite loop (test in Task 8).
3. **Two workers claim at once** (overlapping cron runs) — `for update skip locked` + lease: both calls return disjoint jobs (test in Task 8).
4. **Re-index produces fewer chunks on a page** — stale vector ids are removed from the store and the rows; no orphan chunks (test in Task 8).
5. **A page with no spaces or item boundaries (one 5,000-character line)** — chunks stay ≤ 1,000 characters with a 100-character overlap, never one oversized chunk that Pinecone would reject (test in Task 3).

---

### Task 1: Transcript domain — slices and page markers (pure)

**Files:**
- Create: `lib/domain/rag/transcript.ts`
- Create: `lib/domain/rag/jobs.ts`
- Test: `tests/unit/domain/rag-transcript.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Slice = { firstPage: number; lastPage: number }`, `type TranscribedPage = { page: number; text: string }`, `DEFAULT_SLICE_PAGES = 5`, `planSlice(pageCount, nextPage, slicePages?) → Slice | null`, `parsePageMarkers(text, slice) → TranscribedPage[]` (throws `MissingPagesError` with `.missing: number[]`), `formatPageMarkers(pages) → string`, `MAX_INDEX_ATTEMPTS = 5`, `retryDelayMinutes(attempt) → number`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/domain/rag-transcript.test.ts
import { describe, expect, it } from 'vitest';
import { MAX_INDEX_ATTEMPTS, retryDelayMinutes } from '@/lib/domain/rag/jobs';
import {
  MissingPagesError,
  formatPageMarkers,
  parsePageMarkers,
  planSlice,
} from '@/lib/domain/rag/transcript';

describe('planSlice', () => {
  it('walks a document in slices of five pages', () => {
    expect(planSlice(12, 1)).toEqual({ firstPage: 1, lastPage: 5 });
    expect(planSlice(12, 6)).toEqual({ firstPage: 6, lastPage: 10 });
    expect(planSlice(12, 11)).toEqual({ firstPage: 11, lastPage: 12 });
  });
  it('returns null once every page is done or the document is empty', () => {
    expect(planSlice(12, 13)).toBeNull();
    expect(planSlice(0, 1)).toBeNull();
  });
  it('honours a custom slice size', () => {
    expect(planSlice(3, 1, 2)).toEqual({ firstPage: 1, lastPage: 2 });
  });
});

describe('parsePageMarkers', () => {
  const slice = { firstPage: 4, lastPage: 6 };
  it('splits a transcript on its page markers, trimming each page', () => {
    const text = 'preamble to ignore\n=== PAGE 4 ===\nหน้าสี่\n\n=== PAGE 5 ===\n  หน้าห้า  \n=== PAGE 6 ===\n';
    expect(parsePageMarkers(text, slice)).toEqual([
      { page: 4, text: 'หน้าสี่' },
      { page: 5, text: 'หน้าห้า' },
      { page: 6, text: '' },
    ]);
  });
  it('lists every missing page', () => {
    expect(() => parsePageMarkers('=== PAGE 4 ===\nx\n=== PAGE 6 ===\ny', slice)).toThrow(
      MissingPagesError,
    );
    try {
      parsePageMarkers('=== PAGE 4 ===\nx', slice);
    } catch (e) {
      expect((e as MissingPagesError).missing).toEqual([5, 6]);
    }
  });
  it('keeps the first occurrence of a duplicated marker and ignores pages outside the slice', () => {
    const text = '=== PAGE 3 ===\nno\n=== PAGE 4 ===\nfirst\n=== PAGE 4 ===\nsecond\n=== PAGE 5 ===\nb\n=== PAGE 6 ===\nc';
    expect(parsePageMarkers(text, slice)[0]).toEqual({ page: 4, text: 'first' });
  });
  it('round-trips formatPageMarkers', () => {
    const pages = [
      { page: 1, text: 'ก' },
      { page: 2, text: 'ข\nค' },
    ];
    expect(parsePageMarkers(formatPageMarkers(pages), { firstPage: 1, lastPage: 2 })).toEqual(pages);
  });
});

describe('index job retries', () => {
  it('backs off 1, 2, 4, 8, 16 minutes and stops after five attempts', () => {
    expect([1, 2, 3, 4, 5].map(retryDelayMinutes)).toEqual([1, 2, 4, 8, 16]);
    expect(retryDelayMinutes(9)).toBe(16);
    expect(MAX_INDEX_ATTEMPTS).toBe(5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/rag-transcript.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/rag/transcript`.

- [ ] **Step 3: Implement the domain modules**

```ts
// lib/domain/rag/jobs.ts
/** Index jobs give up after this many failed attempts (decision D41). */
export const MAX_INDEX_ATTEMPTS = 5;

/** Minutes to wait after failed attempt n: 1, 2, 4, 8, 16. */
export function retryDelayMinutes(attempt: number): number {
  return Math.min(2 ** Math.max(0, attempt - 1), 16);
}
```

```ts
// lib/domain/rag/transcript.ts
/** A contiguous page range of one document, 1-based and inclusive. */
export type Slice = { firstPage: number; lastPage: number };
export type TranscribedPage = { page: number; text: string };

/** Pages per transcription call (decision D41): small enough for the function budget. */
export const DEFAULT_SLICE_PAGES = 5;

/** The next slice to read, or null when every page is done. */
export function planSlice(
  pageCount: number,
  nextPage: number,
  slicePages = DEFAULT_SLICE_PAGES,
): Slice | null {
  if (pageCount < 1 || nextPage > pageCount) return null;
  const firstPage = Math.max(1, nextPage);
  return { firstPage, lastPage: Math.min(pageCount, firstPage + slicePages - 1) };
}

export class MissingPagesError extends Error {
  constructor(public readonly missing: number[]) {
    super(`Transcript is missing page(s) ${missing.join(', ')}`);
    this.name = 'MissingPagesError';
  }
}

const MARKER = /^[ \t]*=== PAGE (\d+) ===[ \t]*$/gm;

export function formatPageMarkers(pages: TranscribedPage[]): string {
  return pages.map((p) => `=== PAGE ${p.page} ===\n${p.text}`).join('\n');
}

/**
 * Splits a transcript on `=== PAGE n ===` markers. Every page of the slice must be present
 * (a blank page is its marker followed by nothing); text before the first marker is ignored,
 * a duplicated marker keeps its first occurrence.
 */
export function parsePageMarkers(text: string, slice: Slice): TranscribedPage[] {
  const matches = [...text.matchAll(MARKER)];
  const found = new Map<number, string>();
  matches.forEach((m, i) => {
    const page = Number(m[1]);
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    if (page >= slice.firstPage && page <= slice.lastPage && !found.has(page)) {
      found.set(page, text.slice(start, end).trim());
    }
  });
  const missing: number[] = [];
  const pages: TranscribedPage[] = [];
  for (let page = slice.firstPage; page <= slice.lastPage; page++) {
    const body = found.get(page);
    if (body === undefined) missing.push(page);
    else pages.push({ page, text: body });
  }
  if (missing.length > 0) throw new MissingPagesError(missing);
  return pages;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/rag-transcript.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/rag tests/unit/domain/rag-transcript.test.ts
git commit -m "feat(p14): transcript slices, page markers and retry policy (pure domain)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: PDF page helpers (`pdf-lib`), dependencies and the multi-page fixture

**Files:**
- Modify: `package.json` (dependencies + `fixtures:pdf` script)
- Create: `scripts/make-fixture-pdf.mjs`
- Create: `tests/fixtures/three-pages.pdf` (generated, committed — allowed by `.gitignore`)
- Create: `lib/pdf/slice.ts`
- Test: `tests/unit/pdf/slice.test.ts`

**Interfaces:**
- Consumes: `Slice` from Task 1.
- Produces: `countPages(bytes: Uint8Array) → Promise<number>`, `slicePdf(bytes: Uint8Array, slice: Slice) → Promise<Uint8Array>`.

- [ ] **Step 1: Add the dependencies**

Run: `pnpm add @pinecone-database/pinecone@^9.0.0 pdf-lib@^1.17.1`
Expected: both appear under `dependencies` in `package.json`; `pnpm-lock.yaml` updated.

- [ ] **Step 2: Generate the fixture**

```js
// scripts/make-fixture-pdf.mjs
// Generates tests/fixtures/three-pages.pdf: three text-only pages, no real data.
import { writeFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 3; i++) {
  const page = doc.addPage([595, 842]);
  page.drawText(`Fixture page ${i} of 3`, { x: 50, y: 780, size: 18, font });
}
writeFileSync('tests/fixtures/three-pages.pdf', await doc.save());
console.log('tests/fixtures/three-pages.pdf written');
```

Add to `package.json` scripts: `"fixtures:pdf": "node scripts/make-fixture-pdf.mjs"`.
Run: `pnpm fixtures:pdf`
Expected: `tests/fixtures/three-pages.pdf` exists (~1 KB); `git status` shows it as untracked (not ignored).

- [ ] **Step 3: Write the failing test**

```ts
// tests/unit/pdf/slice.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countPages, slicePdf } from '@/lib/pdf/slice';

const fixture = new Uint8Array(readFileSync('tests/fixtures/three-pages.pdf'));

describe('pdf slicing', () => {
  it('counts the pages of a PDF', async () => {
    expect(await countPages(fixture)).toBe(3);
  });

  it('copies a page range into a new PDF, clamped to the document', async () => {
    expect(await countPages(await slicePdf(fixture, { firstPage: 2, lastPage: 3 }))).toBe(2);
    expect(await countPages(await slicePdf(fixture, { firstPage: 3, lastPage: 9 }))).toBe(1);
  });

  it('rejects bytes that are not a PDF', async () => {
    await expect(countPages(new TextEncoder().encode('not a pdf'))).rejects.toThrow();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/pdf/slice.test.ts`
Expected: FAIL — cannot resolve `@/lib/pdf/slice`.

- [ ] **Step 5: Implement the helpers**

```ts
// lib/pdf/slice.ts
import { PDFDocument } from 'pdf-lib';
import type { Slice } from '@/lib/domain/rag/transcript';

const LOAD = { ignoreEncryption: true, updateMetadata: false } as const;

/** Page count of a PDF; throws for bytes that are not a PDF. */
export async function countPages(bytes: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(bytes, LOAD);
  return doc.getPageCount();
}

/** A new PDF holding pages firstPage..lastPage of the original (clamped to the document). */
export async function slicePdf(bytes: Uint8Array, slice: Slice): Promise<Uint8Array> {
  const source = await PDFDocument.load(bytes, LOAD);
  const out = await PDFDocument.create();
  const last = Math.min(slice.lastPage, source.getPageCount());
  const indices: number[] = [];
  for (let page = Math.max(1, slice.firstPage); page <= last; page++) indices.push(page - 1);
  const pages = await out.copyPages(source, indices);
  for (const page of pages) out.addPage(page);
  return out.save();
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/pdf/slice.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml scripts/make-fixture-pdf.mjs tests/fixtures/three-pages.pdf lib/pdf/slice.ts tests/unit/pdf/slice.test.ts
git commit -m "feat(p14): pdf page count and page-range slicing; three-page fixture

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Chunker (pure)

**Files:**
- Create: `lib/domain/rag/chunk.ts`
- Test: `tests/unit/domain/rag-chunk.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CHUNK_MAX_CHARS = 1000`, `CHUNK_OVERLAP_CHARS = 100`, `type ChunkInput = { recordId; documentId; documentType: string | null; page; text }`, `type Chunk = { id; recordId; documentId; documentType; page; chunkIndex; text }`, `chunkId(documentId, page, chunkIndex) → string`, `chunkPage(input) → Chunk[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/domain/rag-chunk.test.ts
import { describe, expect, it } from 'vitest';
import { CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS, chunkId, chunkPage } from '@/lib/domain/rag/chunk';

const base = { recordId: 'rec-1', documentId: 'doc-1', documentType: 'certificate', page: 2 };
const thai = (n: number) => 'ประกอบกิจการค้าปลีกและค้าส่งสินค้าอุปโภคบริโภค '.repeat(n).trim();

describe('chunkPage', () => {
  it('returns nothing for a blank page', () => {
    expect(chunkPage({ ...base, text: '  \n ' })).toEqual([]);
  });

  it('merges short numbered items up to the limit and starts a new chunk when full', () => {
    const items = [1, 2, 3].map((n) => `${n}. ${thai(8)}`); // ~400 characters each
    const chunks = chunkPage({ ...base, text: items.join('\n') });
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text.startsWith('1. ')).toBe(true);
    expect(chunks[0].text).toContain('\n2. ');
    expect(chunks[1].text.startsWith('3. ')).toBe(true);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });

  it('numbers chunks deterministically with page-scoped ids', () => {
    const chunks = chunkPage({ ...base, text: `1. ${thai(8)}\n2. ${thai(8)}\n3. ${thai(8)}` });
    expect(chunks.map((c) => c.id)).toEqual([chunkId('doc-1', 2, 0), chunkId('doc-1', 2, 1)]);
    expect(chunks[1]).toMatchObject({ ...base, chunkIndex: 1 });
    expect(chunkId('doc-1', 2, 1)).toBe('doc-1#2#1');
  });

  it('cuts a boundary-less 5,000-character line into overlapping chunks under the limit', () => {
    const text = 'ก'.repeat(5000);
    const chunks = chunkPage({ ...base, text });
    expect(chunks.length).toBeGreaterThanOrEqual(5);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
    expect(chunks[1].text.slice(0, CHUNK_OVERLAP_CHARS)).toBe(
      chunks[0].text.slice(-CHUNK_OVERLAP_CHARS),
    );
    expect(chunks.map((c) => c.text).join('').length).toBeGreaterThanOrEqual(5000);
  });

  it('prefers a space or newline boundary when cutting long prose', () => {
    const text = `${thai(12)}\n${thai(12)}\n${thai(12)}`; // ~1,800 characters, one paragraph
    const chunks = chunkPage({ ...base, text });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      expect(c.text.endsWith('บริโภค')).toBe(true); // cut between words, not inside one
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/rag-chunk.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/rag/chunk`.

- [ ] **Step 3: Implement the chunker**

```ts
// lib/domain/rag/chunk.ts
/** Chunk sizing for Pinecone's multilingual-e5-large (≤ ~500 tokens) — decision D41. */
export const CHUNK_MAX_CHARS = 1000;
export const CHUNK_OVERLAP_CHARS = 100;

export type ChunkInput = {
  recordId: string;
  documentId: string;
  documentType: string | null;
  page: number;
  text: string;
};

export type Chunk = ChunkInput & { id: string; chunkIndex: number };

/** Deterministic id: re-indexing a page overwrites instead of duplicating. */
export function chunkId(documentId: string, page: number, chunkIndex: number): string {
  return `${documentId}#${page}#${chunkIndex}`;
}

/** Lines that begin a new item: "1.", "๒)", "(3)", "ข้อ 4". Table rows already sit one per line. */
const ITEM_START = /^\s*(?:\(?[0-9๐-๙]{1,3}[.)]|ข้อ\s*[0-9๐-๙]+)\s/;

/** Splits a page into pieces at blank lines and item starts, keeping line breaks inside a piece. */
function pieces(text: string): string[] {
  const out: string[] = [];
  let current = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if ((line === '' || ITEM_START.test(line)) && current.trim() !== '') {
      out.push(current.trim());
      current = '';
    }
    if (line !== '') current += (current ? '\n' : '') + line;
  }
  if (current.trim() !== '') out.push(current.trim());
  return out;
}

/** Cuts an oversized piece at the last space/newline before the limit, repeating with overlap. */
function hardSplit(piece: string): string[] {
  if (piece.length <= CHUNK_MAX_CHARS) return [piece];
  const out: string[] = [];
  let start = 0;
  while (start < piece.length) {
    let end = Math.min(piece.length, start + CHUNK_MAX_CHARS);
    if (end < piece.length) {
      const window = piece.slice(start, end);
      const boundary = Math.max(window.lastIndexOf(' '), window.lastIndexOf('\n'));
      if (boundary > CHUNK_MAX_CHARS / 2) end = start + boundary;
    }
    out.push(piece.slice(start, end).trim());
    if (end >= piece.length) break;
    start = Math.max(end - CHUNK_OVERLAP_CHARS, start + 1);
  }
  return out.filter((s) => s.length > 0);
}

/** Chunks of one page: pieces merged up to the limit, long pieces cut with overlap. */
export function chunkPage(input: ChunkInput): Chunk[] {
  const merged: string[] = [];
  for (const piece of pieces(input.text).flatMap(hardSplit)) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.length + 1 + piece.length <= CHUNK_MAX_CHARS) {
      merged[merged.length - 1] = `${last}\n${piece}`;
    } else {
      merged.push(piece);
    }
  }
  return merged.map((text, chunkIndex) => ({
    id: chunkId(input.documentId, input.page, chunkIndex),
    recordId: input.recordId,
    documentId: input.documentId,
    documentType: input.documentType,
    page: input.page,
    chunkIndex,
    text,
  }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/rag-chunk.test.ts`
Expected: PASS (5 tests). If the boundary-less test's overlap assertion fails, check that `hardSplit` only moves `end` to a boundary when one exists past the half-way point — with no spaces it must fall back to the hard cut.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/rag/chunk.ts tests/unit/domain/rag-chunk.test.ts
git commit -m "feat(p14): page chunker with deterministic ids and overlap

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Trigram scoring for the fake vector store (pure)

**Files:**
- Create: `lib/domain/rag/score.ts`
- Test: `tests/unit/domain/rag-score.test.ts`

**Interfaces:**
- Produces: `trigrams(text) → Set<string>`, `trigramOverlap(query, text) → number` (0–1).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/domain/rag-score.test.ts
import { describe, expect, it } from 'vitest';
import { trigramOverlap, trigrams } from '@/lib/domain/rag/score';

describe('trigram scoring', () => {
  it('ignores case, spaces and punctuation', () => {
    expect(trigrams('ทุน จดทะเบียน.')).toEqual(trigrams('ทุนจดทะเบียน'));
    expect(trigrams('ABC')).toEqual(trigrams('abc'));
  });
  it('scores an exact phrase 1 and an unrelated one 0', () => {
    expect(trigramOverlap('ทุนจดทะเบียน', 'ทุนจดทะเบียน 2,000,000 บาท')).toBe(1);
    expect(trigramOverlap('ทุนจดทะเบียน', 'กรรมการบริษัท')).toBe(0);
    expect(trigramOverlap('', 'อะไรก็ได้')).toBe(0);
  });
  it('ranks the passage that contains the query above one that only shares a word', () => {
    const q = 'สำนักงานแห่งใหญ่ตั้งอยู่ที่ไหน';
    const a = 'สำนักงานแห่งใหญ่ ตั้งอยู่เลขที่ 99/9 หมู่ 1';
    const b = 'บริษัทมีวัตถุประสงค์เพื่อประกอบกิจการ';
    expect(trigramOverlap(q, a)).toBeGreaterThan(trigramOverlap(q, b));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/rag-score.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/rag/score`.

- [ ] **Step 3: Implement**

```ts
// lib/domain/rag/score.ts
const STRIP = /[\s​.,;:()[\]"'“”‘’\-–—/|]/g;

/** Character trigrams of the normalised text (Thai has no word spaces, so characters it is). */
export function trigrams(text: string): Set<string> {
  const s = text.normalize('NFC').toLowerCase().replace(STRIP, '');
  const out = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  return out;
}

/** Share of the query's trigrams present in the text, 0–1. Deterministic; the fake store's ranking. */
export function trigramOverlap(query: string, text: string): number {
  const q = trigrams(query);
  if (q.size === 0) return 0;
  const t = trigrams(text);
  let hits = 0;
  for (const g of q) if (t.has(g)) hits++;
  return hits / q.size;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/rag-score.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/domain/rag/score.ts tests/unit/domain/rag-score.test.ts
git commit -m "feat(p14): trigram overlap scoring for the fake vector store

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Migration 0015 — pages, chunks, jobs, claim function, grants

**Files:**
- Create: `supabase/migrations/20260921000015_dbd_index.sql`
- Modify: `lib/db/database.types.ts` (regenerated)
- Modify: `tests/integration/function-grants.test.ts` (add `claim_index_jobs` to the privileged list)
- Test: `tests/integration/dbd-index.rls.test.ts`

**Interfaces:**
- Produces tables `dbd_pages`, `dbd_chunks`, `index_jobs`; columns `dbd_documents.page_count | index_status | indexed_pages | index_error`; RPC `claim_index_jobs(p_limit integer) returns setof index_jobs` (service role only).

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260921000015_dbd_index.sql
-- P14: DBD packs as a retrieval index (decisions D40/D41). Page transcripts are the source of
-- truth; chunks mirror the vector store's records; index_jobs drive the sliced reading.

alter table public.dbd_documents
  add column page_count integer,
  add column index_status text not null default 'none'
    check (index_status in ('none', 'queued', 'indexing', 'ready', 'failed', 'skipped')),
  add column indexed_pages integer not null default 0,
  add column index_error text;

create table public.dbd_pages (
  document_id uuid not null references public.dbd_documents (id) on delete cascade,
  page integer not null check (page > 0),
  text text not null,
  model text,
  transcribed_at timestamptz not null default now(),
  primary key (document_id, page)
);

create table public.dbd_chunks (
  id text primary key,
  record_id uuid not null references public.dbd_records (id) on delete cascade,
  document_id uuid not null references public.dbd_documents (id) on delete cascade,
  document_type text,
  page integer not null,
  chunk_index integer not null,
  chunk_text text not null,
  char_count integer not null,
  created_at timestamptz not null default now()
);
create index dbd_chunks_record_idx on public.dbd_chunks (record_id, document_id, page);

create table public.index_jobs (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.dbd_records (id) on delete cascade,
  document_id uuid not null references public.dbd_documents (id) on delete cascade,
  kind text not null default 'index' check (kind in ('index', 'reindex')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  next_page integer not null default 1,
  attempts integer not null default 0,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index index_jobs_due_idx on public.index_jobs (status, locked_until, created_at);
-- One live job per document; retry/re-index reset it instead of queueing a second one.
create unique index index_jobs_one_live_per_document
  on public.index_jobs (document_id) where status in ('queued', 'running');

create trigger index_jobs_updated_at
  before update on public.index_jobs
  for each row execute function public.set_updated_at();

alter table public.dbd_pages enable row level security;
alter table public.dbd_chunks enable row level security;
alter table public.index_jobs enable row level security;

-- Transcripts and chunks: admins read, only the worker (service role) writes.
create policy "dbd pages: admins read" on public.dbd_pages
  for select to authenticated using (public.is_admin());
create policy "dbd chunks: admins read" on public.dbd_chunks
  for select to authenticated using (public.is_admin());
-- Jobs: admins queue, retry and re-index from the record page.
create policy "index jobs: admins do everything" on public.index_jobs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Leases due jobs for one worker run. A job whose lease expired while `running` counts as a
-- failed attempt (the previous run died); a `queued` continuation does not.
create or replace function public.claim_index_jobs(p_limit integer default 1)
returns setof public.index_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select id from public.index_jobs
    where status in ('queued', 'running')
      and (locked_until is null or locked_until <= now())
    order by created_at
    limit p_limit
    for update skip locked
  )
  update public.index_jobs j
     set status = 'running',
         attempts = j.attempts + (case when j.status = 'running' then 1 else 0 end),
         locked_until = now() + interval '10 minutes'
    from due
   where j.id = due.id
  returning j.*;
end;
$$;

revoke execute on function public.claim_index_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_index_jobs(integer) to service_role;
```

- [ ] **Step 2: Apply locally and regenerate the types**

Run: `pnpm db:reset && pnpm db:types && pnpm typecheck`
Expected: reset ends with "Finished supabase db reset"; `lib/db/database.types.ts` now contains `dbd_pages`, `dbd_chunks`, `index_jobs` and `claim_index_jobs`; typecheck clean. (`db:reset` wipes the local database; Playwright's global setup recreates the e2e users on the next run.)

- [ ] **Step 3: Write the failing RLS/grant tests**

Add `claim_index_jobs` to the privileged list in `tests/integration/function-grants.test.ts`:

```ts
      asLearner.rpc('claim_index_jobs', { p_limit: 1 }),
      anon.rpc('claim_index_jobs', { p_limit: 1 }),
```
(inside the existing `privileged` array, next to the `claim_notifications` entries — the test already asserts every entry errors).

```ts
// tests/integration/dbd-index.rls.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbdRecord } from '@/lib/db/dbd-records';
import { dbdRecordInputSchema } from '@/lib/domain/dbd-record';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

describe('index tables are invisible to learners and read-only for admins', () => {
  let admin: TestUser;
  let learner: TestUser;
  let asAdmin: Client;
  let asLearner: Client;
  let recordId: string;
  let documentId: string;

  beforeAll(async () => {
    [admin, learner] = await Promise.all([createTestUser('admin'), createTestUser('learner')]);
    [asAdmin, asLearner] = await Promise.all([clientFor(admin), clientFor(learner)]);
    recordId = (await createDbdRecord(asAdmin, dbdRecordInputSchema.parse({}), admin.id)).id;
    const svc = adminClient();
    const { data: doc, error } = await svc
      .from('dbd_documents')
      .insert({ record_id: recordId, path: `${recordId}/rls.pdf`, original_name: 'rls.pdf', size_bytes: 1, position: 1 })
      .select('id')
      .single();
    if (error) throw error;
    documentId = doc.id;
    const { error: chunkError } = await svc.from('dbd_chunks').insert({
      id: `${documentId}#1#0`,
      record_id: recordId,
      document_id: documentId,
      document_type: 'certificate',
      page: 1,
      chunk_index: 0,
      chunk_text: 'ทุนจดทะเบียน 2,000,000 บาท',
      char_count: 26,
    });
    if (chunkError) throw chunkError;
  });

  afterAll(async () => {
    await adminClient().from('dbd_records').delete().eq('id', recordId);
    await Promise.all([deleteTestUser(admin.id), deleteTestUser(learner.id)]);
  });

  it('hides chunks, pages and jobs from learners', async () => {
    const { data: chunks } = await asLearner.from('dbd_chunks').select('id');
    const { data: jobs } = await asLearner.from('index_jobs').select('id');
    expect(chunks).toEqual([]);
    expect(jobs).toEqual([]);
  });

  it('lets admins read chunks but not write them', async () => {
    const { data } = await asAdmin.from('dbd_chunks').select('id').eq('document_id', documentId);
    expect(data).toHaveLength(1);
    const { error } = await asAdmin
      .from('dbd_chunks')
      .insert({ id: `${documentId}#1#9`, record_id: recordId, document_id: documentId, page: 1, chunk_index: 9, chunk_text: 'x', char_count: 1 });
    expect(error?.code).toBe('42501');
  });

  it('cascades chunks when the document is deleted', async () => {
    await adminClient().from('dbd_documents').delete().eq('id', documentId);
    const { data } = await adminClient().from('dbd_chunks').select('id').eq('document_id', documentId);
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/dbd-index.rls.test.ts tests/integration/function-grants.test.ts`
Expected: PASS. (They pass right after the migration — this task's deliverable is the schema; the tests pin its policies.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260921000015_dbd_index.sql lib/db/database.types.ts tests/integration/dbd-index.rls.test.ts tests/integration/function-grants.test.ts
git commit -m "feat(p14): migration 0015 — dbd_pages, dbd_chunks, index_jobs, claim_index_jobs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Transcriber on the extraction adapter (Claude streaming + fake)

**Files:**
- Create: `lib/integrations/extraction/transcribe.ts`
- Modify: `lib/integrations/extraction/types.ts` (interface gains `transcribe`)
- Modify: `lib/integrations/extraction/claude.ts` (implement `transcribe`, share error mapping)
- Modify: `lib/integrations/extraction/fake.ts` (implement `transcribe`, export `fakePageText`)
- Modify: `tests/integration/extraction.test.ts` (the `failing` stub gains `transcribe`)
- Test: `tests/unit/integrations/transcribe.test.ts`

**Interfaces:**
- Consumes: `Slice`, `TranscribedPage`, `parsePageMarkers`, `formatPageMarkers` (Task 1).
- Produces: `DbdExtractor.transcribe(slice: Uint8Array, range: Slice): Promise<TranscribedPage[]>`, `transcriptionPrompt(range)`, `transcriptionModel(env?)`, `DEFAULT_TRANSCRIPTION_MODEL = 'claude-sonnet-5'`, `fakePageText(page)`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/integrations/transcribe.test.ts
import { describe, expect, it } from 'vitest';
import { formatPageMarkers, parsePageMarkers } from '@/lib/domain/rag/transcript';
import { FakeDbdExtractor, fakePageText } from '@/lib/integrations/extraction/fake';
import {
  DEFAULT_TRANSCRIPTION_MODEL,
  transcriptionModel,
  transcriptionPrompt,
} from '@/lib/integrations/extraction/transcribe';

describe('transcription prompt', () => {
  it('tells the model the original page numbers and the exact markers to emit', () => {
    const prompt = transcriptionPrompt({ firstPage: 6, lastPage: 8 });
    expect(prompt).toContain('page 6 of the original');
    expect(prompt).toContain('=== PAGE 6 ===, === PAGE 7 ===, === PAGE 8 ===');
    expect(prompt).toContain('verbatim');
  });
  it('uses Sonnet unless TRANSCRIPTION_MODEL overrides it', () => {
    expect(transcriptionModel({})).toBe(DEFAULT_TRANSCRIPTION_MODEL);
    expect(transcriptionModel({ TRANSCRIPTION_MODEL: 'claude-opus-5' })).toBe('claude-opus-5');
  });
});

describe('fake transcriber', () => {
  it('returns every page of the slice with fictional Thai text that survives the marker format', async () => {
    const pages = await new FakeDbdExtractor().transcribe(new Uint8Array(), { firstPage: 1, lastPage: 3 });
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(pages[0].text).toContain('ทุนจดทะเบียน 2,000,000 บาท');
    expect(pages[1].text).toMatch(/^วัตถุที่ประสงค์/);
    expect(pages[2].text).toContain('บอจ.5');
    expect(parsePageMarkers(formatPageMarkers(pages), { firstPage: 1, lastPage: 3 })).toEqual(pages);
    expect(fakePageText(7)).toContain('หน้า 7');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/integrations/transcribe.test.ts`
Expected: FAIL — cannot resolve `@/lib/integrations/extraction/transcribe`.

- [ ] **Step 3: Implement the prompt module and the interface**

```ts
// lib/integrations/extraction/transcribe.ts
import type { Slice } from '@/lib/domain/rag/transcript';

/** Fast, strong at reading scans; Opus stays the structured extractor (decision D41). */
export const DEFAULT_TRANSCRIPTION_MODEL = 'claude-sonnet-5';

export function transcriptionModel(env: Record<string, string | undefined> = process.env): string {
  return env.TRANSCRIPTION_MODEL || DEFAULT_TRANSCRIPTION_MODEL;
}

/** Plain-text transcript with page markers: fewer tokens than JSON and no escaping of Thai. */
export function transcriptionPrompt(range: Slice): string {
  const markers: string[] = [];
  for (let page = range.firstPage; page <= range.lastPage; page++) markers.push(`=== PAGE ${page} ===`);
  return [
    `This PDF holds pages ${range.firstPage}–${range.lastPage} of a Thai company-registration document pack (DBD, กรมพัฒนาธุรกิจการค้า). The first page of this PDF is page ${range.firstPage} of the original file.`,
    'Transcribe every page completely, in reading order, exactly as printed:',
    '- Keep the Thai text verbatim: spelling, numbers, Buddhist-era dates and punctuation. Do not translate, summarise or correct anything.',
    '- Write tables as one row per line with cells separated by " | ".',
    '- Note stamps, seals and signatures as [ตราประทับ] or [ลายมือชื่อ]; describe nothing else.',
    '- A blank or unreadable page still gets its marker, followed by [หน้าว่าง] or [อ่านไม่ออก].',
    `Start each page with a marker line of exactly === PAGE n === using the original page number. Output these markers in this order and nothing before the first one: ${markers.join(', ')}.`,
  ].join('\n');
}
```

In `lib/integrations/extraction/types.ts` add the imports and the method:

```ts
import type { Slice, TranscribedPage } from '@/lib/domain/rag/transcript';
// …
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
}
```

- [ ] **Step 4: Implement the Claude transcriber**

In `lib/integrations/extraction/claude.ts`:

```ts
import { parsePageMarkers, type Slice, type TranscribedPage } from '@/lib/domain/rag/transcript';
import { transcriptionModel, transcriptionPrompt } from './transcribe';
// …
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
```

Replace the `catch` block inside `extract` with `throw toExtractionError(error);` and add the method to the class:

```ts
  async transcribe(slice: Uint8Array, range: Slice): Promise<TranscribedPage[]> {
    let text: string;
    try {
      // Streaming keeps long Thai transcripts clear of request timeouts.
      text = await this.client.messages
        .stream({
          model: transcriptionModel(),
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
                    data: Buffer.from(slice).toString('base64'),
                  },
                },
                { type: 'text', text: transcriptionPrompt(range) },
              ],
            },
          ],
        })
        .finalText();
    } catch (error) {
      throw toExtractionError(error);
    }
    return parsePageMarkers(text, range);
  }
```

- [ ] **Step 5: Implement the fake transcriber**

In `lib/integrations/extraction/fake.ts` add:

```ts
import type { Slice, TranscribedPage } from '@/lib/domain/rag/transcript';

/** Fictional page text matching SAMPLE_EXTRACTION; page 1 certificate, 2 objectives, 3+ บอจ.5. */
export function fakePageText(page: number): string {
  if (page === 1) {
    return [
      'หนังสือรับรอง',
      'ชื่อบริษัท บริษัท ตัวอย่างการสกัด จำกัด',
      'ทะเบียนเลขที่ 0105569000123',
      'จดทะเบียนเมื่อวันที่ 10 เมษายน 2569',
      'ทุนจดทะเบียน 2,000,000 บาท',
      'สำนักงานแห่งใหญ่ ตั้งอยู่เลขที่ 99/9 หมู่ 1 ตำบลตัวอย่าง อำเภอตัวอย่าง จังหวัดตัวอย่าง',
    ].join('\n');
  }
  if (page === 2) {
    return [
      'วัตถุที่ประสงค์',
      '1. ประกอบกิจการค้าปลีกและค้าส่งสินค้าอุปโภคบริโภค',
      '2. ประกอบกิจการนำเข้าและส่งออกสินค้าทุกชนิด',
      '3. ประกอบกิจการให้บริการคำปรึกษาทางธุรกิจ',
    ].join('\n');
  }
  return [
    'บัญชีรายชื่อผู้ถือหุ้น (บอจ.5)',
    'ลำดับ | ชื่อ | สัญชาติ | จำนวนหุ้น',
    '1 | นางสาวตัวอย่าง ทดสอบ | ไทย | 19,998',
    '2 | นายตัวอย่าง สอง | ไทย | 2',
    `หน้า ${page}`,
  ].join('\n');
}
```

and the method on `FakeDbdExtractor`:

```ts
  async transcribe(_slice: Uint8Array, range: Slice): Promise<TranscribedPage[]> {
    const pages: TranscribedPage[] = [];
    for (let page = range.firstPage; page <= range.lastPage; page++) {
      pages.push({ page, text: fakePageText(page) });
    }
    return pages;
  }
```

In `tests/integration/extraction.test.ts`, extend the `failing` stub so it still satisfies the interface:

```ts
const failing: DbdExtractor = {
  name: 'failing',
  async extract() {
    throw new ExtractionError('boom', 'provider');
  },
  async transcribe() {
    throw new ExtractionError('boom', 'provider');
  },
};
```

- [ ] **Step 6: Run the tests and the typecheck**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/integrations/transcribe.test.ts && pnpm typecheck`
Expected: PASS (3 tests); typecheck clean (every `DbdExtractor` implementation now has `transcribe`).

- [ ] **Step 7: Commit**

```bash
git add lib/integrations/extraction tests/unit/integrations/transcribe.test.ts tests/integration/extraction.test.ts
git commit -m "feat(p14): page transcription on the extraction adapter (Claude streaming, fake)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Vector store adapter — types, provider resolution, Pinecone, fake

**Files:**
- Create: `lib/integrations/vector/types.ts`
- Create: `lib/integrations/vector/index.ts`
- Create: `lib/integrations/vector/pinecone.ts`
- Create: `lib/integrations/vector/fake.ts`
- Create: `lib/integrations/vector/fake-loader.ts`
- Test: `tests/unit/integrations/vector.test.ts`

**Interfaces:**
- Consumes: `Chunk` (Task 3), `trigramOverlap` (Task 4).
- Produces:
  ```ts
  type VectorProvider = 'pinecone' | 'fake' | 'off';
  type Passage = { id: string; documentId: string; documentType: string | null; page: number; text: string; score: number };
  type SearchOptions = { recordId: string; query: string; topK?: number; documentTypes?: string[] };
  interface VectorStore { readonly name: 'pinecone' | 'fake'; index(chunks: Chunk[]): Promise<void>; remove(ids: string[]): Promise<void>; search(options: SearchOptions): Promise<Passage[]> }
  class VectorError extends Error { code: 'not_configured' | 'unavailable' | 'provider' }
  resolveVectorProvider(env?) → VectorProvider; getVectorStore(env?) → VectorStore | null
  pineconeConfig(env?) → { apiKey; indexName; namespace; region }
  class FakeVectorStore(loadChunks: (recordId, documentTypes?) => Promise<Chunk[]>)
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/integrations/vector.test.ts
import { describe, expect, it } from 'vitest';
import type { Chunk } from '@/lib/domain/rag/chunk';
import { getVectorStore, resolveVectorProvider } from '@/lib/integrations/vector';
import { FakeVectorStore } from '@/lib/integrations/vector/fake';
import { pineconeConfig } from '@/lib/integrations/vector/pinecone';

describe('resolveVectorProvider', () => {
  it('follows the explicit setting, then the key, then the environment', () => {
    expect(resolveVectorProvider({ VECTOR_PROVIDER: 'off', PINECONE_API_KEY: 'k' })).toBe('off');
    expect(resolveVectorProvider({ PINECONE_API_KEY: 'k' })).toBe('pinecone');
    expect(resolveVectorProvider({ NODE_ENV: 'production' })).toBe('off');
    expect(resolveVectorProvider({ NODE_ENV: 'test' })).toBe('fake');
  });
  it('returns no store when off and a fake store otherwise', () => {
    expect(getVectorStore({ VECTOR_PROVIDER: 'off' })).toBeNull();
    expect(getVectorStore({ VECTOR_PROVIDER: 'fake' })?.name).toBe('fake');
  });
  it('reads the Pinecone settings with defaults', () => {
    expect(pineconeConfig({ PINECONE_API_KEY: 'k' })).toEqual({
      apiKey: 'k',
      indexName: 'thai-portal-dbd',
      namespace: 'dev',
      region: 'us-east-1',
    });
    expect(() => pineconeConfig({})).toThrow(/PINECONE_API_KEY/);
  });
});

describe('FakeVectorStore', () => {
  const chunk = (id: string, page: number, text: string, documentType = 'certificate'): Chunk => ({
    id,
    recordId: 'rec',
    documentId: 'doc',
    documentType,
    page,
    chunkIndex: Number(id.split('#')[2]),
    text,
  });
  const chunks = [
    chunk('doc#1#0', 1, 'ทุนจดทะเบียน 2,000,000 บาท'),
    chunk('doc#2#0', 2, '1. ประกอบกิจการค้าปลีก', 'objectives_sheet'),
    chunk('doc#3#0', 3, 'บัญชีรายชื่อผู้ถือหุ้น', 'shareholder_list'),
  ];
  const store = new FakeVectorStore(async (recordId, types) =>
    recordId === 'rec' ? chunks.filter((c) => !types || types.includes(c.documentType ?? '')) : [],
  );

  it('ranks by trigram overlap, drops zero scores and honours topK and document types', async () => {
    const hits = await store.search({ recordId: 'rec', query: 'ทุนจดทะเบียน', topK: 2 });
    expect(hits.map((h) => h.page)).toEqual([1]);
    expect(hits[0]).toMatchObject({ id: 'doc#1#0', documentId: 'doc', score: 1 });
    const typed = await store.search({ recordId: 'rec', query: 'ประกอบกิจการ', documentTypes: ['shareholder_list'] });
    expect(typed).toEqual([]);
    expect(await store.search({ recordId: 'other', query: 'ทุนจดทะเบียน' })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/integrations/vector.test.ts`
Expected: FAIL — cannot resolve `@/lib/integrations/vector`.

- [ ] **Step 3: Implement the types and the fake store**

```ts
// lib/integrations/vector/types.ts
import type { Chunk } from '@/lib/domain/rag/chunk';

export type VectorProvider = 'pinecone' | 'fake' | 'off';

export type Passage = {
  id: string;
  documentId: string;
  documentType: string | null;
  page: number;
  text: string;
  /** Higher is better; scales differ per provider (rerank score vs trigram overlap). */
  score: number;
};

export type SearchOptions = {
  recordId: string;
  query: string;
  /** Passages returned after reranking (default 4). */
  topK?: number;
  documentTypes?: string[];
};

export interface VectorStore {
  readonly name: 'pinecone' | 'fake';
  index(chunks: Chunk[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  search(options: SearchOptions): Promise<Passage[]>;
}

export class VectorError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_configured' | 'unavailable' | 'provider',
  ) {
    super(message);
    this.name = 'VectorError';
  }
}
```

```ts
// lib/integrations/vector/fake.ts
import type { Chunk } from '@/lib/domain/rag/chunk';
import { trigramOverlap } from '@/lib/domain/rag/score';
import type { Passage, SearchOptions, VectorStore } from './types';

export type ChunkLoader = (recordId: string, documentTypes?: string[]) => Promise<Chunk[]>;

/**
 * Dev/test store: the `dbd_chunks` rows are the index, ranked by trigram overlap. Deterministic,
 * so e2e and CI need no key. `index`/`remove` are no-ops because the rows are written by the worker.
 */
export class FakeVectorStore implements VectorStore {
  readonly name = 'fake';
  constructor(private readonly loadChunks: ChunkLoader) {}

  async index(): Promise<void> {}
  async remove(): Promise<void> {}

  async search({ recordId, query, topK = 4, documentTypes }: SearchOptions): Promise<Passage[]> {
    const chunks = await this.loadChunks(recordId, documentTypes);
    return chunks
      .map((c) => ({
        id: c.id,
        documentId: c.documentId,
        documentType: c.documentType,
        page: c.page,
        text: c.text,
        score: trigramOverlap(query, c.text),
      }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score || a.page - b.page || a.id.localeCompare(b.id))
      .slice(0, topK);
  }
}
```

```ts
// lib/integrations/vector/fake-loader.ts
import 'server-only';
import type { Chunk } from '@/lib/domain/rag/chunk';
import { createSupabaseAdminClient } from '@/lib/db/admin';

/** The fake store reads the record's chunk rows straight from Postgres. */
export async function loadChunksFromDb(recordId: string, documentTypes?: string[]): Promise<Chunk[]> {
  let query = createSupabaseAdminClient()
    .from('dbd_chunks')
    .select('id, record_id, document_id, document_type, page, chunk_index, chunk_text')
    .eq('record_id', recordId);
  if (documentTypes && documentTypes.length > 0) query = query.in('document_type', documentTypes);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    recordId: r.record_id,
    documentId: r.document_id,
    documentType: r.document_type,
    page: r.page,
    chunkIndex: r.chunk_index,
    text: r.chunk_text,
  }));
}
```

- [ ] **Step 4: Implement the Pinecone store and the resolver**

```ts
// lib/integrations/vector/pinecone.ts
import 'server-only';
import { Errors, Pinecone, type Index } from '@pinecone-database/pinecone';
import type { Chunk } from '@/lib/domain/rag/chunk';
import { VectorError, type Passage, type SearchOptions, type VectorStore } from './types';

export const PINECONE_EMBED_MODEL = 'multilingual-e5-large';
export const PINECONE_RERANK_MODEL = 'bge-reranker-v2-m3';
export const PINECONE_TEXT_FIELD = 'chunk_text';
const UPSERT_BATCH = 96;
const DELETE_BATCH = 1000;

export type PineconeConfig = { apiKey: string; indexName: string; namespace: string; region: string };

export function pineconeConfig(env: Record<string, string | undefined> = process.env): PineconeConfig {
  if (!env.PINECONE_API_KEY) throw new VectorError('PINECONE_API_KEY is not set', 'not_configured');
  return {
    apiKey: env.PINECONE_API_KEY,
    indexName: env.PINECONE_INDEX || 'thai-portal-dbd',
    namespace: env.PINECONE_NAMESPACE || 'dev',
    region: env.PINECONE_REGION || 'us-east-1',
  };
}

/** Metadata stored next to each chunk; every field is filterable (decision D40). */
type ChunkMetadata = {
  chunk_text: string;
  record_id: string;
  document_id: string;
  document_type: string;
  page: number;
  chunk_index: number;
};

function toVectorError(error: unknown): VectorError {
  if (error instanceof Errors.PineconeAuthorizationError) {
    return new VectorError('Pinecone API key is missing or invalid', 'not_configured');
  }
  if (
    error instanceof Errors.PineconeConnectionError ||
    error instanceof Errors.PineconeUnavailableError
  ) {
    return new VectorError('Pinecone is unreachable', 'unavailable');
  }
  return new VectorError(error instanceof Error ? error.message : String(error), 'provider');
}

/**
 * Integrated-embedding index: Pinecone embeds `chunk_text` on upsert and reranks on search.
 * One namespace per environment; records are separated by the `record_id` filter.
 */
export class PineconeVectorStore implements VectorStore {
  readonly name = 'pinecone';
  private readonly target: Index<ChunkMetadata>;

  constructor(config: PineconeConfig = pineconeConfig()) {
    const client = new Pinecone({ apiKey: config.apiKey });
    this.target = client.index<ChunkMetadata>({ name: config.indexName, namespace: config.namespace });
  }

  async index(chunks: Chunk[]): Promise<void> {
    try {
      for (let i = 0; i < chunks.length; i += UPSERT_BATCH) {
        await this.target.upsertRecords({
          records: chunks.slice(i, i + UPSERT_BATCH).map((c) => ({
            _id: c.id,
            chunk_text: c.text,
            record_id: c.recordId,
            document_id: c.documentId,
            document_type: c.documentType ?? 'other',
            page: c.page,
            chunk_index: c.chunkIndex,
          })),
        });
      }
    } catch (error) {
      throw toVectorError(error);
    }
  }

  async remove(ids: string[]): Promise<void> {
    try {
      for (let i = 0; i < ids.length; i += DELETE_BATCH) {
        await this.target.deleteMany({ ids: ids.slice(i, i + DELETE_BATCH) });
      }
    } catch (error) {
      throw toVectorError(error);
    }
  }

  async search({ recordId, query, topK = 4, documentTypes }: SearchOptions): Promise<Passage[]> {
    const filter: Record<string, unknown> = { record_id: { $eq: recordId } };
    if (documentTypes && documentTypes.length > 0) filter.document_type = { $in: documentTypes };
    try {
      const response = await this.target.searchRecords({
        query: { topK: Math.max(12, topK * 3), inputs: { text: query }, filter },
        fields: ['chunk_text', 'document_id', 'document_type', 'page'],
        rerank: { model: PINECONE_RERANK_MODEL, rankFields: [PINECONE_TEXT_FIELD], topN: topK },
      });
      return response.result.hits.map((hit) => {
        const f = hit.fields as Partial<ChunkMetadata>;
        return {
          id: hit._id,
          documentId: f.document_id ?? '',
          documentType: f.document_type ?? null,
          page: f.page ?? 0,
          text: f.chunk_text ?? '',
          score: hit._score,
        };
      });
    } catch (error) {
      throw toVectorError(error);
    }
  }
}
```

```ts
// lib/integrations/vector/index.ts
import 'server-only';
import { FakeVectorStore } from './fake';
import { loadChunksFromDb } from './fake-loader';
import { PineconeVectorStore } from './pinecone';
import type { VectorProvider, VectorStore } from './types';

export type { Passage, SearchOptions, VectorStore } from './types';
export { VectorError } from './types';

/**
 * VECTOR_PROVIDER=pinecone|fake|off. Default: pinecone when PINECONE_API_KEY is set,
 * otherwise fake outside production and off in production (decision D40).
 */
export function resolveVectorProvider(
  env: Record<string, string | undefined> = process.env,
): VectorProvider {
  const configured = env.VECTOR_PROVIDER;
  if (configured === 'pinecone' || configured === 'fake' || configured === 'off') return configured;
  if (env.PINECONE_API_KEY) return 'pinecone';
  return env.NODE_ENV === 'production' ? 'off' : 'fake';
}

export function getVectorStore(
  env: Record<string, string | undefined> = process.env,
): VectorStore | null {
  switch (resolveVectorProvider(env)) {
    case 'pinecone':
      return new PineconeVectorStore();
    case 'fake':
      return new FakeVectorStore(loadChunksFromDb);
    case 'off':
      return null;
  }
}
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/integrations/vector.test.ts && pnpm typecheck`
Expected: PASS (4 tests); typecheck clean. If the SDK's `Index` generic or `searchRecords` types differ from the snippet, read `node_modules/@pinecone-database/pinecone/dist/data/vectors/searchRecords.d.ts` and `pinecone.d.ts` and adjust — do not guess names (the v9 surface is `pc.index({ name, namespace })`, `upsertRecords({ records })`, `searchRecords({ query: { topK, inputs, filter }, fields, rerank })`, `deleteMany({ ids })`, `response.result.hits[].{_id,_score,fields}`).

- [ ] **Step 6: Commit**

```bash
git add lib/integrations/vector tests/unit/integrations/vector.test.ts
git commit -m "feat(p14): vector store adapter — Pinecone integrated index and fake trigram store

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Index persistence, jobs and the worker (`lib/db/dbd-index.ts`)

**Files:**
- Create: `lib/db/dbd-index.ts`
- Test: `tests/integration/dbd-index.test.ts`

**Interfaces:**
- Consumes: `planSlice`, `MissingPagesError`, `TranscribedPage` (Task 1); `slicePdf` (Task 2); `chunkPage` (Task 3); `MAX_INDEX_ATTEMPTS`, `retryDelayMinutes` (Task 1); `DbdExtractor` (Task 6); `VectorStore`, `Passage` (Task 7); `createSupabaseAdminClient`.
- Produces:
  ```ts
  enqueueIndexJob(db, { recordId, documentId, kind? }) → Promise<void>
  listChunkIds(db, documentId) → Promise<string[]>
  type IndexWorkerDeps = { extractor: DbdExtractor | null; vector: VectorStore | null; budgetMs?: number; slicePages?: number; now?: () => number; download?: (path: string) => Promise<Uint8Array> }
  type IndexRunSummary = { claimed: number; slices: number; completed: number; failed: number; skipped: number; released: number }
  processIndexJobs(deps) → Promise<IndexRunSummary>
  searchRecordPassages(vector, recordId, query, { topK?, documentTypes? }) → Promise<Passage[] | null>
  ```

- [ ] **Step 1: Write the failing integration tests**

```ts
// tests/integration/dbd-index.test.ts
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enqueueIndexJob, listChunkIds, processIndexJobs, searchRecordPassages } from '@/lib/db/dbd-index';
import { createDbdRecord, listDbdDocuments, uploadDbdDocument } from '@/lib/db/dbd-records';
import { MissingPagesError, type Slice, type TranscribedPage } from '@/lib/domain/rag/transcript';
import { dbdRecordInputSchema } from '@/lib/domain/dbd-record';
import { FakeDbdExtractor } from '@/lib/integrations/extraction/fake';
import type { DbdExtractor } from '@/lib/integrations/extraction/types';
import { FakeVectorStore } from '@/lib/integrations/vector/fake';
import { loadChunksFromDb } from '@/lib/integrations/vector/fake-loader';
import { adminClient, clientFor, createTestUser, deleteTestUser, type Client, type TestUser } from './helpers';

const fixture = readFileSync('tests/fixtures/three-pages.pdf');
const pdfFile = () => new File([fixture], 'pack.pdf', { type: 'application/pdf' });

/** A vector store that remembers what it was asked to remove. */
class RecordingStore extends FakeVectorStore {
  removed: string[] = [];
  override async remove(ids: string[]) {
    this.removed.push(...ids);
  }
}

function transcriberWith(pages: (range: Slice) => TranscribedPage[]): DbdExtractor {
  return {
    name: 'custom',
    async extract(documents) {
      return new FakeDbdExtractor().extract(documents);
    },
    async transcribe(_slice, range) {
      return pages(range);
    },
  };
}

describe('index jobs and the worker', () => {
  let admin: TestUser;
  let asAdmin: Client;
  let recordId: string;
  let store: RecordingStore;
  const svc = adminClient();

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
    recordId = (await createDbdRecord(asAdmin, dbdRecordInputSchema.parse({}), admin.id)).id;
    store = new RecordingStore(loadChunksFromDb);
  });

  afterAll(async () => {
    const docs = await listDbdDocuments(svc, recordId);
    await svc.storage.from('dbd-documents').remove(docs.map((d) => d.path));
    await svc.from('dbd_records').delete().eq('id', recordId);
    await deleteTestUser(admin.id);
  });

  it('upload counts the pages and queues one job', async () => {
    await uploadDbdDocument(asAdmin, recordId, pdfFile(), 'pack.pdf');
    const [doc] = await listDbdDocuments(asAdmin, recordId);
    expect(doc.page_count).toBe(3);
    expect(doc.index_status).toBe('queued');
    const { data: jobs } = await svc.from('index_jobs').select('*').eq('document_id', doc.id);
    expect(jobs).toHaveLength(1);
    expect(jobs?.[0]).toMatchObject({ status: 'queued', next_page: 1, attempts: 0 });
  });

  it('reads one slice per run when the budget is exhausted, then finishes', async () => {
    const deps = { extractor: new FakeDbdExtractor(), vector: store, slicePages: 2, budgetMs: 0 };
    const first = await processIndexJobs(deps);
    expect(first).toMatchObject({ claimed: 1, slices: 1, completed: 0, released: 1 });
    let [doc] = await listDbdDocuments(svc, recordId);
    expect(doc).toMatchObject({ index_status: 'indexing', indexed_pages: 2 });
    let { data: job } = await svc.from('index_jobs').select('*').eq('document_id', doc.id).single();
    expect(job).toMatchObject({ status: 'queued', next_page: 3, attempts: 0 });

    const second = await processIndexJobs(deps);
    expect(second).toMatchObject({ claimed: 1, slices: 1, completed: 1 });
    [doc] = await listDbdDocuments(svc, recordId);
    expect(doc).toMatchObject({ index_status: 'ready', indexed_pages: 3, index_error: null });
    ({ data: job } = await svc.from('index_jobs').select('*').eq('document_id', doc.id).single());
    expect(job?.status).toBe('done');

    const { data: pages } = await svc.from('dbd_pages').select('page').eq('document_id', doc.id).order('page');
    expect(pages?.map((p) => p.page)).toEqual([1, 2, 3]);
    expect((await listChunkIds(svc, doc.id)).length).toBeGreaterThanOrEqual(3);
    expect(await processIndexJobs(deps)).toMatchObject({ claimed: 0 });
  });

  it('finds the passage that answers a question, with its page', async () => {
    const hits = await searchRecordPassages(store, recordId, 'ทุนจดทะเบียน', { topK: 2 });
    expect(hits?.[0]).toMatchObject({ page: 1 });
    expect(hits?.[0].text).toContain('2,000,000');
    expect(await searchRecordPassages(null, recordId, 'ทุนจดทะเบียน')).toBeNull();
  });

  it('re-indexing removes chunks that no longer exist', async () => {
    const [doc] = await listDbdDocuments(svc, recordId);
    const pagesOf = (text: (p: number) => string) =>
      transcriberWith((range) => {
        const pages: TranscribedPage[] = [];
        for (let p = range.firstPage; p <= range.lastPage; p++) pages.push({ page: p, text: text(p) });
        return pages;
      });
    // First pass: three ~400-character items per page → two chunks per page.
    const item = (n: number) => `${n}. ${'ประกอบกิจการค้าปลีกและค้าส่งสินค้าอุปโภคบริโภค '.repeat(8).trim()}`;
    await enqueueIndexJob(asAdmin, { recordId, documentId: doc.id, kind: 'reindex' });
    await processIndexJobs({ extractor: pagesOf(() => [1, 2, 3].map(item).join('\n')), vector: store, budgetMs: 60_000 });
    const before = await listChunkIds(svc, doc.id);
    expect(before).toContain(`${doc.id}#1#1`);

    // Second pass: one short line per page → one chunk per page; the "#1" chunks are stale.
    await enqueueIndexJob(asAdmin, { recordId, documentId: doc.id, kind: 'reindex' });
    await processIndexJobs({ extractor: pagesOf((p) => `หน้า ${p}`), vector: store, budgetMs: 60_000 });
    const after = await listChunkIds(svc, doc.id);
    expect(after).toEqual([1, 2, 3].map((p) => `${doc.id}#${p}#0`));
    const stale = before.filter((id) => !after.includes(id));
    expect(stale).toHaveLength(3);
    expect(store.removed).toEqual(expect.arrayContaining(stale));
  });

  it('retries a transcript that skipped a page once, then backs off and finally fails', async () => {
    const [doc] = await listDbdDocuments(svc, recordId);
    await enqueueIndexJob(asAdmin, { recordId, documentId: doc.id, kind: 'reindex' });
    let calls = 0;
    const skipsPageTwo: DbdExtractor = {
      ...transcriberWith(() => []),
      async transcribe(_slice, range) {
        calls++;
        throw new MissingPagesError([range.firstPage + 1]);
      },
    };
    const run = await processIndexJobs({ extractor: skipsPageTwo, vector: store, budgetMs: 60_000 });
    expect(run).toMatchObject({ claimed: 1, failed: 0, released: 1 });
    expect(calls).toBe(2);
    let { data: job } = await svc.from('index_jobs').select('*').eq('document_id', doc.id).single();
    expect(job).toMatchObject({ status: 'queued', attempts: 1 });
    expect(job?.last_error).toMatch(/missing page/i);
    expect(new Date(job!.locked_until!).getTime()).toBeGreaterThan(Date.now());

    // Force the remaining attempts through by expiring the lease each time.
    for (let i = 0; i < 4; i++) {
      await svc.from('index_jobs').update({ locked_until: new Date(0).toISOString() }).eq('id', job!.id);
      await processIndexJobs({ extractor: skipsPageTwo, vector: store, budgetMs: 60_000 });
    }
    ({ data: job } = await svc.from('index_jobs').select('*').eq('document_id', doc.id).single());
    expect(job).toMatchObject({ status: 'failed', attempts: 5 });
    const [failedDoc] = await listDbdDocuments(svc, recordId);
    expect(failedDoc.index_status).toBe('failed');
    expect(failedDoc.index_error).toMatch(/missing page/i);
  });

  it('two claims never hand out the same job', async () => {
    const [doc] = await listDbdDocuments(svc, recordId);
    await enqueueIndexJob(asAdmin, { recordId, documentId: doc.id });
    await uploadDbdDocument(asAdmin, recordId, pdfFile(), 'second.pdf');
    const [a, b] = await Promise.all([
      svc.rpc('claim_index_jobs', { p_limit: 1 }),
      svc.rpc('claim_index_jobs', { p_limit: 1 }),
    ]);
    const ids = [...(a.data ?? []), ...(b.data ?? [])].map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(2);
  });

  it('marks documents skipped when no provider is available', async () => {
    const docs = await listDbdDocuments(svc, recordId);
    await svc.from('index_jobs').update({ status: 'queued', locked_until: null }).in('document_id', docs.map((d) => d.id));
    const run = await processIndexJobs({ extractor: null, vector: store, budgetMs: 60_000 });
    expect(run.skipped).toBeGreaterThanOrEqual(1);
    const after = await listDbdDocuments(svc, recordId);
    expect(after.every((d) => d.index_status === 'skipped')).toBe(true);
  });
});
```

Note: this test relies on Task 9's `uploadDbdDocument` changes (page count + enqueue). Implement Tasks 8 and 9 back to back; run the file after Task 9's Step 3.

- [ ] **Step 2: Implement `lib/db/dbd-index.ts`**

```ts
// lib/db/dbd-index.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { chunkPage, type Chunk } from '@/lib/domain/rag/chunk';
import { MAX_INDEX_ATTEMPTS, retryDelayMinutes } from '@/lib/domain/rag/jobs';
import {
  DEFAULT_SLICE_PAGES,
  MissingPagesError,
  planSlice,
  type Slice,
  type TranscribedPage,
} from '@/lib/domain/rag/transcript';
import { transcriptionModel } from '@/lib/integrations/extraction/transcribe';
import type { DbdExtractor } from '@/lib/integrations/extraction/types';
import type { Passage, VectorStore } from '@/lib/integrations/vector/types';
import { slicePdf } from '@/lib/pdf/slice';
import { createSupabaseAdminClient } from './admin';
import type { Database } from './database.types';

type Db = SupabaseClient<Database>;
export type IndexJobRow = Database['public']['Tables']['index_jobs']['Row'];

/** Queues (or resets) the one live job of a document and marks it `queued` (decision D41). */
export async function enqueueIndexJob(
  db: Db,
  input: { recordId: string; documentId: string; kind?: 'index' | 'reindex' },
): Promise<void> {
  const kind = input.kind ?? 'index';
  const { data: live, error } = await db
    .from('index_jobs')
    .select('id')
    .eq('document_id', input.documentId)
    .in('status', ['queued', 'running'])
    .maybeSingle();
  if (error) throw error;
  if (live) {
    const { error: e } = await db
      .from('index_jobs')
      .update({ kind, status: 'queued', next_page: 1, attempts: 0, locked_until: null, last_error: null })
      .eq('id', live.id);
    if (e) throw e;
  } else {
    const { error: e } = await db
      .from('index_jobs')
      .insert({ record_id: input.recordId, document_id: input.documentId, kind });
    if (e) throw e;
  }
  const { error: docError } = await db
    .from('dbd_documents')
    .update({ index_status: 'queued', indexed_pages: 0, index_error: null })
    .eq('id', input.documentId);
  if (docError) throw docError;
}

export async function listChunkIds(db: Db, documentId: string): Promise<string[]> {
  const { data, error } = await db
    .from('dbd_chunks')
    .select('id')
    .eq('document_id', documentId)
    .order('page')
    .order('chunk_index');
  if (error) throw error;
  return (data ?? []).map((r) => r.id);
}

/** Retrieval entry point for every consumer; null when no store is configured. */
export async function searchRecordPassages(
  vector: VectorStore | null,
  recordId: string,
  query: string,
  options: { topK?: number; documentTypes?: string[] } = {},
): Promise<Passage[] | null> {
  if (!vector) return null;
  return vector.search({ recordId, query, ...options });
}

export type IndexWorkerDeps = {
  extractor: DbdExtractor | null;
  vector: VectorStore | null;
  /** Stop claiming new slices after this much work; at least one slice per claimed job. */
  budgetMs?: number;
  slicePages?: number;
  now?: () => number;
  download?: (path: string) => Promise<Uint8Array>;
};

export type IndexRunSummary = {
  claimed: number;
  slices: number;
  completed: number;
  failed: number;
  skipped: number;
  /** Jobs put back in the queue with work left (budget) or after a failed attempt (backoff). */
  released: number;
};

async function downloadFromStorage(admin: Db, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from('dbd-documents').download(path);
  if (error || !data) throw new Error(`Could not download ${path}`);
  return new Uint8Array(await data.arrayBuffer());
}

async function transcribeWithRetry(
  extractor: DbdExtractor,
  bytes: Uint8Array,
  slice: Slice,
): Promise<TranscribedPage[]> {
  const sliced = await slicePdf(bytes, slice);
  try {
    return await extractor.transcribe(sliced, slice);
  } catch (e) {
    if (!(e instanceof MissingPagesError)) throw e;
    return extractor.transcribe(sliced, slice);
  }
}

/** Persists a slice's pages and chunks; stale chunk ids of those pages leave the store first. */
async function storeSlice(
  admin: Db,
  vector: VectorStore,
  job: IndexJobRow,
  documentType: string | null,
  pages: TranscribedPage[],
  model: string,
): Promise<void> {
  const chunks: Chunk[] = pages.flatMap((p) =>
    chunkPage({ recordId: job.record_id, documentId: job.document_id, documentType, page: p.page, text: p.text }),
  );
  const keep = new Set(chunks.map((c) => c.id));
  const { data: existing, error: existingError } = await admin
    .from('dbd_chunks')
    .select('id')
    .eq('document_id', job.document_id)
    .in('page', pages.map((p) => p.page));
  if (existingError) throw existingError;
  const stale = (existing ?? []).map((r) => r.id).filter((id) => !keep.has(id));
  if (stale.length > 0) {
    await vector.remove(stale);
    const { error } = await admin.from('dbd_chunks').delete().in('id', stale);
    if (error) throw error;
  }
  const { error: pageError } = await admin.from('dbd_pages').upsert(
    pages.map((p) => ({ document_id: job.document_id, page: p.page, text: p.text, model })),
    { onConflict: 'document_id,page' },
  );
  if (pageError) throw pageError;
  if (chunks.length > 0) {
    const { error: chunkError } = await admin.from('dbd_chunks').upsert(
      chunks.map((c) => ({
        id: c.id,
        record_id: c.recordId,
        document_id: c.documentId,
        document_type: c.documentType,
        page: c.page,
        chunk_index: c.chunkIndex,
        chunk_text: c.text,
        char_count: c.text.length,
      })),
    );
    if (chunkError) throw chunkError;
    await vector.index(chunks);
  }
}

async function setDocument(
  admin: Db,
  documentId: string,
  patch: Database['public']['Tables']['dbd_documents']['Update'],
): Promise<void> {
  const { error } = await admin.from('dbd_documents').update(patch).eq('id', documentId);
  if (error) throw error;
}

async function setJob(
  admin: Db,
  jobId: string,
  patch: Database['public']['Tables']['index_jobs']['Update'],
): Promise<void> {
  const { error } = await admin.from('index_jobs').update(patch).eq('id', jobId);
  if (error) throw error;
}

/**
 * One worker run (cron): claims one job at a time and reads slices until the budget is spent.
 * A job is released with `next_page` advanced when the budget runs out, backed off after a
 * failed attempt, and marked `done` (document `ready`) after its last page.
 */
export async function processIndexJobs(deps: IndexWorkerDeps): Promise<IndexRunSummary> {
  const admin = createSupabaseAdminClient();
  const now = deps.now ?? Date.now;
  const budgetMs = deps.budgetMs ?? 240_000;
  const slicePages = deps.slicePages ?? DEFAULT_SLICE_PAGES;
  const download = deps.download ?? ((path: string) => downloadFromStorage(admin, path));
  const started = now();
  const summary: IndexRunSummary = { claimed: 0, slices: 0, completed: 0, failed: 0, skipped: 0, released: 0 };

  while (now() - started < budgetMs || summary.claimed === 0) {
    const { data: claimed, error } = await admin.rpc('claim_index_jobs', { p_limit: 1 });
    if (error) throw error;
    const job = claimed?.[0];
    if (!job) break;
    summary.claimed++;

    if (!deps.extractor || !deps.vector) {
      await setJob(admin, job.id, { status: 'done', locked_until: null, last_error: 'no provider' });
      await setDocument(admin, job.document_id, { index_status: 'skipped' });
      summary.skipped++;
      continue;
    }

    const { data: doc, error: docError } = await admin
      .from('dbd_documents')
      .select('id, path, page_count, document_type')
      .eq('id', job.document_id)
      .single();
    if (docError) throw docError;

    try {
      if (!doc.page_count) throw new Error('unreadable_pdf');
      const bytes = await download(doc.path);
      let nextPage = job.next_page;
      let done = false;
      await setDocument(admin, doc.id, { index_status: 'indexing' });
      do {
        const slice = planSlice(doc.page_count, nextPage, slicePages);
        if (!slice) {
          done = true;
          break;
        }
        const pages = await transcribeWithRetry(deps.extractor, bytes, slice);
        const model = deps.extractor.name === 'claude' ? transcriptionModel() : deps.extractor.name;
        await storeSlice(admin, deps.vector, job, doc.document_type, pages, model);
        nextPage = slice.lastPage + 1;
        summary.slices++;
        await setJob(admin, job.id, { next_page: nextPage });
        await setDocument(admin, doc.id, { indexed_pages: slice.lastPage });
        done = nextPage > doc.page_count;
      } while (!done && now() - started < budgetMs);

      if (done) {
        await setJob(admin, job.id, { status: 'done', locked_until: null, last_error: null });
        await setDocument(admin, doc.id, { index_status: 'ready', indexed_pages: doc.page_count, index_error: null });
        summary.completed++;
      } else {
        await setJob(admin, job.id, { status: 'queued', locked_until: null });
        summary.released++;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const attempts = message === 'unreadable_pdf' ? MAX_INDEX_ATTEMPTS : job.attempts + 1;
      if (attempts >= MAX_INDEX_ATTEMPTS) {
        await setJob(admin, job.id, { status: 'failed', attempts, locked_until: null, last_error: message });
        await setDocument(admin, job.document_id, { index_status: 'failed', index_error: message });
        summary.failed++;
      } else {
        await setJob(admin, job.id, {
          status: 'queued',
          attempts,
          last_error: message,
          locked_until: new Date(now() + retryDelayMinutes(attempts) * 60_000).toISOString(),
        });
        summary.released++;
      }
    }
  }
  return summary;
}
```

Note on `attempts`: the claim function bumps `attempts` only when it reclaims an expired `running` lease (a run that died); the worker adds one per caught failure. Both paths converge on `MAX_INDEX_ATTEMPTS`.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: clean. (The integration test runs after Task 9 Step 3.)

- [ ] **Step 4: Commit**

```bash
git add lib/db/dbd-index.ts tests/integration/dbd-index.test.ts
git commit -m "feat(p14): index jobs, sliced transcription worker and passage search

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Wire uploads and removals, cron route, config, health

**Files:**
- Modify: `lib/db/dbd-records.ts` (`uploadDbdDocument`, `removeDbdDocument`)
- Create: `app/api/cron/index/route.ts`
- Modify: `vercel.json`, `playwright.config.ts`, `.env.example`, `app/api/health/route.ts`
- Test: `tests/integration/dbd-index.test.ts` (from Task 8), `tests/integration/dbd-index.upload.test.ts`

**Interfaces:**
- Consumes: `countPages` (Task 2), `enqueueIndexJob`, `listChunkIds`, `processIndexJobs` (Task 8), `getVectorStore`, `resolveVectorProvider` (Task 7), `getDbdExtractor`.
- Produces: `uploadDbdDocument` sets `page_count` and `index_status` (`queued` | `skipped` | `failed`); `removeDbdDocument` removes vectors first; `GET /api/cron/index` → `IndexRunSummary` JSON.

- [ ] **Step 1: Write the failing upload tests**

```ts
// tests/integration/dbd-index.upload.test.ts
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDbdRecord, listDbdDocuments, removeDbdDocument, uploadDbdDocument } from '@/lib/db/dbd-records';
import { dbdRecordInputSchema } from '@/lib/domain/dbd-record';
import { adminClient, clientFor, createTestUser, deleteTestUser, type Client, type TestUser } from './helpers';

describe('upload → index status', () => {
  let admin: TestUser;
  let asAdmin: Client;
  let recordId: string;
  const svc = adminClient();
  const original = process.env.VECTOR_PROVIDER;

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
    recordId = (await createDbdRecord(asAdmin, dbdRecordInputSchema.parse({}), admin.id)).id;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.VECTOR_PROVIDER;
    else process.env.VECTOR_PROVIDER = original;
  });
  afterAll(async () => {
    const docs = await listDbdDocuments(svc, recordId);
    await svc.storage.from('dbd-documents').remove(docs.map((d) => d.path));
    await svc.from('dbd_records').delete().eq('id', recordId);
    await deleteTestUser(admin.id);
  });

  it('marks an unreadable file failed without queueing a job, and the upload still succeeds', async () => {
    const garbage = new File([new TextEncoder().encode('%PDF-not-really')], 'bad.pdf', { type: 'application/pdf' });
    const path = await uploadDbdDocument(asAdmin, recordId, garbage, 'bad.pdf');
    expect(path).toMatch(/\.pdf$/);
    const [doc] = await listDbdDocuments(asAdmin, recordId);
    expect(doc).toMatchObject({ page_count: null, index_status: 'failed', index_error: 'unreadable_pdf' });
    const { data: jobs } = await svc.from('index_jobs').select('id').eq('document_id', doc.id);
    expect(jobs).toEqual([]);
  });

  it('marks the document skipped when the vector provider is off', async () => {
    process.env.VECTOR_PROVIDER = 'off';
    const bytes = readFileSync('tests/fixtures/three-pages.pdf');
    await uploadDbdDocument(asAdmin, recordId, new File([bytes], 'p.pdf', { type: 'application/pdf' }), 'p.pdf');
    const docs = await listDbdDocuments(asAdmin, recordId);
    const doc = docs[docs.length - 1];
    expect(doc).toMatchObject({ page_count: 3, index_status: 'skipped' });
  });

  it('removing a document also removes its rows', async () => {
    const docs = await listDbdDocuments(asAdmin, recordId);
    const doc = docs[docs.length - 1];
    await svc.from('dbd_chunks').insert({
      id: `${doc.id}#1#0`, record_id: recordId, document_id: doc.id, page: 1, chunk_index: 0, chunk_text: 'x', char_count: 1,
    });
    await removeDbdDocument(asAdmin, recordId, doc.id);
    const { data } = await svc.from('dbd_chunks').select('id').eq('document_id', doc.id);
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/dbd-index.upload.test.ts`
Expected: FAIL — `page_count` is null / `index_status` is `none` (upload does not index yet).

- [ ] **Step 3: Wire `uploadDbdDocument` and `removeDbdDocument`**

In `lib/db/dbd-records.ts` add the imports:

```ts
import { getVectorStore, resolveVectorProvider } from '@/lib/integrations/vector';
import { countPages } from '@/lib/pdf/slice';
import { enqueueIndexJob, listChunkIds } from './dbd-index';
```

Replace the body of `uploadDbdDocument` after the storage upload:

```ts
  const { data: auth } = await db.auth.getUser();
  // P14: page count decides how the document is read; an unreadable file is stored but not indexed.
  let pageCount: number | null = null;
  try {
    pageCount = await countPages(new Uint8Array(await file.arrayBuffer()));
  } catch {
    pageCount = null;
  }
  const indexing = resolveVectorProvider() !== 'off';
  const { data: doc, error: docError } = await db
    .from('dbd_documents')
    .insert({
      record_id: id,
      path,
      original_name: originalName,
      size_bytes: file.size,
      position,
      uploaded_by: auth.user?.id ?? null,
      page_count: pageCount,
      index_status: pageCount === null ? 'failed' : indexing ? 'queued' : 'skipped',
      index_error: pageCount === null ? 'unreadable_pdf' : null,
    })
    .select('id')
    .single();
  if (docError) throw docError;
  if (pageCount !== null && indexing) await enqueueIndexJob(db, { recordId: id, documentId: doc.id });
  if (position === 1) {
    // (unchanged) document_path update
  }
  return path;
```

In `removeDbdDocument`, before `await db.storage.from('dbd-documents').remove([doc.path]);`:

```ts
  // Vectors first, then the row (pages and chunks cascade) — decision D40.
  const ids = await listChunkIds(db, doc.id);
  if (ids.length > 0) await getVectorStore()?.remove(ids);
```

- [ ] **Step 4: Run the upload tests and the Task 8 tests**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/dbd-index.upload.test.ts tests/integration/dbd-index.test.ts tests/integration/extraction.test.ts`
Expected: PASS (upload 3, index worker 7, extraction unchanged).

- [ ] **Step 5: Cron route, config, health**

```ts
// app/api/cron/index/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { processIndexJobs } from '@/lib/db/dbd-index';
import { getDbdExtractor } from '@/lib/integrations/extraction';
import { getVectorStore } from '@/lib/integrations/vector';

// Transcribing 5-page slices takes ~1 minute each; leave headroom below the 300 s ceiling.
export const maxDuration = 300;
const WORK_BUDGET_MS = 240_000;

/**
 * Drains index jobs (P14). Vercel Cron calls this every minute with
 * `Authorization: Bearer $CRON_SECRET`; anything else is rejected.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const summary = await processIndexJobs({
      extractor: getDbdExtractor(),
      vector: getVectorStore(),
      budgetMs: WORK_BUDGET_MS,
    });
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}
```

`vercel.json`:

```json
{
  "framework": "nextjs",
  "crons": [
    { "path": "/api/cron/notifications", "schedule": "* * * * *" },
    { "path": "/api/cron/index", "schedule": "* * * * *" }
  ]
}
```

`playwright.config.ts` — add to `webServer.env`: `VECTOR_PROVIDER: 'fake',`.

`app/api/health/route.ts` — import `resolveVectorProvider` from `@/lib/integrations/vector` and add `vector: resolveVectorProvider(),` to `providers`.

`.env.example` — append:

```
# DBD retrieval index (P14). VECTOR_PROVIDER: pinecone | fake | off.
# Default: pinecone when PINECONE_API_KEY is set, otherwise fake outside production and off in production.
# Create the index once with `pnpm vector:setup` (multilingual-e5-large, integrated embedding).
PINECONE_API_KEY=
PINECONE_INDEX=thai-portal-dbd
PINECONE_NAMESPACE=dev
PINECONE_REGION=us-east-1
VECTOR_PROVIDER=
# Page transcription model for the index (default claude-sonnet-5) and pages per call (default 5).
TRANSCRIPTION_MODEL=
TRANSCRIBE_SLICE_PAGES=
```

Read `TRANSCRIBE_SLICE_PAGES` in the cron route: `slicePages: Number(process.env.TRANSCRIBE_SLICE_PAGES) || undefined` passed to `processIndexJobs`.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm lint && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cron/index` (with `pnpm dev` running)
Expected: typecheck/lint clean; `401` without the secret. With the header `Authorization: Bearer local-cron-secret-for-dev` the response is JSON like `{"claimed":0,...}`.

- [ ] **Step 7: Commit**

```bash
git add lib/db/dbd-records.ts app/api/cron/index/route.ts vercel.json playwright.config.ts .env.example app/api/health/route.ts tests/integration/dbd-index.upload.test.ts
git commit -m "feat(p14): uploads queue index jobs; cron drains them; vector provider in health

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Record page — index status, retry/re-index, "Ask the documents"

**Files:**
- Create: `lib/integrations/rag/answer.ts`
- Modify: `app/[locale]/(admin)/admin/dbd-records/actions.ts` (three actions)
- Modify: `app/[locale]/(admin)/admin/dbd-records/[id]/page.tsx` (document summaries, Ask box)
- Modify: `app/[locale]/(admin)/admin/dbd-records/[id]/record-tools.tsx` (status + buttons)
- Create: `app/[locale]/(admin)/admin/dbd-records/[id]/ask-documents.tsx`
- Modify: `messages/th.json`, `messages/en.json`, `messages/zh.json`
- Test: `tests/unit/integrations/answer.test.ts`, `tests/e2e/dbd-index.spec.ts`

**Interfaces:**
- Consumes: `enqueueIndexJob`, `searchRecordPassages` (Task 8), `getVectorStore` (Task 7), `resolveQuestionGenProvider`, `Passage`.
- Produces: `answerFromPassages(question, passages, documentNames, provider?, client?) → Promise<string | null>`; actions `retryIndexAction(formData)`, `reindexDocumentAction(formData)`, `askDocumentsAction(prev, formData) → AskState`; `AskState = { question; answer: string | null; passages: { document: string; page: number; text: string }[]; error: 'empty' | 'not_indexed' | 'unavailable' | null }`; `DocumentSummary` gains `pageCount`, `indexStatus`, `indexedPages`, `indexError`.

- [ ] **Step 1: Write the failing answer test**

```ts
// tests/unit/integrations/answer.test.ts
import { describe, expect, it } from 'vitest';
import { answerFromPassages, NO_ANSWER } from '@/lib/integrations/rag/answer';
import type { Passage } from '@/lib/integrations/vector/types';

const passages: Passage[] = [
  { id: 'd#1#0', documentId: 'd', documentType: 'certificate', page: 1, text: 'หนังสือรับรอง\nทุนจดทะเบียน 2,000,000 บาท\nอื่น ๆ', score: 1 },
];
const names = new Map([['d', 'certificate.pdf']]);

describe('answerFromPassages', () => {
  it('fake: cites the matching line of the best passage', async () => {
    const answer = await answerFromPassages('ทุนจดทะเบียน', passages, names, 'fake');
    expect(answer).toBe('ทุนจดทะเบียน 2,000,000 บาท (certificate.pdf, หน้า 1)');
  });
  it('fake: says so when nothing was found; off: returns null', async () => {
    expect(await answerFromPassages('x', [], names, 'fake')).toBe(NO_ANSWER);
    expect(await answerFromPassages('x', passages, names, 'off')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/integrations/answer.test.ts`
Expected: FAIL — cannot resolve `@/lib/integrations/rag/answer`.

- [ ] **Step 3: Implement the answerer**

```ts
// lib/integrations/rag/answer.ts
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { trigramOverlap } from '@/lib/domain/rag/score';
import { resolveQuestionGenProvider, type QuestionGenProvider } from '@/lib/integrations/question-gen';
import type { Passage } from '@/lib/integrations/vector/types';

export const NO_ANSWER = 'ไม่พบในเอกสาร';
const MODEL = 'claude-sonnet-5';

const SYSTEM = [
  "You answer an administrator's question about a Thai company's DBD registration documents using ONLY the passages provided.",
  'Answer in the language of the question (Thai, English or Chinese) in at most three sentences, quoting figures and names exactly as written.',
  'After each fact cite its source as (document name, หน้า n).',
  `If the passages do not contain the answer, reply exactly: ${NO_ANSWER}`,
].join(' ');

function passageBlock(passages: Passage[], documentNames: Map<string, string>): string {
  return passages
    .map((p, i) => `[${i + 1}] ${documentNames.get(p.documentId) ?? p.documentId}, หน้า ${p.page}\n${p.text}`)
    .join('\n\n');
}

/**
 * Grounded answer for "Ask the documents" (spec §8). Uses the question-generation provider
 * rule: claude with a key, fake in dev (echoes the best passage), off in production without a key.
 */
export async function answerFromPassages(
  question: string,
  passages: Passage[],
  documentNames: Map<string, string>,
  provider: QuestionGenProvider = resolveQuestionGenProvider(),
  client?: Anthropic,
): Promise<string | null> {
  if (provider === 'off') return null;
  if (passages.length === 0) return NO_ANSWER;
  if (provider === 'fake') {
    // The line of the best passage that shares most with the question, e.g. "ทุนจดทะเบียน 2,000,000 บาท".
    const best = passages[0];
    const lines = best.text.split('\n');
    const line = [...lines].sort((a, b) => trigramOverlap(question, b) - trigramOverlap(question, a))[0];
    return `${line} (${documentNames.get(best.documentId) ?? best.documentId}, หน้า ${best.page})`;
  }
  // Created lazily: the SDK constructor throws without ANTHROPIC_API_KEY, which fake/off never need.
  const response = await (client ?? new Anthropic()).messages.create({
    model: MODEL,
    max_tokens: 600,
    system: SYSTEM,
    messages: [
      { role: 'user', content: `${passageBlock(passages, documentNames)}\n\nคำถาม: ${question}` },
    ],
  });
  const text = response.content.find((b) => b.type === 'text');
  return text && text.type === 'text' ? text.text.trim() : NO_ANSWER;
}
```

- [ ] **Step 4: Run the unit test**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/integrations/answer.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Server actions**

Append to `app/[locale]/(admin)/admin/dbd-records/actions.ts` (add the imports `enqueueIndexJob`, `searchRecordPassages` from `@/lib/db/dbd-index`, `listDbdDocuments` from `@/lib/db/dbd-records`, `getVectorStore` from `@/lib/integrations/vector`, `answerFromPassages` from `@/lib/integrations/rag/answer`):

```ts
/** Puts a failed or stuck document back in the queue from page 1 (P14). */
export async function retryIndexAction(formData: FormData): Promise<void> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const documentId = String(formData.get('documentId') ?? '');
  await requireAdmin(locale);
  const db = await createSupabaseServerClient();
  const docs = await listDbdDocuments(db, id);
  if (!docs.some((d) => d.id === documentId)) return;
  await enqueueIndexJob(db, { recordId: id, documentId, kind: 'reindex' });
  revalidatePath(`/${locale}/admin/dbd-records/${id}`);
}

export type AskState = {
  question: string;
  answer: string | null;
  passages: { document: string; page: number; text: string }[];
  error: 'empty' | 'not_indexed' | 'unavailable' | null;
};

/** "Ask the documents": retrieval + a grounded answer, never free-form knowledge (spec §8). */
export async function askDocumentsAction(_prev: AskState, formData: FormData): Promise<AskState> {
  const locale = String(formData.get('locale') ?? 'th');
  const id = String(formData.get('id') ?? '');
  const question = String(formData.get('question') ?? '').trim().slice(0, 300);
  await requireAdmin(locale);
  const empty: AskState = { question, answer: null, passages: [], error: null };
  if (question.length < 2) return { ...empty, error: 'empty' };
  const vector = getVectorStore();
  if (!vector) return { ...empty, error: 'unavailable' };
  const db = await createSupabaseServerClient();
  const docs = await listDbdDocuments(db, id);
  if (!docs.some((d) => d.index_status === 'ready')) return { ...empty, error: 'not_indexed' };
  const names = new Map(docs.map((d) => [d.id, d.original_name]));
  const passages = (await searchRecordPassages(vector, id, question, { topK: 5 })) ?? [];
  const answer = await answerFromPassages(question, passages, names);
  return {
    question,
    answer,
    passages: passages.map((p) => ({ document: names.get(p.documentId) ?? '', page: p.page, text: p.text })),
    error: null,
  };
}
```

(One action serves both "Retry" and "Re-index": both reset the job to page 1; the buttons differ only in when they are shown.)

- [ ] **Step 6: Messages**

Add under `admin.dbd` in each file (th shown; en/zh with equivalent copy):

```json
"index": {
  "label": "ดัชนีค้นหา",
  "status": {
    "none": "ยังไม่มีดัชนี",
    "queued": "รอจัดทำดัชนี",
    "indexing": "กำลังอ่าน {done}/{total} หน้า",
    "ready": "พร้อม ({total} หน้า)",
    "failed": "ล้มเหลว",
    "skipped": "ปิดใช้งาน"
  },
  "retry": "ลองใหม่",
  "reindex": "จัดทำดัชนีใหม่",
  "hint": "ระบบอ่านเอกสารทีละ 5 หน้าในเบื้องหลัง ประมาณ 1 นาทีต่อรอบ สถานะจะอัปเดตเมื่อโหลดหน้าใหม่"
},
"ask": {
  "title": "ถามเอกสาร",
  "hint": "ตอบจากข้อความในเอกสารที่อัปโหลดเท่านั้น พร้อมระบุหน้า ใช้ตรวจสอบค่าที่ระบบอ่านมาได้",
  "placeholder": "เช่น ทุนจดทะเบียนเท่าไร / ใครเป็นผู้ถือหุ้น",
  "submit": "ถาม",
  "asking": "กำลังค้นหา…",
  "passages": "ข้อความจากเอกสาร",
  "source": "{document} · หน้า {page}",
  "errors": {
    "empty": "พิมพ์คำถามก่อน",
    "not_indexed": "ยังไม่มีดัชนีของเอกสาร รอให้สถานะเป็น \"พร้อม\" ก่อน",
    "unavailable": "ปิดใช้งานการค้นหา (ไม่ได้ตั้งค่า VECTOR_PROVIDER)"
  },
  "noAnswer": "ไม่มีคำตอบจากโมเดล แสดงเฉพาะข้อความที่ค้นพบ"
}
```

English: label "Search index"; statuses "Not indexed" / "Queued" / "Reading {done}/{total} pages" / "Ready ({total} pages)" / "Failed" / "Disabled"; retry "Retry"; reindex "Re-index"; hint "Documents are read five pages at a time in the background (about a minute per run); reload to refresh the status."; ask.title "Ask the documents"; hint "Answers come only from the uploaded documents, with the page — use it to check what was read."; placeholder "e.g. What is the registered capital? / Who holds shares?"; submit "Ask"; asking "Searching…"; passages "Passages from the documents"; source "{document} · page {page}"; errors.empty "Type a question first"; errors.not_indexed "The documents are not indexed yet — wait until the status is \"Ready\""; errors.unavailable "Search is disabled (VECTOR_PROVIDER not configured)"; noAnswer "No model answer available; showing the passages found".
Chinese: "搜索索引"; "未建索引" / "排队中" / "正在读取 {done}/{total} 页" / "就绪（{total} 页）" / "失败" / "已停用"; "重试"; "重新建索引"; "系统在后台每次读取 5 页（每轮约 1 分钟），刷新页面查看状态。"; "询问文件"; "仅根据已上传的文件内容回答并标注页码，可用于核对读取结果。"; "例如：注册资本是多少？/ 股东有哪些？"; "提问"; "搜索中…"; "文件原文"; "{document} · 第 {page} 页"; "请先输入问题"; "文件尚未建索引，请等待状态变为“就绪”"; "搜索已停用（未配置 VECTOR_PROVIDER）"; "模型未返回答案，仅显示找到的原文".

- [ ] **Step 7: UI — document status, buttons, Ask box**

`record-tools.tsx`: extend `DocumentSummary`:

```ts
export type DocumentSummary = {
  id: string;
  name: string;
  type: string | null;
  sizeBytes: number;
  pageCount: number | null;
  indexStatus: 'none' | 'queued' | 'indexing' | 'ready' | 'failed' | 'skipped';
  indexedPages: number;
  indexError: string | null;
};
```

Import `retryIndexAction` and render, inside each `<li>` after the size span:

```tsx
                <span
                  data-testid="index-status"
                  data-status={doc.indexStatus}
                  title={doc.indexError ?? undefined}
                  className={`rounded px-1 text-xs ${doc.indexStatus === 'ready' ? 'bg-green-100' : doc.indexStatus === 'failed' ? 'bg-red-100' : 'bg-gray-100'}`}
                >
                  {t(`index.status.${doc.indexStatus}` as 'index.status.ready', {
                    done: doc.indexedPages,
                    total: doc.pageCount ?? 0,
                  })}
                </span>
                {(doc.indexStatus === 'failed' || doc.indexStatus === 'ready') && (
                  <form action={retryIndexAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="id" value={id} />
                    <input type="hidden" name="documentId" value={doc.id} />
                    <button type="submit" className="text-xs underline" data-testid="reindex-button">
                      {doc.indexStatus === 'failed' ? t('index.retry') : t('index.reindex')}
                    </button>
                  </form>
                )}
```

and `<p className="text-xs text-gray-600">{t('index.hint')}</p>` under the document list.

```tsx
// app/[locale]/(admin)/admin/dbd-records/[id]/ask-documents.tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { askDocumentsAction, type AskState } from '../actions';

const initial: AskState = { question: '', answer: null, passages: [], error: null };

/** Admin Q&A over the record's indexed documents — answers cite pages (P14, spec §8). */
export function AskDocuments({ recordId }: { recordId: string }) {
  const locale = useLocale();
  const t = useTranslations('admin.dbd.ask');
  const [state, formAction, pending] = useActionState(askDocumentsAction, initial);
  return (
    <form action={formAction} className="grid max-w-2xl gap-3 rounded border p-4" data-testid="ask-documents">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="id" value={recordId} />
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <p className="text-xs text-gray-600">{t('hint')}</p>
      <div className="flex gap-2">
        <input
          name="question"
          defaultValue={state.question}
          placeholder={t('placeholder')}
          maxLength={300}
          data-testid="ask-question"
          className="w-full rounded border px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          data-testid="ask-submit"
          className="rounded bg-gray-900 px-4 py-1 text-sm text-white disabled:opacity-50"
        >
          {pending ? t('asking') : t('submit')}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {t(`errors.${state.error}`)}
        </p>
      )}
      {!state.error && state.question && (
        <div className="grid gap-2 text-sm">
          <p data-testid="ask-answer" className="rounded bg-gray-50 p-2 whitespace-pre-wrap">
            {state.answer ?? t('noAnswer')}
          </p>
          {state.passages.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600">{t('passages')}</p>
              <ol data-testid="ask-passages" className="grid gap-1">
                {state.passages.map((p, i) => (
                  <li key={i} className="rounded border p-2">
                    <p className="text-xs text-gray-500">{t('source', { document: p.document, page: p.page })}</p>
                    <p className="whitespace-pre-wrap">{p.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
```

`page.tsx`: map the new fields into `documents=` (`pageCount: d.page_count, indexStatus: d.index_status as DocumentSummary['indexStatus'], indexedPages: d.indexed_pages, indexError: d.index_error`) and render `<AskDocuments recordId={record.id} />` after `<InterviewForm … />`.

- [ ] **Step 8: Write the e2e test**

```ts
// tests/e2e/dbd-index.spec.ts
import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';

test('an uploaded pack is indexed by the cron in slices and the admin can ask it questions with page citations', async ({
  page,
  request,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/dbd-records/new');
  await page.getByTestId('upload-first-file').setInputFiles('tests/fixtures/three-pages.pdf');
  await page.getByTestId('upload-first-submit').click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}/);

  const status = page.getByTestId('index-status').first();
  await expect(status).toHaveAttribute('data-status', 'queued');

  // Asking before the index is ready is refused, not answered from thin air.
  await page.getByTestId('ask-question').fill('ทุนจดทะเบียน');
  await page.getByTestId('ask-submit').click();
  await expect(page.getByRole('alert').filter({ hasText: 'ยังไม่มีดัชนี' })).toBeVisible();

  // The cron rejects unauthenticated calls and reads the whole document with the secret.
  expect((await request.get('/api/cron/index')).status()).toBe(401);
  const run = await request.get('/api/cron/index', {
    headers: { Authorization: 'Bearer local-cron-secret-for-dev' },
  });
  expect(run.status()).toBe(200);
  const summary = await run.json();
  expect(summary.completed).toBeGreaterThanOrEqual(1); // other specs may have queued jobs too

  await page.reload();
  await expect(status).toHaveAttribute('data-status', 'ready');
  await expect(status).toContainText('3');

  await page.getByTestId('ask-question').fill('ทุนจดทะเบียน');
  await page.getByTestId('ask-submit').click();
  await expect(page.getByTestId('ask-answer')).toContainText('2,000,000');
  await expect(page.getByTestId('ask-answer')).toContainText('หน้า 1');
  await expect(page.getByTestId('ask-passages').locator('li').first()).toContainText('หน้า 1');

  // Re-index queues the document again from page 1.
  await page.getByTestId('reindex-button').first().click();
  await expect(page.getByTestId('index-status').first()).toHaveAttribute('data-status', 'queued');
});
```

- [ ] **Step 9: Run typecheck, lint and the new e2e test**

Run: `pnpm typecheck && pnpm lint && pnpm exec playwright test tests/e2e/dbd-index.spec.ts`
Expected: clean; 1 passed. (The fake answer is the best passage's line that matches the question most — "ทุนจดทะเบียน 2,000,000 บาท (pack.pdf, หน้า 1)" — so the assertion does not depend on line order.)

- [ ] **Step 10: Commit**

```bash
git add lib/integrations/rag "app/[locale]/(admin)/admin/dbd-records" messages tests/unit/integrations/answer.test.ts tests/e2e/dbd-index.spec.ts
git commit -m "feat(p14): index status, retry/re-index and Ask the documents on the record page

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Pinecone setup/smoke scripts and documentation

**Files:**
- Create: `scripts/vector-setup.mjs`, `scripts/vector-smoke.mjs`
- Modify: `package.json` (scripts `vector:setup`, `vector:smoke`)
- Modify: `docs/decisions-log.md` (D40, D41, D44), `docs/runbooks/production-setup.md` (§3 Pinecone, §5 smoke, env vars, Node 22), `docs/runbooks/operations.md` ("Index stuck / re-index"), `docs/security-checklist.md` (Pinecone processor), `README.md` (specs P3–P14, D1–D44)

- [ ] **Step 1: Setup script**

```js
// scripts/vector-setup.mjs
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
console.log(`index ${name} ready at ${model.host} (${region}); namespace per environment via PINECONE_NAMESPACE`);
```

- [ ] **Step 2: Smoke script**

```js
// scripts/vector-smoke.mjs
// Opt-in check against the real index: upsert two synthetic chunks in a throwaway namespace,
// search, then delete them. No company data involved.
import { config } from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';

config({ path: '.env.local' });
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.index({ name: process.env.PINECONE_INDEX || 'thai-portal-dbd', namespace: `smoke-${Date.now()}` });
const ids = ['smoke#1#0', 'smoke#2#0'];
await index.upsertRecords({
  records: [
    { _id: ids[0], chunk_text: 'ทุนจดทะเบียน 1,000,000 บาท', record_id: 'smoke', document_id: 'smoke', document_type: 'certificate', page: 1, chunk_index: 0 },
    { _id: ids[1], chunk_text: 'วัตถุที่ประสงค์ ประกอบกิจการค้าปลีก', record_id: 'smoke', document_id: 'smoke', document_type: 'objectives_sheet', page: 2, chunk_index: 0 },
  ],
});
// Serverless indexes are eventually consistent; give the upsert a moment.
await new Promise((r) => setTimeout(r, 10_000));
const res = await index.searchRecords({
  query: { topK: 2, inputs: { text: 'ทุนจดทะเบียนเท่าไร' }, filter: { record_id: { $eq: 'smoke' } } },
  fields: ['chunk_text', 'page'],
  rerank: { model: 'bge-reranker-v2-m3', rankFields: ['chunk_text'], topN: 1 },
});
console.log(JSON.stringify(res.result.hits, null, 2));
await index.deleteAll();
console.log(res.result.hits[0]?.fields?.page === 1 ? 'smoke OK' : 'smoke FAILED: page 1 expected first');
process.exit(res.result.hits[0]?.fields?.page === 1 ? 0 : 1);
```

Add to `package.json` scripts: `"vector:setup": "node scripts/vector-setup.mjs"`, `"vector:smoke": "node scripts/vector-smoke.mjs"`.

- [ ] **Step 3: Documentation**

`docs/decisions-log.md` — append rows:

```
| 2026-09-21 | D40 | DBD packs are indexed in Pinecone (integrated embedding `multilingual-e5-large`, rerank `bge-reranker-v2-m3`): one namespace per environment, `record_id` metadata filter, deterministic chunk ids `<document_id>#<page>#<n>` mirrored in `dbd_chunks`; `VECTOR_PROVIDER=pinecone\|fake\|off` with a trigram-scoring fake. Chunk text (names, addresses, ID numbers) therefore lives at Pinecone — a new processor (US region on the Starter plan) | P14 spec, `lib/integrations/vector` |
| 2026-09-21 | D41 | Packs are read once, in 5-page slices, by a cron-driven job (`index_jobs`, leased claims, 5 attempts with backoff); Claude Sonnet 5 transcribes pages to plain text with `=== PAGE n ===` markers; `dbd_pages` is the source of truth and chunks never cross pages | migration 0015, `lib/db/dbd-index.ts` |
| 2026-09-21 | D44 | Admins get "Ask the documents": retrieval over the record's index plus an answer grounded only in the retrieved passages, each cited with document and page; learners will see passages of their own record only (P14b) | `app/[locale]/(admin)/admin/dbd-records/[id]/ask-documents.tsx` |
```

`docs/runbooks/production-setup.md`:
- §1 migrations line: "All migrations (0001–0015) apply in order".
- §2 Vercel: add "Project → Settings → General → Node.js Version = 22.x (the Pinecone SDK requires Node ≥ 22)" and the second cron path (`/api/cron/index`, from `vercel.json`).
- §3 add:

```
### Pinecone (DBD retrieval index)
1. Create a Pinecone project; note the API key. Starter plan = AWS us-east-1 only; Singapore (ap-southeast-1) needs Builder.
2. Locally: put `PINECONE_API_KEY=…` in `.env.local` and run `pnpm vector:setup` once (creates `thai-portal-dbd` with integrated embedding; idempotent). `pnpm vector:smoke` proves search + rerank work.
3. Vercel env vars: `PINECONE_API_KEY`, `PINECONE_NAMESPACE=production` (staging uses `staging`), optionally `PINECONE_INDEX`, `PINECONE_REGION`, `TRANSCRIPTION_MODEL`, `TRANSCRIBE_SLICE_PAGES`. Redeploy; `/api/health` shows `vector: "pinecone"`.
4. Every document uploaded before this step shows "Not indexed"; open its record and click **Re-index**.
```
- §5 smoke test: add "upload a multi-page PDF → the document shows *Queued* → within two minutes *Ready (N pages)* → **Ask the documents** returns a page-cited answer".

`docs/runbooks/operations.md` — add:

```
### Index stuck or failed
- Status stays *Queued*: check Vercel → Cron Jobs → `/api/cron/index` runs every minute and returns 200; `CRON_SECRET` must be set.
- *Failed* with `unreadable_pdf`: the file is not a standard PDF (encrypted/corrupt) — re-export and upload again.
- *Failed* with "missing page": the model skipped pages twice; click **Retry**. Persistent failures on scans: set `TRANSCRIPTION_MODEL=claude-opus-5` and retry.
- Pinecone down: jobs back off (1–16 min) and resume by themselves; uploads keep working.
- Deleting a record with SQL leaves its vectors behind — remove its documents from the record page first, or run `deleteMany` by prefix from `scripts/`.
```

`docs/security-checklist.md` — add a row: "DBD chunk text stored at Pinecone (third-party processor, US region on Starter); `PINECONE_API_KEY` server-only; vectors deleted with the document; learners never query another record — verified by `tests/integration/dbd-index.rls.test.ts`, `tests/integration/dbd-index.upload.test.ts`".

`README.md` — specs "P3–P14", decisions "D1–D44".

- [ ] **Step 4: Format and commit**

Run: `pnpm exec prettier --write docs scripts package.json && pnpm lint`
Expected: clean.

```bash
git add scripts/vector-setup.mjs scripts/vector-smoke.mjs package.json docs README.md
git commit -m "docs(p14): Pinecone setup/smoke scripts, D40/D41/D44, runbooks and security note

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Full verification and hand-off

**Files:** none new.

- [ ] **Step 1: Run everything**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm check:secrets && pnpm test:unit && pnpm test:integration && pnpm test:e2e`
Expected: all green — unit ≥ 135, integration ≥ 95, e2e 32 (31 + `dbd-index.spec.ts`). `check:secrets` proves no `PINECONE_API_KEY` reaches a client bundle (the vector adapter and the answerer import `server-only`).

- [ ] **Step 2: Manual check with the real providers (optional, needs keys in `.env.local`)**

Run `pnpm dev`, upload a 10–20 page *synthetic* or owner-approved PDF, call `curl -H "Authorization: Bearer local-cron-secret-for-dev" http://localhost:3000/api/cron/index` twice, watch the status move *Queued → Reading 5/12 → Ready*, ask "ทุนจดทะเบียนเท่าไร".
Expected: a Thai answer citing the certificate page; `pnpm vector:smoke` prints `smoke OK`.

- [ ] **Step 3: Finish the branch**

Use `superpowers:finishing-a-development-branch`: full suite green → fast-forward merge `feature/p14-dbd-rag` into `main` → push (Vercel deploys) → apply migration `20260921000015_dbd_index.sql` to staging with the Supabase MCP `apply_migration` → set `PINECONE_API_KEY` / `PINECONE_NAMESPACE=staging` in Vercel and run `pnpm vector:setup` locally (owner) → verify `/api/health` shows `vector: "pinecone"`.

---

## Self-review notes

- **Spec coverage (stage 1):** §3 facts → Task 7/11; §4 data model → Task 5; §5 pipeline steps 1–5 → Tasks 2, 6, 8, 9 (step 6, classification of oversized documents, is P14c); §5.1 chunker → Task 3; §7 adapter → Task 7 (`removeDocument`/`removeRecord` collapsed into `remove(ids)`, ids come from `dbd_chunks`); §8 Ask the documents → Task 10; §10 privacy/ops → Task 11; §11 tests → Tasks 1–10 (`vector:smoke` → Task 11).
- **Review Focus coverage:** 1 → Task 9 test 1; 2 → Task 8 test "retries … then fails"; 3 → Task 8 test "two claims"; 4 → Task 8 test "re-indexing removes chunks"; 5 → Task 3 test "boundary-less line".
- **Names used across tasks:** `Slice`, `TranscribedPage`, `planSlice`, `parsePageMarkers`, `formatPageMarkers`, `MissingPagesError` (Task 1) — used in 6, 8; `countPages`, `slicePdf` (Task 2) — used in 8, 9; `chunkPage`, `Chunk`, `chunkId` (Task 3) — used in 7, 8; `trigramOverlap` (Task 4) — used in 7; `DbdExtractor.transcribe` (Task 6) — used in 8; `VectorStore`, `Passage`, `FakeVectorStore`, `loadChunksFromDb`, `getVectorStore`, `resolveVectorProvider` (Task 7) — used in 8, 9, 10; `enqueueIndexJob`, `listChunkIds`, `processIndexJobs`, `searchRecordPassages` (Task 8) — used in 9, 10; `answerFromPassages`, `NO_ANSWER` (Task 10).

## Amendments after the whole-branch review (2026-09-21)

The review found the plan contradicting itself in three places; the code follows the corrected
rule, recorded here so the plan stays an honest account:

- Task 2: `countPages`/`slicePdf` still load with `ignoreEncryption: true`, but now throw
  `unreadable_pdf` when `PDFDocument.isEncrypted` (Review Focus #1 named encrypted files; the
  original Task 2 code let them through). Fixture `tests/fixtures/encrypted.pdf` is generated by
  `scripts/make-fixture-pdf.mjs`.
- Task 8/9: the worker fails a job whose `attempts` already reached the ceiling when it is
  claimed (a lease that expired while `running` = a run that died); the cron route starts no new
  slice after 150 s of its 300 s (the spec's "fewer than 90 s remaining" was too thin for dense
  Thai slices); transcription calls carry a 150 s timeout; `TRANSCRIBE_SLICE_PAGES` is clamped to
  1..100.
- Task 6: the transcriber reads `finalMessage()` and refuses `stop_reason = max_tokens`
  (`too_large`) and `refusal` (`invalid_output`) instead of storing a truncated page;
  `max_tokens` is 32,000.
- Task 10/11: the index button is shown for every status except `queued`/`indexing`
  (`canRequestIndex`), so documents uploaded before P14 or while the provider was off can be
  indexed as the runbook says; the action refuses to reset live work.
- Task 10: `askRecordDocuments` (data layer) reports a dead store as `unavailable` and a failed
  model answer as `answer: null`; `removeDocumentAction` keeps the row and shows a banner when
  the vectors cannot be removed.
- Task 8: chunks are re-labelled (rows + vector metadata) when the document type is classified
  while the job runs.
- Interface drift from spec §7, kept on purpose: `VectorStore.remove(ids)` replaces
  `removeDocument`/`removeRecord` (ids come from `dbd_chunks`), and `VectorError` codes are
  `not_configured | unavailable | provider`. P14b/P14c build on these names.

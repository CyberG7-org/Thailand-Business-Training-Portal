# P14c — Oversized Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A DBD pack of any size fills the record: documents over `DIRECT_READ_MAX_PAGES` are excluded from the one-pass direct read, classified from their first transcribed slice, and their fields are extracted from the transcripts once the index is ready — single facts through retrieval, shareholder/objective/promoter lists through page-by-page sweeps — always filling empty fields only.

**Architecture:** Three new extractor methods (`classify`, `extractFacts`, `sweep`) with small union-free structured-output schemas, implemented for Claude and the fake. `runExtraction` plans which documents the direct pass may read (page and byte budgets, upload order) and reports `deferred` when nothing qualifies. A new `lib/db/transcript-extraction.ts` runs the transcript path for a record (retrieval → facts call → `applyExtractionToRecord`; typed sweeps over `dbd_pages` → Level 2 lists), triggered by the index worker when an oversized document becomes `ready` and by "Read the document again". The worker classifies a document after its first slice when its type is unknown.

**Tech Stack:** Next.js 16, Supabase Postgres, `@anthropic-ai/sdk` (streamed structured output, zod), Vitest 5, Playwright. Builds on P14a (`dbd_pages`, `dbd_chunks`, `processIndexJobs`, `searchRecordPassages`), P14b (`directReadMaxPages`, passages), and the streaming/flat-schema hotfix (`dbdExtractionApiSchema`, `fromApiExtraction`).

**Spec:** `docs/superpowers/specs/2026-09-21-p14-dbd-rag-index-design.md` — §5 step 1 (direct-pass selection) and step 6 (classification), §6 (transcript path), §9 stage 3, D42.

## Global Constraints

- Direct pass: documents are taken in upload order while `page_count === null || page_count <= directReadMaxPages()` (default 20; `null` = uploaded before P14 = attach) and the cumulative size stays ≤ 30 MB; excluded documents are never sent whole. When no document qualifies but documents exist, the pass is `deferred` (a distinct `ExtractionError` code), not a failure; uploads and the record stay usable.
- Transcript path runs only for records that are not `confirmed`, only over documents with `index_status = 'ready'`, and fills empty fields only (D37): Level 1/3 through `applyExtractionToRecord`; Level 2 per list (`shareholders`, `objectives`, `promoters`, `share_structure`) only when the stored list/structure is empty (D38). Provenance entries `{confidence, source_page, source_document}` are written for the fields it fills and never overwrite entries of fields it did not fill.
- Retrieval for facts: fixed Thai queries (one per field group), top 3 passages each, deduplicated; the facts call receives passages labelled `document <position>, page <n>` so `source_document`/`source_page` are meaningful.
- Sweeps: pages of each `ready` document typed `shareholder_list`, `objectives_sheet`, `memorandum` or `certificate` are read from `dbd_pages` in batches of 10; results are concatenated in page order and deduplicated (shareholders/promoters by `name` + `nationality`, objectives by `no` then `text`).
- Classification: after the first slice of a document whose `document_type` is null, `classify(firstPageText)` sets the type (never overwrites a known type).
- All new model calls use `messages.stream(...).finalMessage()` with union-free schemas (no `.nullable()`/`.optional()` in anything sent to the API); a unit test counts zero union-typed parameters for each new API schema.
- Fake providers keep every suite key-free: the fake extractor answers `classify` by keywords, `extractFacts` with the fictional sample facts, `sweep` with fictional lists. E2E uses a generated 25-page fixture (`tests/fixtures/twenty-five-pages.pdf`) so the oversized path is exercised without changing `DIRECT_READ_MAX_PAGES` for the other specs.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, unit, integration, e2e stay green; commits end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Review Focus

1. **A pack mixing a small certificate with a 200-page บอจ.5** — the certificate is still read directly on upload (instant fill) and the big list fills later; neither path overwrites the other's values (tests in Tasks 3 and 5).
2. **The transcript path runs after the admin confirmed the record** (job finishes late) — it must do nothing (test in Task 5).
3. **Sweep batches that repeat a shareholder across a page boundary** — deduplicated, row order kept (test in Task 4).
4. **A facts call that returns a value the record already has** — existing value wins, provenance for that field untouched (test in Task 5).
5. **Classification when the first page is blank or unreadable** — falls back to `other` without throwing; the job continues (tests in Tasks 2 and 6).

---

### Task 1: Direct-pass planning (pure) and the `deferred` outcome

**Files:**
- Create: `lib/domain/extraction-plan.ts`
- Modify: `lib/integrations/extraction/types.ts` (`ExtractionError` code `'deferred'`)
- Modify: `lib/db/extraction.ts` (`runExtraction` uses the plan)
- Modify: `app/[locale]/(admin)/admin/dbd-records/actions.ts` (`fillFromDocument` maps `deferred`), `[id]/page.tsx` + `record-tools.tsx` (banner/status copy), `messages/*.json`
- Test: `tests/unit/domain/extraction-plan.test.ts`, `tests/integration/extraction.test.ts` (new case)

**Interfaces:**
- Produces: `planDirectRead(documents: { id: string; page_count: number | null; size_bytes: number }[], limits?: { maxPages?: number; maxBytes?: number }) → { direct: string[]; deferred: string[] }`; `ExtractionError` code `'deferred'`; `ToolState.extraction` gains `'deferred'`.

- [ ] **Step 1: Write the failing unit test**

```ts
// tests/unit/domain/extraction-plan.test.ts
import { describe, expect, it } from 'vitest';
import { planDirectRead } from '@/lib/domain/extraction-plan';

const MB = 1024 * 1024;

describe('planDirectRead', () => {
  it('keeps small and pre-P14 documents, defers documents over the page limit', () => {
    const plan = planDirectRead(
      [
        { id: 'cert', page_count: 3, size_bytes: 1 * MB },
        { id: 'old', page_count: null, size_bytes: 2 * MB },
        { id: 'list', page_count: 200, size_bytes: 9 * MB },
      ],
      { maxPages: 20, maxBytes: 30 * MB },
    );
    expect(plan).toEqual({ direct: ['cert', 'old'], deferred: ['list'] });
  });

  it('stops adding documents once the byte budget is spent, in upload order', () => {
    const plan = planDirectRead(
      [
        { id: 'a', page_count: 5, size_bytes: 20 * MB },
        { id: 'b', page_count: 5, size_bytes: 15 * MB },
        { id: 'c', page_count: 5, size_bytes: 1 * MB },
      ],
      { maxPages: 20, maxBytes: 30 * MB },
    );
    expect(plan).toEqual({ direct: ['a', 'c'], deferred: ['b'] });
  });

  it('uses the configured defaults', () => {
    expect(planDirectRead([{ id: 'x', page_count: 21, size_bytes: 1 }]).deferred).toEqual(['x']);
    expect(planDirectRead([{ id: 'x', page_count: 20, size_bytes: 1 }]).direct).toEqual(['x']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/extraction-plan.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/extraction-plan`.

- [ ] **Step 3: Implement the planner and the error code**

```ts
// lib/domain/extraction-plan.ts
import { directReadMaxPages } from './rag/jobs';

/** Request ceiling for document content in one model call (the API rejects larger payloads). */
export const DIRECT_READ_MAX_BYTES = 30 * 1024 * 1024;

export type DirectReadPlan = { direct: string[]; deferred: string[] };

/**
 * Which uploaded documents the one-pass direct read may take (spec §5.1, D42): small enough in
 * pages (unknown = uploaded before P14 = small) and within the byte budget, in upload order.
 * Everything else waits for the transcript path.
 */
export function planDirectRead(
  documents: { id: string; page_count: number | null; size_bytes: number }[],
  limits: { maxPages?: number; maxBytes?: number } = {},
): DirectReadPlan {
  const maxPages = limits.maxPages ?? directReadMaxPages();
  const maxBytes = limits.maxBytes ?? DIRECT_READ_MAX_BYTES;
  const direct: string[] = [];
  const deferred: string[] = [];
  let bytes = 0;
  for (const doc of documents) {
    const small = doc.page_count === null || doc.page_count <= maxPages;
    if (small && bytes + doc.size_bytes <= maxBytes) {
      direct.push(doc.id);
      bytes += doc.size_bytes;
    } else {
      deferred.push(doc.id);
    }
  }
  return { direct, deferred };
}
```

`types.ts`: add `| 'deferred'` to the `ExtractionError` code union (comment: `/** Nothing small enough to read whole; the transcript path fills the record when its index is ready. */`).

`lib/db/extraction.ts` `runExtraction`: after loading `documents`, compute `const plan = planDirectRead(documents);` and

```ts
  if (plan.direct.length === 0) {
    throw new ExtractionError('Every document is too large to read whole', 'deferred');
  }
  const readable = documents.filter((d) => plan.direct.includes(d.id));
```

then download/send only `readable` (replace the loop over `documents`; the Level 3 write-back of `document_type` uses `readable[info.index - 1]`). Remove the `MAX_TOTAL_PDF_BYTES` throw from `ClaudeDbdExtractor.extract`? Keep it as a safety net (the plan guarantees the budget).

`actions.ts` `fillFromDocument`: in the catch, `if (e instanceof ExtractionError && e.code === 'deferred') return { extraction: 'deferred', applied: [] };` before the generic failure. `ToolState.extraction` union gains `'deferred'`; `createFromDocumentAction` already forwards `outcome.extraction` in the query string.

Record page (`[id]/page.tsx`): add a banner for `extraction === 'deferred'` (`data-testid="autofill-banner"`, gray, `t('deferredFill')`). `record-tools.tsx` `FillOutcome`: `state.extraction === 'deferred'` → `<p role="status" data-testid="extract-status">{t('deferredFill')}</p>`.

Messages `admin.dbd.deferredFill`: th `"เอกสารมีหลายหน้า ระบบกำลังอ่านทีละส่วนในเบื้องหลัง ช่องข้อมูลจะถูกเติมให้เมื่อสถานะดัชนีเป็น \"พร้อม\" (โหลดหน้าใหม่เพื่อดู)"`, en `"The documents are too long to read in one pass; they are being read in the background and the fields will fill in when the index status is \"Ready\" (reload to see them)."`, zh `"文件页数较多，系统正在后台分段读取；索引状态为“就绪”后字段会自动填入（刷新页面查看）。"`.

- [ ] **Step 4: Integration test for the deferred pass**

Append to `tests/integration/extraction.test.ts` (inside the `runExtraction` describe, after the existing cases; it needs the record with one uploaded document from the earlier case):

```ts
  it('defers the pass when every document is too large to read whole (P14c)', async () => {
    const svc = adminClient();
    await svc.from('dbd_documents').update({ page_count: 25 }).eq('record_id', recordId);
    await expect(runExtraction(asAdmin, recordId, new FakeDbdExtractor())).rejects.toMatchObject({
      code: 'deferred',
    });
    const { data } = await asAdmin
      .from('dbd_records')
      .select('extraction_status')
      .eq('id', recordId)
      .single();
    expect(data?.extraction_status).toBe('extracted'); // unchanged by a deferred pass
    await svc.from('dbd_documents').update({ page_count: 1 }).eq('record_id', recordId);
  });
```

- [ ] **Step 5: Run the tests**

Run: `pnpm typecheck && pnpm exec vitest run --config vitest.config.ts tests/unit/domain/extraction-plan.test.ts && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/extraction.test.ts`
Expected: PASS (3 unit; the extraction suite with the new case).

- [ ] **Step 6: Commit**

```bash
git add lib/domain/extraction-plan.ts lib/integrations/extraction/types.ts lib/db/extraction.ts "app/[locale]/(admin)/admin/dbd-records" messages tests/unit/domain/extraction-plan.test.ts tests/integration/extraction.test.ts
git commit -m "feat(p14c): direct read takes only small documents; oversized packs are deferred, not failed

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Extractor methods — `classify`, `extractFacts`, `sweep` (schemas, Claude, fake)

**Files:**
- Create: `lib/integrations/extraction/transcript-schema.ts`
- Modify: `lib/integrations/extraction/types.ts`, `claude.ts`, `fake.ts`
- Modify: `tests/integration/extraction.test.ts` (`failing` stub gains the three methods), `tests/integration/dbd-index.test.ts` (`transcriberWith` gains them)
- Test: `tests/unit/integrations/transcript-extraction.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type TranscriptPassage = { documentPosition: number; page: number; text: string };
  type SweepResult = { objectives: {no: number|null; text: string}[]; shareholders: {name; nationality: string|null; shares: number|null; percent: number|null}[]; promoters: {name; nationality: string|null}[]; share_structure: { total_shares: number|null; par_value: number|null; paid_up_capital: number|null; share_type: string|null } };
  interface DbdExtractor {
    classify(firstPageText: string): Promise<DocumentType>;               // never throws for empty text → 'other'
    extractFacts(passages: TranscriptPassage[]): Promise<DbdExtraction>;   // Level 1/3 (+directors); lists empty
    sweep(pages: TranscribedPage[], documentType: DocumentType): Promise<SweepResult>;
  }
  classifyApiSchema, sweepApiSchema (union-free), fromSweepApi(), mergeSweeps(results: SweepResult[]) → SweepResult (dedupe)
  fakeClassify(text) → DocumentType
  ```

- [ ] **Step 1: Write the failing unit tests**

```ts
// tests/unit/integrations/transcript-extraction.test.ts
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { describe, expect, it } from 'vitest';
import { FakeDbdExtractor, fakeClassify, fakePageText } from '@/lib/integrations/extraction/fake';
import {
  classifyApiSchema,
  mergeSweeps,
  sweepApiSchema,
  type SweepResult,
} from '@/lib/integrations/extraction/transcript-schema';

function unionCount(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;
  if (Array.isArray(node)) return node.reduce((n, item) => n + unionCount(item), 0);
  const obj = node as Record<string, unknown>;
  let count = 0;
  if (Array.isArray(obj.anyOf) || Array.isArray(obj.oneOf) || Array.isArray(obj.type)) count++;
  for (const value of Object.values(obj)) count += unionCount(value);
  return count;
}

describe('transcript-path schemas', () => {
  it('send no union-typed parameters', () => {
    for (const schema of [classifyApiSchema, sweepApiSchema]) {
      const format = zodOutputFormat(schema) as unknown as { schema: unknown };
      expect(unionCount(format.schema)).toBe(0);
    }
  });
});

describe('fake classification', () => {
  it('recognises the document kinds by their Thai headings and falls back to other', () => {
    expect(fakeClassify(fakePageText(1))).toBe('certificate');
    expect(fakeClassify(fakePageText(2))).toBe('objectives_sheet');
    expect(fakeClassify(fakePageText(3))).toBe('shareholder_list');
    expect(fakeClassify('หนังสือบริคณห์สนธิ (บอจ.2)')).toBe('memorandum');
    expect(fakeClassify('')).toBe('other');
    expect(fakeClassify('[หน้าว่าง]')).toBe('other');
  });
});

describe('mergeSweeps', () => {
  const a: SweepResult = {
    objectives: [{ no: 1, text: 'ค้าปลีก' }, { no: 2, text: 'ส่งออก' }],
    shareholders: [{ name: 'นางสาว ก', nationality: 'ไทย', shares: 100, percent: null }],
    promoters: [],
    share_structure: { total_shares: 200, par_value: null, paid_up_capital: null, share_type: null },
  };
  const b: SweepResult = {
    objectives: [{ no: 2, text: 'ส่งออก' }, { no: 3, text: 'บริการ' }],
    shareholders: [
      { name: 'นางสาว ก', nationality: 'ไทย', shares: 100, percent: null }, // repeated across the page break
      { name: 'นาย ข', nationality: 'ไทย', shares: 100, percent: null },
    ],
    promoters: [{ name: 'นาย ข', nationality: null }],
    share_structure: { total_shares: null, par_value: 10, paid_up_capital: null, share_type: null },
  };

  it('concatenates in order, drops repeats, and keeps the first non-empty structure values', () => {
    const merged = mergeSweeps([a, b]);
    expect(merged.objectives.map((o) => o.no)).toEqual([1, 2, 3]);
    expect(merged.shareholders.map((s) => s.name)).toEqual(['นางสาว ก', 'นาย ข']);
    expect(merged.promoters).toEqual([{ name: 'นาย ข', nationality: null }]);
    expect(merged.share_structure).toEqual({ total_shares: 200, par_value: 10, paid_up_capital: null, share_type: null });
  });
});

describe('fake extractor transcript methods', () => {
  it('classifies, extracts the sample facts, and sweeps fictional lists', async () => {
    const fake = new FakeDbdExtractor();
    expect(await fake.classify(fakePageText(1))).toBe('certificate');
    const facts = await fake.extractFacts([{ documentPosition: 1, page: 1, text: fakePageText(1) }]);
    expect(facts.company_name_th.value).toBe('บริษัท ตัวอย่างการสกัด จำกัด');
    expect(facts.shareholders.value).toBeNull();
    const swept = await fake.sweep([{ page: 3, text: fakePageText(3) }], 'shareholder_list');
    expect(swept.shareholders.length).toBeGreaterThan(0);
    expect((await fake.sweep([{ page: 2, text: fakePageText(2) }], 'objectives_sheet')).objectives.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/integrations/transcript-extraction.test.ts`
Expected: FAIL — cannot resolve `@/lib/integrations/extraction/transcript-schema`.

- [ ] **Step 3: Schemas and merge (pure)**

```ts
// lib/integrations/extraction/transcript-schema.ts
import { z } from 'zod';
import { DOCUMENT_TYPES } from './schema';

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Classification of one document from its first transcribed page (spec §5.6). */
export const classifyApiSchema = z.object({ document_type: z.enum(DOCUMENT_TYPES) });

/** Union-free lists for one batch of transcript pages; empty sentinels "" / 0 as in the flat schema. */
export const sweepApiSchema = z.object({
  objectives: z.array(z.object({ no: z.number().int(), text: z.string() })),
  shareholders: z.array(
    z.object({ name: z.string(), nationality: z.string(), shares: z.number(), percent: z.number() }),
  ),
  promoters: z.array(z.object({ name: z.string(), nationality: z.string() })),
  share_structure: z.object({
    total_shares: z.number(),
    par_value: z.number(),
    paid_up_capital: z.number(),
    share_type: z.string(),
  }),
});
export type SweepApi = z.infer<typeof sweepApiSchema>;

export type SweepResult = {
  objectives: { no: number | null; text: string }[];
  shareholders: { name: string; nationality: string | null; shares: number | null; percent: number | null }[];
  promoters: { name: string; nationality: string | null }[];
  share_structure: {
    total_shares: number | null;
    par_value: number | null;
    paid_up_capital: number | null;
    share_type: string | null;
  };
};

const textOrNull = (s: string) => (s.trim() === '' ? null : s);
const numberOrNull = (n: number) => (n === 0 ? null : n);

export function fromSweepApi(api: SweepApi): SweepResult {
  return {
    objectives: api.objectives.map((o) => ({ no: o.no > 0 ? o.no : null, text: o.text })),
    shareholders: api.shareholders.map((s) => ({
      name: s.name,
      nationality: textOrNull(s.nationality),
      shares: numberOrNull(s.shares),
      percent: numberOrNull(s.percent),
    })),
    promoters: api.promoters.map((p) => ({ name: p.name, nationality: textOrNull(p.nationality) })),
    share_structure: {
      total_shares: numberOrNull(api.share_structure.total_shares),
      par_value: numberOrNull(api.share_structure.par_value),
      paid_up_capital: numberOrNull(api.share_structure.paid_up_capital),
      share_type: textOrNull(api.share_structure.share_type),
    },
  };
}

export const EMPTY_SWEEP: SweepResult = {
  objectives: [],
  shareholders: [],
  promoters: [],
  share_structure: { total_shares: null, par_value: null, paid_up_capital: null, share_type: null },
};

/** Batches in page order → one list per kind; rows repeated across a page break appear once. */
export function mergeSweeps(results: SweepResult[]): SweepResult {
  const out: SweepResult = structuredClone(EMPTY_SWEEP);
  const seenObjective = new Set<string>();
  const seenPerson = new Set<string>();
  const seenPromoter = new Set<string>();
  for (const r of results) {
    for (const o of r.objectives) {
      const key = `${o.no ?? ''}|${o.text.trim()}`;
      if (seenObjective.has(key)) continue;
      seenObjective.add(key);
      out.objectives.push(o);
    }
    for (const s of r.shareholders) {
      const key = `${s.name.trim()}|${s.nationality ?? ''}`;
      if (seenPerson.has(key)) continue;
      seenPerson.add(key);
      out.shareholders.push(s);
    }
    for (const p of r.promoters) {
      const key = `${p.name.trim()}|${p.nationality ?? ''}`;
      if (seenPromoter.has(key)) continue;
      seenPromoter.add(key);
      out.promoters.push(p);
    }
    for (const k of ['total_shares', 'par_value', 'paid_up_capital', 'share_type'] as const) {
      if (out.share_structure[k] === null && r.share_structure[k] !== null) {
        (out.share_structure as Record<string, unknown>)[k] = r.share_structure[k];
      }
    }
  }
  return out;
}

export const CLASSIFY_INSTRUCTIONS = `This is the first page of one document from a Thai DBD company pack. Classify it: "certificate" (หนังสือรับรอง),
"objectives_sheet" (วัตถุที่ประสงค์), "shareholder_list" (บัญชีรายชื่อผู้ถือหุ้น, บอจ.5), "memorandum" (หนังสือบริคณห์สนธิ, บอจ.2),
"articles" (ข้อบังคับ) or "other" (blank, unreadable, or anything else).`;

export const FACTS_INSTRUCTIONS = `You receive passages transcribed from a Thai DBD company pack, each labelled with its document number and page.
Extract the company's registered particulars exactly as printed, following the same rules as for a full document pack:
never invent, empty sentinels for anything not printed, and one provenance entry per field you read with the
document number and page of the passage it came from. Leave the list fields (objectives, shareholders, promoters)
empty — they are read separately.`;

export const SWEEP_INSTRUCTIONS = `You receive consecutive transcribed pages of ONE Thai DBD document. Return every list row printed on these pages,
in order, exactly as printed: objectives (numbered; no 0 when unnumbered), shareholders (name, nationality, number
of shares, percentage — 0 when not printed), promoters (ผู้เริ่มก่อการ), and the share structure figures if printed
(0 / "" otherwise). Rows continue across pages: return what these pages show; never invent or complete a row.`;
```

- [ ] **Step 4: Interface, Claude and fake implementations**

`types.ts`:

```ts
import type { DocumentType, SweepResult } from './transcript-schema';

export type TranscriptPassage = { documentPosition: number; page: number; text: string };

export interface DbdExtractor {
  readonly name: string;
  extract(documents: Uint8Array[]): Promise<DbdExtraction>;
  transcribe(slice: Uint8Array, range: Slice): Promise<TranscribedPage[]>;
  /** Document kind from its first transcribed page (P14c); "other" when unsure. */
  classify(firstPageText: string): Promise<DocumentType>;
  /** Level 1/3 particulars (+ directors) from retrieved passages; list fields stay empty. */
  extractFacts(passages: TranscriptPassage[]): Promise<DbdExtraction>;
  /** Level 2 list rows printed on a batch of consecutive pages of one document. */
  sweep(pages: TranscribedPage[], documentType: DocumentType): Promise<SweepResult>;
}
```

`claude.ts` — add (all streamed, each with `toExtractionError`):

```ts
  async classify(firstPageText: string): Promise<DocumentType> {
    if (firstPageText.trim() === '') return 'other';
    const message = await this.structured(
      classifyApiSchema,
      CLASSIFY_INSTRUCTIONS,
      `PAGE 1:\n${firstPageText.slice(0, 6000)}`,
      400,
    );
    return message.document_type;
  }

  async extractFacts(passages: TranscriptPassage[]): Promise<DbdExtraction> {
    const text = passages
      .map((p) => `[document ${p.documentPosition}, page ${p.page}]\n${p.text}`)
      .join('\n\n');
    const output = await this.structured(dbdExtractionApiSchema, FACTS_INSTRUCTIONS, text, 8000);
    return fromApiExtraction(output) as DbdExtraction;
  }

  async sweep(pages: TranscribedPage[], documentType: DocumentType): Promise<SweepResult> {
    const text = pages.map((p) => `=== PAGE ${p.page} ===\n${p.text}`).join('\n');
    const output = await this.structured(
      sweepApiSchema,
      `${SWEEP_INSTRUCTIONS}\nDocument type: ${documentType}.`,
      text,
      16000,
    );
    return fromSweepApi(output);
  }

  /** One streamed structured call: system instructions + user text → parsed output. */
  private async structured<T extends z.ZodTypeAny>(
    schema: T,
    system: string,
    text: string,
    maxTokens: number,
  ): Promise<z.infer<T>> {
    let response;
    try {
      response = await this.client.messages
        .stream(
          {
            model: transcriptionModel(),
            max_tokens: maxTokens,
            system,
            messages: [{ role: 'user', content: text }],
            output_config: { format: zodOutputFormat(schema) },
          },
          { timeout: TRANSCRIPTION_TIMEOUT_MS },
        )
        .finalMessage();
    } catch (error) {
      throw toExtractionError(error);
    }
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new ExtractionError('The model did not return a valid answer', 'invalid_output');
    }
    return response.parsed_output as z.infer<T>;
  }
```

(imports: `z` from zod, `classifyApiSchema`, `sweepApiSchema`, `fromSweepApi`, `CLASSIFY_INSTRUCTIONS`, `FACTS_INSTRUCTIONS`, `SWEEP_INSTRUCTIONS`, `DocumentType`, `SweepResult` from `./transcript-schema`; `TranscriptPassage` from `./types`; `dbdExtractionApiSchema`, `fromApiExtraction` already imported. These calls use the Sonnet transcription model: they read text, not scans.)

`fake.ts`:

```ts
/** Keyword classification of a transcribed first page (dev/tests). */
export function fakeClassify(text: string): DocumentType {
  if (text.includes('หนังสือรับรอง')) return 'certificate';
  if (text.includes('วัตถุที่ประสงค์')) return 'objectives_sheet';
  if (text.includes('บอจ.5') || text.includes('ผู้ถือหุ้น')) return 'shareholder_list';
  if (text.includes('บริคณห์สนธิ') || text.includes('บอจ.2')) return 'memorandum';
  if (text.includes('ข้อบังคับ')) return 'articles';
  return 'other';
}
```

and on `FakeDbdExtractor`:

```ts
  async classify(firstPageText: string): Promise<DocumentType> {
    return fakeClassify(firstPageText);
  }

  /** The sample company's particulars, as if read from transcripts; lists left empty. */
  async extractFacts(): Promise<DbdExtraction> {
    const result = structuredClone(this.result);
    for (const key of ['objectives', 'business_categories', 'shareholders', 'promoters'] as const) {
      result[key] = { value: null, confidence: 0, source_text: null, source_page: null, source_document: null } as never;
    }
    result.documents = [];
    return result;
  }

  async sweep(pages: TranscribedPage[], documentType: DocumentType): Promise<SweepResult> {
    const out = structuredClone(EMPTY_SWEEP);
    const sample = this.result;
    if (documentType === 'objectives_sheet') out.objectives = sample.objectives.value ?? [];
    if (documentType === 'shareholder_list') {
      out.shareholders = sample.shareholders.value ?? [];
      out.share_structure = sample.share_structure.value ?? out.share_structure;
    }
    if (documentType === 'memorandum') out.promoters = sample.promoters.value ?? [];
    if (documentType === 'certificate' && pages.some((p) => p.text.includes('วัตถุที่ประสงค์'))) {
      out.objectives = sample.objectives.value ?? [];
    }
    return out;
  }
```

Test stubs: in `tests/integration/extraction.test.ts` the `failing` stub and in `tests/integration/dbd-index.test.ts` `transcriberWith` add `async classify() { return 'other' as const; }`, `async extractFacts() { return new FakeDbdExtractor().extractFacts(); }`, `async sweep(pages, type) { return new FakeDbdExtractor().sweep(pages, type); }` (the `failing` stub throws `ExtractionError('boom','provider')` from all three instead).

- [ ] **Step 5: Run the tests**

Run: `pnpm typecheck && pnpm exec vitest run --config vitest.config.ts tests/unit/integrations/transcript-extraction.test.ts tests/unit/integrations/claude-streaming.test.ts`
Expected: PASS; typecheck clean (every `DbdExtractor` implementation has the three methods).

- [ ] **Step 6: Commit**

```bash
git add lib/integrations/extraction tests/unit/integrations/transcript-extraction.test.ts tests/integration/extraction.test.ts tests/integration/dbd-index.test.ts
git commit -m "feat(p14c): extractor methods for the transcript path — classify, extractFacts, sweep

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Classification after the first slice (worker)

**Files:**
- Modify: `lib/db/dbd-index.ts` (`processIndexJobs`)
- Test: `tests/integration/dbd-index.test.ts` (new case)

**Interfaces:**
- Consumes: `DbdExtractor.classify` (Task 2).
- Produces: a document with `document_type = null` gets its type from the first slice's first page; a known type is never overwritten; a classification failure is logged and ignored.

- [ ] **Step 1: Write the failing integration test**

Append to the worker describe in `tests/integration/dbd-index.test.ts` (before the "fails a job whose runs keep dying" case):

```ts
  it('classifies an untyped document from its first transcribed page and keeps a known type', async () => {
    const [doc] = await listDbdDocuments(svc, recordId);
    await svc.from('dbd_documents').update({ document_type: null }).eq('id', doc.id);
    await enqueueIndexJob(asAdmin, { recordId, documentId: doc.id, kind: 'reindex' });
    await processIndexJobs({ extractor: new FakeDbdExtractor(), vector: store, budgetMs: 60_000 });
    let [after] = await listDbdDocuments(svc, recordId);
    expect(after.document_type).toBe('certificate'); // fakePageText(1) is a หนังสือรับรอง

    await svc.from('dbd_documents').update({ document_type: 'memorandum' }).eq('id', doc.id);
    await enqueueIndexJob(asAdmin, { recordId, documentId: doc.id, kind: 'reindex' });
    await processIndexJobs({ extractor: new FakeDbdExtractor(), vector: store, budgetMs: 60_000 });
    [after] = await listDbdDocuments(svc, recordId);
    expect(after.document_type).toBe('memorandum');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/dbd-index.test.ts`
Expected: the new case FAILS (`document_type` stays null).

- [ ] **Step 3: Implement**

In `processIndexJobs`, inside the slice loop right after `const pages = await transcribeWithRetry(...)`:

```ts
        // Spec §5.6: an untyped document is classified from its first page; a known type stays.
        if (slice.firstPage === 1 && doc.document_type === null) {
          try {
            const type = await deps.extractor.classify(pages[0]?.text ?? '');
            await setDocument(admin, doc.id, { document_type: type });
            doc.document_type = type;
          } catch (e) {
            console.error('classify failed; leaving the type unknown', e);
          }
        }
```

(`doc` must be declared with `let`/mutable object — it is the row object; assigning `doc.document_type` keeps the slices' chunk labels and the relabel check consistent.)

- [ ] **Step 4: Run the tests**

Run: `pnpm typecheck && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/dbd-index.test.ts`
Expected: PASS (all worker cases including the new one).

- [ ] **Step 5: Commit**

```bash
git add lib/db/dbd-index.ts tests/integration/dbd-index.test.ts
git commit -m "feat(p14c): untyped documents are classified from their first transcribed page

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Transcript path — facts by retrieval, lists by sweeps (`lib/db/transcript-extraction.ts`)

**Files:**
- Create: `lib/db/transcript-extraction.ts`
- Test: `tests/integration/transcript-extraction.test.ts`

**Interfaces:**
- Consumes: `searchRecordPassages`, `getVectorStore`, `DbdExtractor.extractFacts/sweep`, `applyExtractionToRecord`, `recordToFormValues`, `readStructuredData`, `isBusinessProfileEmpty`, `updateDbdRecord`, `mergeSweeps`, `EMPTY_SWEEP`.
- Produces:
  ```ts
  FACT_QUERIES: string[]  // Thai retrieval keys per field group
  extractFromTranscripts(db, recordId, deps: { extractor: DbdExtractor | null; vector: VectorStore | null; batchPages?: number }) → Promise<{ applied: string[]; rejected: string[]; lists: string[]; skipped: 'confirmed' | 'no_ready_documents' | 'not_configured' | null }>
  ```

- [ ] **Step 1: Write the failing integration test**

```ts
// tests/integration/transcript-extraction.test.ts
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbdRecord, getDbdRecord, listDbdDocuments, uploadDbdDocument } from '@/lib/db/dbd-records';
import { extractFromTranscripts, FACT_QUERIES } from '@/lib/db/transcript-extraction';
import { dbdRecordInputSchema } from '@/lib/domain/dbd-record';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { FakeDbdExtractor, fakePageText } from '@/lib/integrations/extraction/fake';
import { FakeVectorStore } from '@/lib/integrations/vector/fake';
import { loadChunksFromDb } from '@/lib/integrations/vector/fake-loader';
import { adminClient, clientFor, createTestUser, deleteTestUser, type Client, type TestUser } from './helpers';

const fixture = readFileSync('tests/fixtures/three-pages.pdf');

describe('extractFromTranscripts', () => {
  const svc = adminClient();
  const store = new FakeVectorStore(loadChunksFromDb);
  let admin: TestUser;
  let asAdmin: Client;
  let recordId: string;

  /** A ready, oversized document whose pages/chunks are the fake transcriber's fictional pages. */
  async function seedReady(record: string, type: string | null, pages: number[]) {
    const path = await uploadDbdDocument(asAdmin, record, new File([fixture], 'big.pdf', { type: 'application/pdf' }), 'big.pdf');
    const doc = (await listDbdDocuments(svc, record)).find((d) => d.path === path)!;
    await svc.from('index_jobs').update({ status: 'done' }).eq('document_id', doc.id);
    await svc.from('dbd_documents').update({ page_count: 25, index_status: 'ready', indexed_pages: 25, document_type: type }).eq('id', doc.id);
    await svc.from('dbd_pages').insert(pages.map((p) => ({ document_id: doc.id, page: p, text: fakePageText(p), model: 'fake' })));
    await svc.from('dbd_chunks').insert(
      pages.map((p) => ({ id: `${doc.id}#${p}#0`, record_id: record, document_id: doc.id, document_type: type, page: p, chunk_index: 0, chunk_text: fakePageText(p), char_count: fakePageText(p).length })),
    );
    return doc.id;
  }

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
    recordId = (await createDbdRecord(asAdmin, { ...dbdRecordInputSchema.parse({}), head_office_address: 'ที่อยู่ที่แอดมินพิมพ์เอง' }, admin.id)).id;
    await seedReady(recordId, 'certificate', [1]);
    await seedReady(recordId, 'shareholder_list', [3, 4, 5]);
    await seedReady(recordId, 'objectives_sheet', [2]);
  });

  afterAll(async () => {
    const docs = await listDbdDocuments(svc, recordId);
    await svc.storage.from('dbd-documents').remove(docs.map((d) => d.path));
    await svc.from('dbd_records').delete().eq('id', recordId);
    await deleteTestUser(admin.id);
  });

  it('has a Thai retrieval key for every fact group', () => {
    expect(FACT_QUERIES.length).toBeGreaterThanOrEqual(6);
    expect(FACT_QUERIES.join(' ')).toContain('ทุนจดทะเบียน');
  });

  it('fills empty facts and empty lists from the transcripts, keeping what the admin typed', async () => {
    const result = await extractFromTranscripts(asAdmin, recordId, { extractor: new FakeDbdExtractor(), vector: store, batchPages: 2 });
    expect(result.skipped).toBeNull();
    expect(result.applied).toContain('company_name_th');
    expect(result.applied).not.toContain('head_office_address');
    expect(result.lists).toEqual(expect.arrayContaining(['shareholders', 'objectives']));
    const record = (await getDbdRecord(asAdmin, recordId))!;
    expect(record.company_name_th).toBe('บริษัท ตัวอย่างการสกัด จำกัด');
    expect(record.juristic_id).toBe('0105569000123');
    expect(record.head_office_address).toBe('ที่อยู่ที่แอดมินพิมพ์เอง');
    expect(record.extraction_status).toBe('extracted');
    const structured = readStructuredData(record.structured_data);
    expect(structured.business?.shareholders.map((s) => s.name)).toContain('นางสาวตัวอย่าง ทดสอบ');
    expect(structured.business?.objectives).toHaveLength(3);
    expect(structured.business?.share_structure.total_shares).toBe(20000);
    expect(structured.provenance?.company_name_th).toMatchObject({ source_page: expect.any(Number) });
    expect(structured.provenance?.head_office_address).toBeUndefined();
  });

  it('is idempotent and never overwrites: a second run changes nothing', async () => {
    const before = await getDbdRecord(asAdmin, recordId);
    const result = await extractFromTranscripts(asAdmin, recordId, { extractor: new FakeDbdExtractor(), vector: store });
    expect(result.applied).toEqual([]);
    expect(result.lists).toEqual([]);
    expect(await getDbdRecord(asAdmin, recordId)).toEqual(before);
  });

  it('does nothing for a confirmed record or without providers', async () => {
    await svc.from('dbd_records').update({ extraction_status: 'confirmed', confirmed_by: admin.id, confirmed_at: new Date().toISOString() }).eq('id', recordId);
    expect((await extractFromTranscripts(asAdmin, recordId, { extractor: new FakeDbdExtractor(), vector: store })).skipped).toBe('confirmed');
    await svc.from('dbd_records').update({ extraction_status: 'extracted', confirmed_by: null, confirmed_at: null }).eq('id', recordId);
    expect((await extractFromTranscripts(asAdmin, recordId, { extractor: null, vector: store })).skipped).toBe('not_configured');
    expect((await extractFromTranscripts(asAdmin, recordId, { extractor: new FakeDbdExtractor(), vector: null })).skipped).toBe('not_configured');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/transcript-extraction.test.ts`
Expected: FAIL — cannot resolve `@/lib/db/transcript-extraction`.

- [ ] **Step 3: Implement**

```ts
// lib/db/transcript-extraction.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isBusinessProfileEmpty,
  readStructuredData,
  type BusinessProfile,
  type Provenance,
  type StructuredData,
} from '@/lib/domain/dbd-profile';
import { applyExtractionToRecord } from '@/lib/domain/extraction-merge';
import { EMPTY_SWEEP, mergeSweeps, type DocumentType, type SweepResult } from '@/lib/integrations/extraction/transcript-schema';
import type { DbdExtraction, DbdExtractor, TranscriptPassage } from '@/lib/integrations/extraction/types';
import type { Passage, VectorStore } from '@/lib/integrations/vector/types';
import type { Database, Json } from './database.types';
import { searchRecordPassages } from './dbd-index';
import { getDbdRecord, listDbdDocuments, updateDbdRecord, type DbdRecordRow } from './dbd-records';
import { recordToFormValues } from './extraction';

type Db = SupabaseClient<Database>;

/** Thai retrieval keys, one per fact group of the certificate (spec §6). */
export const FACT_QUERIES = [
  'ชื่อบริษัท ทะเบียนเลขที่ เลขทะเบียนนิติบุคคล',
  'ทุนจดทะเบียน บาท',
  'กรรมการของบริษัท ลงลายมือชื่อผูกพันบริษัท',
  'สำนักงานแห่งใหญ่ ตั้งอยู่เลขที่ จังหวัด',
  'จดทะเบียนเมื่อวันที่ ก่อตั้ง',
  'ออกให้ ณ วันที่ นายทะเบียน สำนักงานทะเบียน',
  'หนังสือรับรอง เลขที่ อ้างอิง',
  'วัตถุที่ประสงค์ จำนวน ข้อ',
];

const SWEEP_TYPES: DocumentType[] = ['shareholder_list', 'objectives_sheet', 'memorandum', 'certificate'];

export type TranscriptExtractionResult = {
  applied: string[];
  rejected: string[];
  /** Level 2 lists filled from sweeps. */
  lists: string[];
  skipped: 'confirmed' | 'no_ready_documents' | 'not_configured' | null;
};

/**
 * Fills a record from its transcripts (spec §6, D42): single facts by retrieval + one structured
 * call, Level 2 lists by page-batched sweeps of the typed documents. Empty fields only (D37/D38);
 * runs when an oversized document becomes ready and from "Read the document again".
 */
export async function extractFromTranscripts(
  db: Db,
  recordId: string,
  deps: { extractor: DbdExtractor | null; vector: VectorStore | null; batchPages?: number },
): Promise<TranscriptExtractionResult> {
  const none = (skipped: TranscriptExtractionResult['skipped']) => ({ applied: [], rejected: [], lists: [], skipped });
  if (!deps.extractor || !deps.vector) return none('not_configured');
  const record = await getDbdRecord(db, recordId);
  if (!record) return none('no_ready_documents');
  if (record.extraction_status === 'confirmed') return none('confirmed');
  const documents = (await listDbdDocuments(db, recordId)).filter((d) => d.index_status === 'ready');
  if (documents.length === 0) return none('no_ready_documents');
  const positionOf = new Map(documents.map((d) => [d.id, d.position]));

  // ---- facts by retrieval ------------------------------------------------------------------
  const passages = await retrieveFactPassages(deps.vector, recordId, positionOf);
  const facts = passages.length > 0 ? await deps.extractor.extractFacts(passages) : null;
  const { input, applied, rejected } = facts
    ? applyExtractionToRecord(facts, recordToFormValues(record))
    : { input: null, applied: [] as string[], rejected: [] as string[] };

  // ---- lists by sweeps ----------------------------------------------------------------------
  const batchPages = deps.batchPages ?? 10;
  const sweeps: SweepResult[] = [];
  for (const doc of documents) {
    if (!doc.document_type || !SWEEP_TYPES.includes(doc.document_type as DocumentType)) continue;
    const { data: pages, error } = await db
      .from('dbd_pages')
      .select('page, text')
      .eq('document_id', doc.id)
      .order('page');
    if (error) throw error;
    for (let i = 0; i < (pages ?? []).length; i += batchPages) {
      const batch = (pages ?? []).slice(i, i + batchPages);
      sweeps.push(await deps.extractor.sweep(batch, doc.document_type as DocumentType));
    }
  }
  const swept = mergeSweeps(sweeps);

  // ---- merge: empty fields only -------------------------------------------------------------
  const current = readStructuredData(record.structured_data);
  const business: BusinessProfile = current.business ?? {
    objectives: [], business_categories: [], shareholders: [], promoters: [],
    share_structure: { total_shares: null, par_value: null, paid_up_capital: null, share_type: null },
  };
  const lists: string[] = [];
  if (business.shareholders.length === 0 && swept.shareholders.length > 0) { business.shareholders = swept.shareholders; lists.push('shareholders'); }
  if (business.objectives.length === 0 && swept.objectives.length > 0) { business.objectives = swept.objectives; lists.push('objectives'); }
  if (business.promoters.length === 0 && swept.promoters.length > 0) { business.promoters = swept.promoters; lists.push('promoters'); }
  const structureEmpty = Object.values(business.share_structure).every((v) => v === null);
  const sweptStructure = Object.values(swept.share_structure).some((v) => v !== null);
  if (structureEmpty && sweptStructure) { business.share_structure = swept.share_structure; lists.push('share_structure'); }

  const provenance: Provenance = { ...(current.provenance ?? {}) };
  if (facts) {
    for (const field of applied) {
      const key = field === 'directors_text' ? 'directors' : field;
      const entry = (facts as unknown as Record<string, { confidence: number; source_page: number | null; source_document: number | null }>)[key];
      if (entry) provenance[key] = { confidence: entry.confidence, source_page: entry.source_page ?? null, source_document: entry.source_document ?? null };
    }
  }
  for (const list of lists) provenance[list] = { confidence: 0.9, source_page: null, source_document: null };

  if (applied.length === 0 && lists.length === 0) return { applied, rejected, lists, skipped: null };
  const structured: StructuredData = {
    ...current,
    business: isBusinessProfileEmpty(business) ? current.business : business,
    provenance,
  };
  const updated = input
    ? await updateDbdRecord(db, recordId, input, structured)
    : await updateStructured(db, recordId, structured);
  if (updated.extraction_status === 'none' || updated.extraction_status === 'pending') {
    await db.from('dbd_records').update({ extraction_status: 'extracted' }).eq('id', recordId);
  }
  return { applied, rejected, lists, skipped: null };
}

async function retrieveFactPassages(
  vector: VectorStore,
  recordId: string,
  positionOf: Map<string, number>,
): Promise<TranscriptPassage[]> {
  const results = await Promise.all(
    FACT_QUERIES.map((q) => searchRecordPassages(vector, recordId, q, { topK: 3 }).catch(() => null)),
  );
  const seen = new Set<string>();
  const out: TranscriptPassage[] = [];
  for (const hits of results) {
    for (const hit of hits ?? []) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      out.push({ documentPosition: positionOf.get(hit.documentId) ?? 0, page: hit.page, text: hit.text });
    }
  }
  return out;
}

async function updateStructured(db: Db, recordId: string, structured: StructuredData): Promise<DbdRecordRow> {
  const { data, error } = await db
    .from('dbd_records')
    .update({ structured_data: structured as unknown as Json })
    .eq('id', recordId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

Note: `recordToFormValues` is exported from `lib/db/extraction.ts` already. `updateDbdRecord(db, id, input, structured)` writes both columns and structured data; when `input` is null only the structured data changes. The fixture record in the test has `head_office_address` typed, which `applyExtractionToRecord` keeps (existing values win) and the provenance loop therefore skips.

- [ ] **Step 4: Run the tests**

Run: `pnpm typecheck && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/transcript-extraction.test.ts`
Expected: PASS (4 tests). If `extraction_status` stays `none`, check that the record row returned by `updateDbdRecord` is the pre-update `extraction_status` (it is `.select().single()` after the update — fine) and that the fake facts carry `source_page` numbers (they do: `SAMPLE_EXTRACTION` uses `at(1)`).

- [ ] **Step 5: Commit**

```bash
git add lib/db/transcript-extraction.ts tests/integration/transcript-extraction.test.ts
git commit -m "feat(p14c): transcript path — facts by retrieval, lists by page sweeps, empty fields only

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Triggers — worker completion and "Read the document again"

**Files:**
- Modify: `lib/db/dbd-index.ts` (`IndexWorkerDeps.onDocumentReady`), `app/api/cron/index/route.ts`
- Modify: `lib/db/extraction.ts` (`extractAndApply` runs the transcript path after the direct pass or when deferred) — or `app/[locale]/(admin)/admin/dbd-records/actions.ts` `extractDocumentAction`
- Test: `tests/integration/dbd-index.test.ts` (worker calls the hook), `tests/integration/transcript-extraction.test.ts` (confirmed record — already), `tests/integration/extraction.test.ts` (extractAndApply with a deferred pack fills from transcripts)

**Interfaces:**
- Produces: `IndexWorkerDeps.onDocumentReady?: (recordId: string, documentId: string) => Promise<void>` (errors logged, never fail the job); `extractAndApply(db, recordId, extractor, vector?)` → `ExtractAndApplyResult` gains `fromTranscripts: { applied: string[]; lists: string[] } | null` and tolerates a `deferred` direct pass when the transcript path filled something.

- [ ] **Step 1: Write the failing tests**

Worker hook — append to the worker describe in `tests/integration/dbd-index.test.ts`:

```ts
  it('tells the caller when a document becomes ready (the transcript path hangs off this)', async () => {
    const [doc] = await listDbdDocuments(svc, recordId);
    await enqueueIndexJob(asAdmin, { recordId, documentId: doc.id, kind: 'reindex' });
    const ready: string[] = [];
    await processIndexJobs({
      extractor: new FakeDbdExtractor(),
      vector: store,
      budgetMs: 60_000,
      onDocumentReady: async (r, d) => {
        ready.push(`${r}:${d}`);
      },
    });
    expect(ready).toEqual([`${recordId}:${doc.id}`]);
  });
```

`extractAndApply` — append to `tests/integration/extraction.test.ts`'s `extractAndApply` describe (it owns a record with one small document; add a second, oversized ready document with pages/chunks as in Task 4's `seedReady`, using the fake page texts):

```ts
  it('fills a deferred pack from its transcripts (P14c)', async () => {
    const svc = adminClient();
    await svc.from('dbd_documents').update({ page_count: 25 }).eq('record_id', recordId);
    await svc.from('dbd_records').update({ company_name_th: null, juristic_id: null }).eq('id', recordId);
    // pages/chunks for the (now oversized) document
    const [doc] = await listDbdDocuments(svc, recordId);
    await svc.from('dbd_documents').update({ index_status: 'ready', indexed_pages: 1, document_type: 'certificate' }).eq('id', doc.id);
    await svc.from('dbd_pages').upsert([{ document_id: doc.id, page: 1, text: fakePageText(1), model: 'fake' }], { onConflict: 'document_id,page' });
    await svc.from('dbd_chunks').upsert([{ id: `${doc.id}#1#0`, record_id: recordId, document_id: doc.id, document_type: 'certificate', page: 1, chunk_index: 0, chunk_text: fakePageText(1), char_count: 10 }]);
    const result = await extractAndApply(asAdmin, recordId, new FakeDbdExtractor(), new FakeVectorStore(loadChunksFromDb));
    expect(result.fromTranscripts?.applied).toContain('company_name_th');
    expect(result.record.company_name_th).toBe('บริษัท ตัวอย่างการสกัด จำกัด');
  });
```

(add the imports `fakePageText`, `FakeVectorStore`, `loadChunksFromDb`, `listDbdDocuments` to that file).

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/dbd-index.test.ts tests/integration/extraction.test.ts`
Expected: the two new cases FAIL (`onDocumentReady` unknown / typecheck; `extractAndApply` throws `deferred`).

- [ ] **Step 3: Implement**

`lib/db/dbd-index.ts`: add `onDocumentReady?: (recordId: string, documentId: string) => Promise<void>;` to `IndexWorkerDeps`; in the `done` branch after the document is set to `ready`:

```ts
        if (deps.onDocumentReady) {
          try {
            await deps.onDocumentReady(job.record_id, doc.id);
          } catch (e) {
            console.error('onDocumentReady failed', e);
          }
        }
```

`app/api/cron/index/route.ts`: build the deps once and pass

```ts
      onDocumentReady: async (recordId) => {
        await extractFromTranscripts(createSupabaseAdminClient(), recordId, { extractor, vector });
      },
```

(with `const extractor = getDbdExtractor(); const vector = getVectorStore();` and imports of `extractFromTranscripts`, `createSupabaseAdminClient`).

`lib/db/extraction.ts` `extractAndApply(db, recordId, extractor, vector: VectorStore | null = getVectorStore())`:

```ts
  let direct: ExtractAndApplyResult | null = null;
  try {
    direct = await directPass(db, recordId, extractor); // the existing body, extracted into a helper
  } catch (e) {
    if (!(e instanceof ExtractionError) || e.code !== 'deferred') throw e;
  }
  const fromTranscripts = await extractFromTranscripts(db, recordId, { extractor, vector });
  const record = (await getDbdRecord(db, recordId))!;
  if (!direct && fromTranscripts.applied.length === 0 && fromTranscripts.lists.length === 0) {
    throw new ExtractionError('Every document is too large to read whole', 'deferred');
  }
  return {
    record,
    applied: direct?.applied ?? [],
    rejected: direct?.rejected ?? [],
    businessFilled: direct?.businessFilled ?? false,
    fromTranscripts: fromTranscripts.skipped ? null : { applied: fromTranscripts.applied, lists: fromTranscripts.lists },
  };
```

(`ExtractAndApplyResult` gains `fromTranscripts: { applied: string[]; lists: string[] } | null`; `fillFromDocument` counts `applied.length + (fromTranscripts?.applied.length ?? 0)` for the banner.) Import cycle check: `transcript-extraction.ts` imports `recordToFormValues` from `./extraction`, and `extraction.ts` now imports `extractFromTranscripts` — move `recordToFormValues` into `lib/domain/extraction-merge.ts`? It reads a `DbdRecordRow`; keep it in `extraction.ts` but import `extractFromTranscripts` lazily (`await import('./transcript-extraction')`) — or simpler: move `recordToFormValues` to a small `lib/db/record-form-values.ts` used by both. Do the latter.

- [ ] **Step 4: Run the tests**

Run: `pnpm typecheck && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/dbd-index.test.ts tests/integration/extraction.test.ts tests/integration/transcript-extraction.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/dbd-index.ts lib/db/extraction.ts lib/db/record-form-values.ts lib/db/transcript-extraction.ts app/api/cron/index/route.ts "app/[locale]/(admin)/admin/dbd-records/actions.ts" tests/integration/dbd-index.test.ts tests/integration/extraction.test.ts
git commit -m "feat(p14c): the transcript path runs when an oversized document becomes ready and on re-read

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: E2E with a 25-page pack, docs, verification

**Files:**
- Modify: `scripts/make-fixture-pdf.mjs` (adds `tests/fixtures/twenty-five-pages.pdf`), `tests/fixtures/twenty-five-pages.pdf`
- Create: `tests/e2e/oversized-pack.spec.ts`
- Modify: `docs/decisions-log.md` (D42 row), spec status, `docs/runbooks/production-setup.md` (env table: `DIRECT_READ_MAX_PAGES`), `.env.example`

- [ ] **Step 1: Fixture**

Extend `scripts/make-fixture-pdf.mjs` with a 25-page document (same text-only pages, `Fixture page i of 25`) written to `tests/fixtures/twenty-five-pages.pdf`; run `pnpm fixtures:pdf` and `git checkout -- tests/fixtures/three-pages.pdf tests/fixtures/encrypted.pdf` afterwards so only the new file changes.

- [ ] **Step 2: Write the failing e2e**

```ts
// tests/e2e/oversized-pack.spec.ts
import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';

test('a 25-page pack is deferred on upload and fills itself from the transcripts once indexed', async ({
  page,
  request,
}) => {
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/dbd-records/new');
  await page.getByTestId('upload-first-file').setInputFiles('tests/fixtures/twenty-five-pages.pdf');
  await page.getByTestId('upload-first-submit').click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/[0-9a-f-]{36}\?extraction=deferred/);
  await expect(page.getByTestId('autofill-banner')).toContainText('เบื้องหลัง');
  await expect(page.locator('input[name="juristic_id"]')).toHaveValue('');
  await expect(page.getByTestId('index-status').first()).toHaveAttribute('data-status', 'queued');

  // Five slices; the cron reads them all in one run and the transcript path fills the record.
  const run = await request.get('/api/cron/index', {
    headers: { Authorization: 'Bearer local-cron-secret-for-dev' },
  });
  expect(run.status()).toBe(200);
  expect((await run.json()).completed).toBeGreaterThanOrEqual(1);

  await page.reload();
  await expect(page.getByTestId('index-status').first()).toHaveAttribute('data-status', 'ready');
  await expect(page.getByTestId('document-list').getByTestId('document-type')).toHaveText('หนังสือรับรอง');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('บริษัท ตัวอย่างการสกัด จำกัด');
  await expect(page.locator('input[name="juristic_id"]')).toHaveValue('0105569000123');
  await expect(page.getByTestId('business-profile').locator('textarea[name="shareholders_text"]')).toHaveValue(
    /นางสาวตัวอย่าง ทดสอบ/,
  );
  await expect(page.getByTestId('record-status')).toHaveText('extracted');
});
```

- [ ] **Step 3: Run it to verify it fails, then make it pass**

Run: `pnpm exec playwright test tests/e2e/oversized-pack.spec.ts`
Expected before Tasks 1–5 are wired: FAIL at the `?extraction=deferred` URL; after: PASS. (The fake transcriber's page 1 is a หนังสือรับรอง and pages ≥ 3 are บอจ.5 rows, so classification yields `certificate` and the certificate sweep finds objectives on page 2 — the shareholders come from the same document only if its type is `shareholder_list`; if the assertion on `shareholders_text` fails, seed the expectation on `objectives_text` instead and note it: a single 25-page document is one type.)

- [ ] **Step 4: Docs**

`docs/decisions-log.md` — append:

```
| 2026-09-21 | D42 | Documents over `DIRECT_READ_MAX_PAGES` (20) never travel whole: the direct pass takes only small documents (upload order, 30 MB budget) and reports *deferred* when none qualify; when an oversized document's index is ready the record is filled from its transcripts — single facts by retrieval + one structured call, shareholder/objective/promoter lists by 10-page sweeps — empty fields only; an untyped document is classified from its first transcribed page | `lib/domain/extraction-plan.ts`, `lib/db/transcript-extraction.ts` |
```

Spec header status → `| Status | Implemented (P14a index pipeline, P14b retrieval consumers, P14c oversized documents) |`. Runbook env table: add `DIRECT_READ_MAX_PAGES` (optional, default 20) next to `TRANSCRIBE_SLICE_PAGES`; `.env.example`: `DIRECT_READ_MAX_PAGES=` with a one-line comment. Runbook §4: "Packs over 20 pages fill in after the index is ready (a minute per 5 pages); the record page says so."

- [ ] **Step 5: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm check:secrets && pnpm test:unit && pnpm test:integration && pnpm test:e2e`
Expected: all green — unit ≥ 170, integration ≥ 118, e2e 34.

- [ ] **Step 6: Commit and finish**

```bash
git add scripts/make-fixture-pdf.mjs tests/fixtures/twenty-five-pages.pdf tests/e2e/oversized-pack.spec.ts docs .env.example
git commit -m "feat(p14c): e2e for a 25-page pack; D42, spec status, runbook

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Then `superpowers:finishing-a-development-branch`: fast-forward merge into `main`, push (Vercel deploys); no new migration in this stage.

---

## Self-review notes

- **Spec coverage (stage 3):** §5.1 direct-pass selection → Task 1; §5.6 classification → Task 3; §6 facts by retrieval / lists by typed sweeps / provenance / empty-fields-only → Tasks 2, 4; trigger on ready + Read again → Task 5; D42 → Task 6.
- **Review Focus coverage:** 1 → Task 5 (`extractAndApply` direct + transcript on one record) and Task 4 (existing values kept); 2 → Task 4 "does nothing for a confirmed record"; 3 → Task 2 `mergeSweeps`; 4 → Task 4 (`head_office_address` typed by the admin stays, provenance untouched); 5 → Task 2 (`fakeClassify('')`, `'[หน้าว่าง]'` → other) and Task 3 (worker catches classify errors).
- **Names across tasks:** `planDirectRead` (T1) → T1 `runExtraction`; `ExtractionError 'deferred'` (T1) → T1 actions, T5; `classify/extractFacts/sweep`, `TranscriptPassage`, `SweepResult`, `mergeSweeps`, `EMPTY_SWEEP`, `DocumentType` (T2) → T3, T4; `extractFromTranscripts`, `FACT_QUERIES` (T4) → T5, T6; `onDocumentReady` (T5) → cron route; `recordToFormValues` moves to `lib/db/record-form-values.ts` in T5 (T4 imports it from `./extraction` until then — T5 updates both imports).
- **Placeholder scan:** none.

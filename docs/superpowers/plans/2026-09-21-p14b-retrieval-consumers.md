# P14b — Retrieval Consumers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Generate with AI" grounds every batch in passages retrieved from the reference record's index (one query per bank-interview concept group) and records which passages each question came from; learners see a "From your documents" panel of passages from their own pack under each bank-interview study card.

**Architecture:** Two consumers of the P14a index, both going through `searchRecordPassages()`. A new `lib/db/passages.ts` retrieves per concept group (generator) or per concept (study card) and labels passages with document names. The question generator gets a `passages` input that replaces the whole-PDF block in the prompt; the structured output gains `sources` (passage numbers) which are resolved to `{document, page}` refs and stored in a new `questions.source_refs` column, shown on the review list. The learner study page asks for evidence only for the learner's own active record, so nobody ever sees another company's text. Fallbacks keep today's behaviour when a record has no index.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (migration 0016), `@anthropic-ai/sdk` structured output (zod), Vitest 5, Playwright. Builds on P14a's `VectorStore`, `searchRecordPassages`, `dbd_chunks`, `BANK_INTERVIEW_CONCEPTS`.

**Spec:** `docs/superpowers/specs/2026-09-21-p14-dbd-rag-index-design.md` — §8 rows "Generate with AI" and "Study cards", §4 (`questions.source_refs`), §9 stage 2, decisions D43/D44.

## Global Constraints

- Retrieval for generation: for each of the four concept groups (`identity`, `ownership`, `business_plan`, `personal`) one query built from the group's Thai concept questions, top 4 passages per group, deduplicated by chunk id; passages are labelled `[n] (group) <document name>, หน้า <page>` and each passage's text is capped at 1,200 characters in the prompt.
- When passages exist the reference PDF is **not** attached. When the record has no index (store off, nothing `ready`, or no chunks), fall back to today's behaviour: attach the reference PDF only if its first document is ≤ `DIRECT_READ_MAX_PAGES` (default 20; unknown page count counts as small — documents uploaded before P14), else particulars only.
- `sources` returned by the model are passage numbers (1-based); unknown numbers are dropped and duplicates collapsed, never rejected. `questions.source_refs` is `jsonb not null default '[]'` holding `[{document_id, document_name, document_type, page}]`.
- D34/D36 validation is unchanged: a question that repeats a reference literal is still rejected, passages or not.
- Learner evidence: only from the learner's active assignment's record; top 3 passages for the card's concept group (one query per concept, top 2 each, merged by score); panel hidden when there is no assignment, no store, or no `ready` document. Document names are read with the service-role client after the ownership check (D18 pattern) because learners cannot read `dbd_documents`.
- The five starter cards map to groups by content key: `bank-interview-1-identity` → identity, `-2-ownership` → ownership, `-3-business` → business_plan, `-4-role` → personal, `-5-tips` → none.
- Fake providers keep every suite key-free; Playwright already forces `VECTOR_PROVIDER=fake`.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, unit, integration, e2e must stay green; commits end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Review Focus

1. **Reference record without an index** (uploaded before P14, provider off, or still indexing) — generation must still succeed exactly as today and store `source_refs = []` (test in Task 4).
2. **Model cites passage numbers that do not exist or repeats them** — the question is kept, refs are dropped/deduped, never rejected (test in Task 3).
3. **Passage text leaking into a stored question** — a generated question containing the reference company's name is rejected even when passages were supplied (test in Task 4).
4. **Learner with no assignment, or a record with no chunks** — the study card renders without the panel and without an error (test in Task 6).
5. **Cross-record isolation** — evidence for record A never includes chunks of record B (test in Task 6).

---

### Task 1: Migration 0016 — `questions.source_refs`

**Files:**
- Create: `supabase/migrations/20260921000016_question_source_refs.sql`
- Modify: `lib/db/database.types.ts` (regenerated)

**Interfaces:**
- Produces: column `questions.source_refs jsonb not null default '[]'`.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260921000016_question_source_refs.sql
-- P14b: AI-generated questions remember which reference passages grounded them (decision D43).
alter table public.questions
  add column source_refs jsonb not null default '[]'::jsonb;

comment on column public.questions.source_refs is
  'AI questions: [{document_id, document_name, document_type, page}] of the reference passages used; [] for hand-written questions.';
```

- [ ] **Step 2: Apply locally and regenerate the types**

Run: `pnpm db:reset && pnpm db:types && pnpm typecheck && grep -c "source_refs" lib/db/database.types.ts`
Expected: reset finishes; typecheck clean; the grep prints a number ≥ 3 (Row/Insert/Update). (`db:reset` wipes the local database; Playwright's global setup recreates the e2e users on the next run.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260921000016_question_source_refs.sql lib/db/database.types.ts
git commit -m "feat(p14b): migration 0016 — questions.source_refs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Concept queries, card → group mapping, direct-read limit (pure)

**Files:**
- Create: `lib/domain/rag/concepts.ts`
- Modify: `lib/domain/rag/jobs.ts`
- Modify: `lib/content/bank-interview-cards.ts`
- Test: `tests/unit/domain/rag-concepts.test.ts`

**Interfaces:**
- Consumes: `BANK_INTERVIEW_CONCEPTS`, `ConceptGroup` (`lib/domain/bank-interview.ts`).
- Produces: `CONCEPT_GROUPS: ConceptGroup[]`, `conceptQueries(group) → string[]`, `conceptGroupQuery(group) → string`, `DEFAULT_DIRECT_READ_MAX_PAGES = 20`, `directReadMaxPages(env?) → number`, `StarterCard.conceptGroup: ConceptGroup | null`, `cardConceptGroup(contentKey) → ConceptGroup | null`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/domain/rag-concepts.test.ts
import { describe, expect, it } from 'vitest';
import { cardConceptGroup } from '@/lib/content/bank-interview-cards';
import { CONCEPT_GROUPS, conceptGroupQuery, conceptQueries } from '@/lib/domain/rag/concepts';
import { DEFAULT_DIRECT_READ_MAX_PAGES, directReadMaxPages } from '@/lib/domain/rag/jobs';

describe('concept queries', () => {
  it('uses the bank\'s own Thai questions as retrieval keys, one per concept', () => {
    expect(CONCEPT_GROUPS).toEqual(['identity', 'ownership', 'business_plan', 'personal']);
    expect(conceptQueries('identity')).toContain('บริษัทชื่ออะไร');
    expect(conceptQueries('personal')).toHaveLength(3);
    expect(conceptGroupQuery('ownership')).toContain('ผู้ถือหุ้น');
    expect(conceptGroupQuery('ownership').split(' ').length).toBeGreaterThan(3);
  });
});

describe('starter cards → concept groups', () => {
  it('maps the four concept cards and leaves the tips card unmapped', () => {
    expect(cardConceptGroup('bank-interview-1-identity')).toBe('identity');
    expect(cardConceptGroup('bank-interview-2-ownership')).toBe('ownership');
    expect(cardConceptGroup('bank-interview-3-business')).toBe('business_plan');
    expect(cardConceptGroup('bank-interview-4-role')).toBe('personal');
    expect(cardConceptGroup('bank-interview-5-tips')).toBeNull();
    expect(cardConceptGroup('some-other-card')).toBeNull();
  });
});

describe('directReadMaxPages', () => {
  it('defaults to 20 and honours a sane override', () => {
    expect(DEFAULT_DIRECT_READ_MAX_PAGES).toBe(20);
    expect(directReadMaxPages({})).toBe(20);
    expect(directReadMaxPages({ DIRECT_READ_MAX_PAGES: '5' })).toBe(5);
    expect(directReadMaxPages({ DIRECT_READ_MAX_PAGES: '0' })).toBe(20);
    expect(directReadMaxPages({ DIRECT_READ_MAX_PAGES: 'x' })).toBe(20);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/rag-concepts.test.ts`
Expected: FAIL — cannot resolve `@/lib/domain/rag/concepts`.

- [ ] **Step 3: Implement**

```ts
// lib/domain/rag/concepts.ts
import { BANK_INTERVIEW_CONCEPTS, type ConceptGroup } from '@/lib/domain/bank-interview';

export const CONCEPT_GROUPS: ConceptGroup[] = ['identity', 'ownership', 'business_plan', 'personal'];

/** One Thai query per concept of a group — the bank's own questions are the best retrieval keys. */
export function conceptQueries(group: ConceptGroup): string[] {
  return BANK_INTERVIEW_CONCEPTS.filter((c) => c.group === group).map((c) => c.question.th);
}

/** A group's questions as one query; the generator retrieves once per group (spec §8). */
export function conceptGroupQuery(group: ConceptGroup): string {
  return conceptQueries(group).join(' ');
}
```

Append to `lib/domain/rag/jobs.ts`:

```ts
/** Documents up to this many pages may be attached whole to a model call (spec §5.1, D42). */
export const DEFAULT_DIRECT_READ_MAX_PAGES = 20;

export function directReadMaxPages(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.DIRECT_READ_MAX_PAGES);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_DIRECT_READ_MAX_PAGES;
}
```

In `lib/content/bank-interview-cards.ts`: import `type ConceptGroup` from `@/lib/domain/bank-interview`; add `conceptGroup: ConceptGroup | null;` to `StarterCard`; set `conceptGroup: 'identity'` / `'ownership'` / `'business_plan'` / `'personal'` / `null` on the five cards (after each `sortOrder`); append:

```ts
/** The concept group a starter card teaches — the study page retrieves evidence for it. */
export function cardConceptGroup(contentKey: string): ConceptGroup | null {
  return BANK_INTERVIEW_CARDS.find((c) => c.contentKey === contentKey)?.conceptGroup ?? null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/domain/rag-concepts.test.ts tests/unit/domain/bank-interview.test.ts && pnpm typecheck`
Expected: PASS (the existing bank-interview tests still pass — `loadStarterCards` ignores the new field); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add lib/domain/rag/concepts.ts lib/domain/rag/jobs.ts lib/content/bank-interview-cards.ts tests/unit/domain/rag-concepts.test.ts
git commit -m "feat(p14b): concept retrieval queries, card→group mapping, direct-read page limit

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Passages in the question generator (types, schema, prompt, fake, validation)

**Files:**
- Create: `lib/integrations/question-gen/passages.ts`
- Modify: `lib/integrations/question-gen/types.ts`, `schema.ts`, `claude.ts`, `fake.ts`, `validate.ts`
- Test: `tests/unit/integrations/passages.test.ts`

**Interfaces:**
- Consumes: `ConceptGroup`.
- Produces: `type ReferencePassage = { id; group: ConceptGroup; documentId; documentName; documentType: string | null; page; text }`, `type SourceRef = { document_id; document_name; document_type: string | null; page }`, `MAX_PASSAGE_CHARS = 1200`, `passagesBlock(passages) → string`, `resolveSourceRefs(sources, passages) → SourceRef[]`; `GenerateInput.passages: ReferencePassage[]`; `GeneratedQuestion.sources?: number[]`; the structured output field `sources: number[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/integrations/passages.test.ts
import { describe, expect, it } from 'vitest';
import { FakeQuestionGenerator } from '@/lib/integrations/question-gen/fake';
import {
  MAX_PASSAGE_CHARS,
  passagesBlock,
  resolveSourceRefs,
  type ReferencePassage,
} from '@/lib/integrations/question-gen/passages';
import { validateGenerated } from '@/lib/integrations/question-gen/validate';

const passages: ReferencePassage[] = [
  { id: 'd#1#0', group: 'identity', documentId: 'd', documentName: 'cert.pdf', documentType: 'certificate', page: 1, text: 'ทุนจดทะเบียน 2,000,000 บาท' },
  { id: 'd#3#0', group: 'ownership', documentId: 'd', documentName: 'cert.pdf', documentType: 'shareholder_list', page: 3, text: 'ก'.repeat(5000) },
];

describe('passagesBlock', () => {
  it('numbers passages, labels group/document/page and caps the text', () => {
    const block = passagesBlock(passages);
    expect(block).toContain('[1] (identity) cert.pdf, หน้า 1\nทุนจดทะเบียน 2,000,000 บาท');
    expect(block).toContain('[2] (ownership) cert.pdf, หน้า 3\n');
    expect(block.length).toBeLessThan(MAX_PASSAGE_CHARS + 200);
  });
});

describe('resolveSourceRefs', () => {
  it('maps cited numbers to document/page refs, dropping unknown and duplicate ones', () => {
    expect(resolveSourceRefs([1, 1, 2, 9, 0, 1.5], passages)).toEqual([
      { document_id: 'd', document_name: 'cert.pdf', document_type: 'certificate', page: 1 },
      { document_id: 'd', document_name: 'cert.pdf', document_type: 'shareholder_list', page: 3 },
    ]);
    expect(resolveSourceRefs(undefined, passages)).toEqual([]);
    expect(resolveSourceRefs([1], [])).toEqual([]);
  });
});

describe('fake generator with passages', () => {
  const input = { reference: null, material: { text: '', pdf: null }, count: 3, templateCount: 2, difficulty: 'medium' as const, focus: null };

  it('cites passages in turn when some are given, none otherwise', async () => {
    const withPassages = await new FakeQuestionGenerator().generate({ ...input, passages });
    expect(withPassages.map((q) => q.sources)).toEqual([[1], [2], [1]]);
    const without = await new FakeQuestionGenerator().generate({ ...input, passages: [] });
    expect(without.every((q) => q.sources?.length === 0)).toBe(true);
  });

  it('keeps sources through validation', async () => {
    const generated = await new FakeQuestionGenerator().generate({ ...input, passages });
    const { accepted } = validateGenerated(generated);
    expect(accepted[0].sources).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/integrations/passages.test.ts`
Expected: FAIL — cannot resolve `@/lib/integrations/question-gen/passages`.

- [ ] **Step 3: Implement the pure module and the types**

```ts
// lib/integrations/question-gen/passages.ts
import type { ConceptGroup } from '@/lib/domain/bank-interview';

/** A retrieved chunk of the reference record, labelled with the concept group it answers. */
export type ReferencePassage = {
  id: string;
  group: ConceptGroup;
  documentId: string;
  documentName: string;
  documentType: string | null;
  page: number;
  text: string;
};

/** Stored on `questions.source_refs` (decision D43). */
export type SourceRef = {
  document_id: string;
  document_name: string;
  document_type: string | null;
  page: number;
};

export const MAX_PASSAGE_CHARS = 1200;

/** Prompt block: `[n] (group) document, หน้า page` followed by the (capped) passage text. */
export function passagesBlock(passages: ReferencePassage[]): string {
  return passages
    .map(
      (p, i) =>
        `[${i + 1}] (${p.group}) ${p.documentName}, หน้า ${p.page}\n${p.text.slice(0, MAX_PASSAGE_CHARS)}`,
    )
    .join('\n\n');
}

/** Passage numbers the model cited → stored refs; unknown numbers dropped, duplicates collapsed. */
export function resolveSourceRefs(
  sources: number[] | undefined,
  passages: ReferencePassage[],
): SourceRef[] {
  const out: SourceRef[] = [];
  const seen = new Set<string>();
  for (const n of sources ?? []) {
    if (!Number.isInteger(n)) continue;
    const p = passages[n - 1];
    if (!p) continue;
    const key = `${p.documentId}#${p.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      document_id: p.documentId,
      document_name: p.documentName,
      document_type: p.documentType,
      page: p.page,
    });
  }
  return out;
}
```

`types.ts`:
- import `type { ReferencePassage } from './passages'`;
- `GeneratedQuestion` gains `/** 1-based numbers of the reference passages the question is grounded in ([] when none). */ sources?: number[];`
- `GenerateInput` gains `/** Retrieved passages of the reference record (spec §8); when present the reference PDF is not attached. */ passages: ReferencePassage[];`

`schema.ts`: in `generatedQuestionSchema` add `sources: z.array(z.number().int()),` after `kind`; in `GENERATION_INSTRUCTIONS` add the rule line
`- sources: the numbers of the REFERENCE PASSAGES (when any are given) the question is grounded in; [] when none apply. Never copy a passage's company-specific values — use placeholders.`

`validate.ts` `trim()`: return `{ kind: q.kind, localizations, sources: q.sources ?? [] }`.

`fake.ts` `generate()`: after computing `template`, set
```ts
        sources: input.passages.length > 0 ? [((n - 1) % input.passages.length) + 1] : [],
```
inside each pushed question.

`claude.ts` `generate()`:
- import `passagesBlock` from `./passages`;
- attach `input.reference.pdf` only when `input.passages.length === 0`;
- in `request`, after the reference block add
```ts
      (input.passages.length > 0
        ? `\n\nREFERENCE PASSAGES (verbatim text of the reference company's own DBD documents, retrieved per interview concept; use them to see what the documents literally say and which particulars to ask about; their values must NOT appear literally — use placeholders; cite the numbers you used in "sources"):\n` +
          passagesBlock(input.passages)
        : '') +
```
and change the reference-PDF sentence to `input.reference.pdf && input.passages.length === 0 ? '\nThe first attached document is this reference certificate.' : ''`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --config vitest.config.ts tests/unit/integrations/passages.test.ts tests/unit/integrations/question-gen.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean. (If `tests/unit/integrations/question-gen.test.ts` does not exist, run the whole unit suite instead: `pnpm test:unit`.)

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/question-gen tests/unit/integrations/passages.test.ts
git commit -m "feat(p14b): reference passages in the question generator; sources in the structured output

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Data layer — retrieval for generation, PDF fallback rule, stored `source_refs`

**Files:**
- Create: `lib/db/passages.ts`
- Modify: `lib/db/question-gen.ts` (`loadReference`, `generateQuestionsIntoBank`)
- Test: `tests/integration/rag-consumers.test.ts`

**Interfaces:**
- Consumes: `searchRecordPassages`, `getVectorStore`, `VectorStore`, `Passage` (P14a); `CONCEPT_GROUPS`, `conceptGroupQuery`, `conceptQueries` (Task 2); `ReferencePassage`, `resolveSourceRefs` (Task 3); `directReadMaxPages` (Task 2).
- Produces:
  ```ts
  documentNamesFor(admin, recordId) → Promise<Map<string, { name: string; type: string | null }>>
  hasReadyIndex(admin, recordId) → Promise<boolean>
  loadReferencePassages(admin, vector, recordId) → Promise<ReferencePassage[]>   // [] when no store / not ready
  loadCardEvidence(admin, vector, recordId, group) → Promise<Evidence[]>          // Evidence = { document: string; page: number; text: string }
  loadReference(db, recordId) → { record, pdf }  // pdf null when the first document has page_count > directReadMaxPages()
  generateQuestionsIntoBank(db, adminId, input, generator?, vector?)  // stores source_refs
  ```

- [ ] **Step 1: Write the failing integration tests**

```ts
// tests/integration/rag-consumers.test.ts
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbdRecord, listDbdDocuments, uploadDbdDocument } from '@/lib/db/dbd-records';
import { loadCardEvidence, loadReferencePassages } from '@/lib/db/passages';
import { generateQuestionsIntoBank, loadReference } from '@/lib/db/question-gen';
import { getQuestion } from '@/lib/db/questions';
import { dbdRecordInputSchema } from '@/lib/domain/dbd-record';
import { FakeQuestionGenerator } from '@/lib/integrations/question-gen/fake';
import type { GeneratedQuestion, QuestionGenerator } from '@/lib/integrations/question-gen/types';
import { FakeVectorStore } from '@/lib/integrations/vector/fake';
import { loadChunksFromDb } from '@/lib/integrations/vector/fake-loader';
import { adminClient, clientFor, createTestUser, deleteTestUser, type Client, type TestUser } from './helpers';

const fixture = readFileSync('tests/fixtures/three-pages.pdf');
const PAGES: Record<number, string> = {
  1: 'หนังสือรับรอง\nชื่อบริษัท บริษัท อ้างอิงแรก จำกัด\nทะเบียนเลขที่ 0105569000777\nทุนจดทะเบียน 3,000,000 บาท\nกรรมการของบริษัทมี 1 คน',
  2: 'วัตถุที่ประสงค์\n1. ประกอบกิจการค้าปลีก\n2. ประกอบกิจการนำเข้าส่งออก',
  3: 'บัญชีรายชื่อผู้ถือหุ้น (บอจ.5)\n1 | นายอ้างอิง ทดสอบ | ไทย | 29,998 หุ้น\n2 | นายสอง ทดสอบ | ไทย | 2 หุ้น',
};

describe('retrieval consumers', () => {
  const svc = adminClient();
  const store = new FakeVectorStore(loadChunksFromDb);
  let admin: TestUser;
  let asAdmin: Client;
  let recordId: string;
  let otherRecordId: string;
  let documentId: string;
  const batchIds: string[] = [];
  const questionIds: string[] = [];

  /** A ready document with three typed chunk pages, straight into the tables (no worker needed). */
  async function seedIndexedDocument(record: string, name: string, texts: Record<number, string>) {
    const path = await uploadDbdDocument(asAdmin, record, new File([fixture], name, { type: 'application/pdf' }), name);
    const doc = (await listDbdDocuments(svc, record)).find((d) => d.path === path)!;
    await svc.from('index_jobs').update({ status: 'done' }).eq('document_id', doc.id);
    await svc.from('dbd_documents').update({ index_status: 'ready', indexed_pages: 3, document_type: 'certificate' }).eq('id', doc.id);
    const types: Record<number, string> = { 1: 'certificate', 2: 'objectives_sheet', 3: 'shareholder_list' };
    await svc.from('dbd_chunks').insert(
      Object.entries(texts).map(([page, text]) => ({
        id: `${doc.id}#${page}#0`,
        record_id: record,
        document_id: doc.id,
        document_type: types[Number(page)],
        page: Number(page),
        chunk_index: 0,
        chunk_text: text,
        char_count: text.length,
      })),
    );
    return doc.id;
  }

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
    const confirmed = {
      ...dbdRecordInputSchema.parse({}),
      company_name_th: 'บริษัท อ้างอิงแรก จำกัด',
      juristic_id: '0105569000777',
      registered_capital: 3000000,
      directors: [{ name_th: 'นายอ้างอิง ทดสอบ', name_en: null }],
    };
    recordId = (await createDbdRecord(asAdmin, confirmed, admin.id)).id;
    otherRecordId = (await createDbdRecord(asAdmin, { ...confirmed, company_name_th: 'บริษัท อีกแห่ง จำกัด', juristic_id: '0105569000778' }, admin.id)).id;
    documentId = await seedIndexedDocument(recordId, 'reference.pdf', PAGES);
    await seedIndexedDocument(otherRecordId, 'other.pdf', { 1: 'บริษัท อีกแห่ง จำกัด ทุนจดทะเบียน 9 บาท' });
    for (const id of [recordId, otherRecordId]) {
      await svc.from('dbd_records').update({ extraction_status: 'confirmed', confirmed_by: admin.id, confirmed_at: new Date().toISOString() }).eq('id', id);
    }
  });

  afterAll(async () => {
    await svc.from('questions').delete().in('id', questionIds);
    await svc.from('question_generation_batches').delete().in('id', batchIds);
    for (const id of [recordId, otherRecordId]) {
      const docs = await listDbdDocuments(svc, id);
      await svc.storage.from('dbd-documents').remove(docs.map((d) => d.path));
      await svc.from('dbd_records').delete().eq('id', id);
    }
    await deleteTestUser(admin.id);
  });

  it('retrieves labelled passages per concept group, deduplicated', async () => {
    const passages = await loadReferencePassages(svc, store, recordId);
    expect(passages.length).toBeGreaterThanOrEqual(3);
    expect(passages.length).toBeLessThanOrEqual(16);
    expect(new Set(passages.map((p) => p.id)).size).toBe(passages.length);
    const identity = passages.filter((p) => p.group === 'identity');
    expect(identity[0]).toMatchObject({ documentName: 'reference.pdf', documentId, page: 1 });
    expect(passages.some((p) => p.group === 'ownership' && p.page === 3)).toBe(true);
    expect(await loadReferencePassages(svc, null, recordId)).toEqual([]);
    expect(await loadReferencePassages(svc, store, otherRecordId)).not.toContainEqual(expect.objectContaining({ documentId }));
  });

  it('stores which passages each generated question came from', async () => {
    const result = await generateQuestionsIntoBank(
      asAdmin,
      admin.id,
      { referenceRecordId: recordId, studyMaterialIds: [], pastedText: '', upload: null, count: 2, templateCount: 1, pools: ['quiz'], difficulty: 'medium', focus: null },
      new FakeQuestionGenerator(),
      store,
    );
    batchIds.push(result.batchId);
    questionIds.push(...result.questionIds);
    expect(result.produced).toBe(2);
    const first = await getQuestion(asAdmin, result.questionIds[0]);
    expect(first?.source_refs).toEqual([
      { document_id: documentId, document_name: 'reference.pdf', document_type: expect.any(String), page: expect.any(Number) },
    ]);
    const { data: batch } = await svc.from('question_generation_batches').select('material_summary').eq('id', result.batchId).single();
    expect(batch?.material_summary).toMatch(/\d+ passages/);
  });

  it('works as before for a reference record without an index (empty refs)', async () => {
    const result = await generateQuestionsIntoBank(
      asAdmin,
      admin.id,
      { referenceRecordId: recordId, studyMaterialIds: [], pastedText: '', upload: null, count: 1, templateCount: 1, pools: ['quiz'], difficulty: 'medium', focus: null },
      new FakeQuestionGenerator(),
      null,
    );
    batchIds.push(result.batchId);
    questionIds.push(...result.questionIds);
    const q = await getQuestion(asAdmin, result.questionIds[0]);
    expect(q?.source_refs).toEqual([]);
  });

  it('still rejects a question that repeats a reference literal, passages or not', async () => {
    const leaking: QuestionGenerator = {
      name: 'leaking',
      model: null,
      async generate() {
        const fake = await new FakeQuestionGenerator().generate({ reference: null, passages: [], material: { text: '', pdf: null }, count: 1, templateCount: 0, difficulty: 'medium', focus: null });
        const q: GeneratedQuestion = structuredClone(fake[0]);
        q.localizations.th.prompt = 'ทุนจดทะเบียนของ บริษัท อ้างอิงแรก จำกัด คือเท่าใด';
        return [q];
      },
      async translate() {
        return {};
      },
    };
    const result = await generateQuestionsIntoBank(
      asAdmin,
      admin.id,
      { referenceRecordId: recordId, studyMaterialIds: [], pastedText: '', upload: null, count: 1, templateCount: 0, pools: ['quiz'], difficulty: 'medium', focus: null },
      leaking,
      store,
    );
    batchIds.push(result.batchId);
    expect(result.produced).toBe(0);
    expect(result.rejected[0].reason).toMatch(/literal/i);
  });

  it('attaches the reference PDF only when its first document is small enough', async () => {
    expect((await loadReference(asAdmin, recordId)).pdf).not.toBeNull();
    await svc.from('dbd_documents').update({ page_count: 25 }).eq('id', documentId);
    expect((await loadReference(asAdmin, recordId)).pdf).toBeNull();
    await svc.from('dbd_documents').update({ page_count: null }).eq('id', documentId);
    expect((await loadReference(asAdmin, recordId)).pdf).not.toBeNull(); // pre-P14 upload: unknown = small
    await svc.from('dbd_documents').update({ page_count: 3 }).eq('id', documentId);
  });

  it('returns at most three passages of the learner\'s own record for a card group', async () => {
    const evidence = await loadCardEvidence(svc, store, recordId, 'identity');
    expect(evidence.length).toBeGreaterThanOrEqual(1);
    expect(evidence.length).toBeLessThanOrEqual(3);
    expect(evidence[0]).toMatchObject({ document: 'reference.pdf', page: 1 });
    expect(evidence.every((e) => !e.text.includes('อีกแห่ง'))).toBe(true);
    expect(await loadCardEvidence(svc, null, recordId, 'identity')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run --config vitest.integration.config.ts tests/integration/rag-consumers.test.ts`
Expected: FAIL — cannot resolve `@/lib/db/passages`.

- [ ] **Step 3: Implement `lib/db/passages.ts`**

```ts
// lib/db/passages.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConceptGroup } from '@/lib/domain/bank-interview';
import { CONCEPT_GROUPS, conceptGroupQuery, conceptQueries } from '@/lib/domain/rag/concepts';
import type { ReferencePassage } from '@/lib/integrations/question-gen/passages';
import type { Passage, VectorStore } from '@/lib/integrations/vector/types';
import type { Database } from './database.types';
import { searchRecordPassages } from './dbd-index';

type Db = SupabaseClient<Database>;

/** Document names/types of a record, for labelling passages (admins or the service role). */
export async function documentNamesFor(
  db: Db,
  recordId: string,
): Promise<Map<string, { name: string; type: string | null }>> {
  const { data, error } = await db
    .from('dbd_documents')
    .select('id, original_name, document_type, index_status')
    .eq('record_id', recordId);
  if (error) throw error;
  return new Map((data ?? []).map((d) => [d.id, { name: d.original_name, type: d.document_type }]));
}

export async function hasReadyIndex(db: Db, recordId: string): Promise<boolean> {
  const { count, error } = await db
    .from('dbd_documents')
    .select('id', { head: true, count: 'exact' })
    .eq('record_id', recordId)
    .eq('index_status', 'ready');
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Passages for a generation run (spec §8): one query per concept group built from the bank's
 * questions, top 4 per group, deduplicated by chunk id. Empty when the record has no index.
 */
export async function loadReferencePassages(
  db: Db,
  vector: VectorStore | null,
  recordId: string,
): Promise<ReferencePassage[]> {
  if (!vector || !(await hasReadyIndex(db, recordId))) return [];
  const names = await documentNamesFor(db, recordId);
  const out: ReferencePassage[] = [];
  const seen = new Set<string>();
  for (const group of CONCEPT_GROUPS) {
    const hits = (await searchRecordPassages(vector, recordId, conceptGroupQuery(group), { topK: 4 })) ?? [];
    for (const hit of hits) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      out.push(toReferencePassage(hit, group, names));
    }
  }
  return out;
}

export type Evidence = { document: string; page: number; text: string };

/**
 * "From your documents" for a study card (spec §8): one query per concept of the group, top 2
 * each, merged by score, best three. The caller passes the learner's own record id only.
 */
export async function loadCardEvidence(
  db: Db,
  vector: VectorStore | null,
  recordId: string,
  group: ConceptGroup,
): Promise<Evidence[]> {
  if (!vector || !(await hasReadyIndex(db, recordId))) return [];
  const names = await documentNamesFor(db, recordId);
  const best = new Map<string, Passage>();
  for (const query of conceptQueries(group)) {
    const hits = (await searchRecordPassages(vector, recordId, query, { topK: 2 })) ?? [];
    for (const hit of hits) {
      const prev = best.get(hit.id);
      if (!prev || prev.score < hit.score) best.set(hit.id, hit);
    }
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.page - b.page)
    .slice(0, 3)
    .map((p) => ({ document: names.get(p.documentId)?.name ?? '', page: p.page, text: p.text }));
}

function toReferencePassage(
  hit: Passage,
  group: ConceptGroup,
  names: Map<string, { name: string; type: string | null }>,
): ReferencePassage {
  const doc = names.get(hit.documentId);
  return {
    id: hit.id,
    group,
    documentId: hit.documentId,
    documentName: doc?.name ?? hit.documentId,
    documentType: hit.documentType ?? doc?.type ?? null,
    page: hit.page,
    text: hit.text,
  };
}
```

- [ ] **Step 4: Wire `lib/db/question-gen.ts`**

Imports to add:

```ts
import { directReadMaxPages } from '@/lib/domain/rag/jobs';
import { resolveSourceRefs } from '@/lib/integrations/question-gen/passages';
import { getVectorStore, type VectorStore } from '@/lib/integrations/vector';
import { loadReferencePassages } from './passages';
```

`loadReference`: replace the PDF download block with

```ts
  // Attach the stored certificate only when it is small enough to read whole (D42); big packs are
  // reached through passages instead. Unknown page counts are uploads from before P14: attach.
  let pdf: Uint8Array | null = null;
  if (data.document_path) {
    const { data: first } = await db
      .from('dbd_documents')
      .select('page_count')
      .eq('record_id', recordId)
      .order('position')
      .limit(1)
      .maybeSingle();
    const pages = first?.page_count ?? null;
    if (pages === null || pages <= directReadMaxPages()) {
      const { data: blob } = await db.storage.from('dbd-documents').download(data.document_path);
      if (blob) pdf = new Uint8Array(await blob.arrayBuffer());
    }
  }
  return { record, pdf };
```

`generateQuestionsIntoBank(db, adminId, input, generator = getQuestionGenerator(), vector: VectorStore | null = getVectorStore())`:
- after `[material, reference]`, add `const passages = reference && input.referenceRecordId ? await loadReferencePassages(db, vector, input.referenceRecordId) : [];`
- pass `passages` in `generator.generate({...})`;
- summary: add `passages.length ? \`${passages.length} passages\` : null` after the DBD entry;
- in the `questions` insert add `source_refs: resolveSourceRefs(q.sources, passages) as unknown as Json` (import `Json` from `./database.types`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm typecheck && pnpm exec vitest run --config vitest.integration.config.ts tests/integration/rag-consumers.test.ts tests/integration/question-gen.test.ts`
Expected: PASS (6 new + the existing question-gen suite, whose `generateQuestionsIntoBank` calls now default `vector` to the fake store; records there have no index, so refs are `[]`).

- [ ] **Step 6: Commit**

```bash
git add lib/db/passages.ts lib/db/question-gen.ts tests/integration/rag-consumers.test.ts
git commit -m "feat(p14b): generation retrieves passages per concept group and stores source refs; PDF fallback only for small documents

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Review list shows the sources

**Files:**
- Modify: `app/[locale]/(admin)/admin/questions/page.tsx`
- Modify: `messages/th.json`, `messages/en.json`, `messages/zh.json` (`admin.questions.sources`, `admin.questions.sourceRef`)
- Test: covered by the e2e in Task 6 (`question-sources`)

**Interfaces:**
- Consumes: `questions.source_refs` (`SourceRef[]`).

- [ ] **Step 1: Add the column**

In `page.tsx` add a header cell `<th>{t('sources')}</th>` after the languages header, and in each row after the languages cell:

```tsx
                <td data-testid="question-sources" className="text-xs text-gray-600">
                  {(q.source_refs as unknown as SourceRef[]).map((r, i) => (
                    <span key={i} className="mr-1 rounded bg-gray-100 px-1">
                      {t('sourceRef', { document: r.document_name, page: r.page })}
                    </span>
                  ))}
                </td>
```

with `import type { SourceRef } from '@/lib/integrations/question-gen/passages';`.

Messages (`admin.questions`): th `"sources": "แหล่งที่มา"`, `"sourceRef": "{document} · หน้า {page}"`; en `"Sources"`, `"{document} · page {page}"`; zh `"来源"`, `"{document} · 第 {page} 页"`.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm exec prettier --check "app/[locale]/(admin)/admin/questions/page.tsx" messages`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "app/[locale]/(admin)/admin/questions/page.tsx" messages
git commit -m "feat(p14b): review list shows the document and page each AI question came from

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Learner "From your documents" panel + e2e

**Files:**
- Modify: `app/[locale]/(learner)/study/[key]/page.tsx`
- Modify: `messages/*.json` (`study.evidence.title`, `study.evidence.hint`, `study.evidence.source`)
- Modify: `tests/e2e/seed.ts` (`seedLearnerForRecord`)
- Test: `tests/e2e/rag-consumers.spec.ts`

**Interfaces:**
- Consumes: `loadCardEvidence` (Task 4), `cardConceptGroup` (Task 2), `getVectorStore`, `createSupabaseAdminClient`, `getActiveAssignmentForUser`.

- [ ] **Step 1: Write the failing e2e test**

```ts
// tests/e2e/rag-consumers.spec.ts
import { expect, test } from '@playwright/test';
import { E2E_ADMIN, E2E_PASSWORD } from './fixtures';
import { loginAs } from './helpers';
import { seedLearnerForRecord } from './seed';

test('AI questions cite the reference pack and learners see passages from their own documents', async ({
  page,
  request,
}) => {
  // 1. An indexed, confirmed reference record (upload-first → cron → confirm).
  await loginAs(page, E2E_ADMIN.loginId, E2E_PASSWORD);
  await page.goto('/th/admin/dbd-records/new');
  await page.getByTestId('upload-first-file').setInputFiles('tests/fixtures/three-pages.pdf');
  await page.getByTestId('upload-first-submit').click();
  await page.waitForURL(/\/th\/admin\/dbd-records\/([0-9a-f-]{36})/);
  const recordId = page.url().match(/dbd-records\/([0-9a-f-]{36})/)![1];
  const run = await request.get('/api/cron/index', {
    headers: { Authorization: 'Bearer local-cron-secret-for-dev' },
  });
  expect(run.status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId('index-status').first()).toHaveAttribute('data-status', 'ready');
  await page.getByRole('button', { name: 'ยืนยันข้อมูล' }).click();
  await expect(page.getByTestId('record-status')).toHaveText('confirmed');

  // 2. Starter cards exist (idempotent).
  await page.goto('/th/admin/content');
  await page.getByTestId('load-starter-cards').click();
  await expect(page.getByTestId('starter-loaded')).toBeVisible();

  // 3. A batch modelled on that record cites its pages.
  await page.goto('/th/admin/questions/generate');
  await page.getByTestId('reference-record').selectOption(recordId);
  await page.locator('input[name="count"]').fill('2');
  await page.getByTestId('template-count').fill('1');
  await page.getByTestId('generate-submit').click();
  await page.waitForURL(/\/th\/admin\/questions\?batch=[0-9a-f-]{36}$/);
  const rows = page.locator('tr[data-testid^="question-ai-"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.first().getByTestId('question-sources')).toContainText('หน้า');
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();

  // 4. A learner assigned to that record sees passages from it on the identity card.
  const learner = await seedLearnerForRecord(recordId);
  await loginAs(page, learner, E2E_PASSWORD);
  await page.goto('/th/study/bank-interview-1-identity');
  const evidence = page.getByTestId('study-evidence');
  await expect(evidence).toBeVisible();
  await expect(evidence).toContainText('หน้า 1');
  await expect(evidence).toContainText('บริษัท');
  // The tips card has no concept group: no panel, no error.
  await page.goto('/th/study/bank-interview-5-tips');
  await expect(page.getByTestId('study-body')).toBeVisible();
  await expect(page.getByTestId('study-evidence')).toHaveCount(0);
});
```

Add to `tests/e2e/seed.ts`:

```ts
/** Creates a learner assigned to an existing confirmed record. Returns the login id. */
export async function seedLearnerForRecord(recordId: string): Promise<string> {
  const admin = svc();
  const domain = process.env.APP_INTERNAL_EMAIL_DOMAIN ?? 'learner.portal.internal';
  const loginId = `e2e-rag-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const { data: user, error } = await admin.auth.admin.createUser({
    email: `${loginId}@${domain}`,
    password: E2E_PASSWORD,
    email_confirm: true,
    user_metadata: { login_id: loginId, display_name: loginId, preferred_language: 'th' },
    app_metadata: { role: 'learner' },
  });
  if (error) throw error;
  const { error: assignError } = await admin
    .from('user_dbd_assignments')
    .insert({ user_id: user.user.id, dbd_record_id: recordId });
  if (assignError) throw assignError;
  return loginId;
}
```

- [ ] **Step 2: Run the e2e to verify it fails**

Run: `pnpm exec playwright test tests/e2e/rag-consumers.spec.ts`
Expected: FAIL at `question-sources` (Task 5 done → passes that step) or at `study-evidence` (panel missing).

- [ ] **Step 3: Implement the panel**

In `app/[locale]/(learner)/study/[key]/page.tsx`:

```ts
import { cardConceptGroup } from '@/lib/content/bank-interview-cards';
import { loadCardEvidence, type Evidence } from '@/lib/db/passages';
import { getVectorStore } from '@/lib/integrations/vector';
```

after `templateRecord`:

```ts
  // "From your documents" (spec §8, D44): passages of the learner's OWN record for this card's
  // concepts. The assignment is the ownership check; names are read with the service role because
  // learners cannot read dbd_documents.
  const group = cardConceptGroup(material.content_key);
  let evidence: Evidence[] = [];
  if (group && assignment) {
    try {
      evidence = await loadCardEvidence(
        createSupabaseAdminClient(),
        getVectorStore(),
        assignment.dbd_record_id,
        group,
      );
    } catch (e) {
      console.error('study evidence unavailable', e);
    }
  }
```

and after the `study-body` article:

```tsx
      {evidence.length > 0 && (
        <aside className="max-w-2xl rounded border bg-gray-50 p-4" data-testid="study-evidence">
          <h2 className="text-sm font-semibold">{t('evidence.title')}</h2>
          <p className="text-xs text-gray-600">{t('evidence.hint')}</p>
          <ol className="mt-2 grid gap-2">
            {evidence.map((e, i) => (
              <li key={i} className="rounded border bg-white p-2 text-sm">
                <p className="text-xs text-gray-500">
                  {t('evidence.source', { document: e.document, page: e.page })}
                </p>
                <p className="whitespace-pre-wrap">{e.text}</p>
              </li>
            ))}
          </ol>
        </aside>
      )}
```

Messages (`study.evidence`): th `title: "จากเอกสารของคุณ"`, `hint: "ข้อความจริงจากเอกสาร DBD ของบริษัทคุณที่เกี่ยวกับหัวข้อนี้ ใช้เทียบกับคำตอบที่เตรียมไว้"`, `source: "{document} · หน้า {page}"`; en `"From your documents"`, `"The actual text of your company's DBD documents for this topic — compare it with your prepared answers."`, `"{document} · page {page}"`; zh `"来自您的文件"`, `"您公司 DBD 文件中与本主题相关的原文，可与准备好的答案对照。"`, `"{document} · 第 {page} 页"`.

- [ ] **Step 4: Run the e2e and the study suite**

Run: `pnpm typecheck && pnpm lint && pnpm exec playwright test tests/e2e/rag-consumers.spec.ts tests/e2e/study.spec.ts tests/e2e/bank-interview.spec.ts`
Expected: 4 passed (the existing study/bank-interview specs are unaffected: their records have no index, so no panel).

- [ ] **Step 5: Commit**

```bash
git add "app/[locale]/(learner)/study/[key]/page.tsx" messages tests/e2e/seed.ts tests/e2e/rag-consumers.spec.ts
git commit -m "feat(p14b): learners see passages from their own DBD pack under each bank-interview card

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Docs, full verification, hand-off

**Files:**
- Modify: `docs/decisions-log.md` (D43 row), `docs/superpowers/specs/2026-09-21-p14-dbd-rag-index-design.md` (status: stages 1–2 implemented), `docs/runbooks/production-setup.md` (§4 content note), `README.md` (D1–D44 already; no change unless needed)

- [ ] **Step 1: Documentation**

`docs/decisions-log.md` — append:

```
| 2026-09-21 | D43 | Question generation retrieves passages of the reference record per bank-interview concept group (one query per group, top 4, deduplicated) and sends them instead of the whole PDF; the model cites passage numbers which are stored as `questions.source_refs` (document, page) and shown on the review list. Records without an index keep the old path, attaching the PDF only when its first document is ≤ `DIRECT_READ_MAX_PAGES` (20) | migration 0016, `lib/db/passages.ts`, `lib/integrations/question-gen/passages.ts` |
```

Spec header: `| Status | Stages 1–2 implemented (P14a, P14b); stage 3 (oversized-document extraction) pending |`.

Runbook §4 (question bank bullet): append the sentence "When the reference record's documents show *Ready*, the batch is grounded in retrieved passages and each draft lists its source pages; index the record first (Re-index on the record page) for big packs."

- [ ] **Step 2: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm check:secrets && pnpm test:unit && pnpm test:integration && pnpm test:e2e`
Expected: all green — unit ≥ 160, integration ≥ 109, e2e 33.

- [ ] **Step 3: Commit and finish**

```bash
git add docs
git commit -m "docs(p14b): D43, spec status, runbook note

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

Then `superpowers:finishing-a-development-branch`: fast-forward merge into `main`, push (Vercel deploys), apply `20260921000016_question_source_refs.sql` to staging with the Supabase MCP `apply_migration`, confirm `/api/health` shows the new version.

---

## Self-review notes

- **Spec coverage (stage 2):** §8 "Generate with AI" → Tasks 3–5 (passages per group, replace PDF, `source_refs`, review list, fallback rule incl. ≤ 20 pages); §8 "Study cards" → Tasks 2, 4, 6 (`cardConceptGroup`, `loadCardEvidence`, panel, hidden fallback); §4 `questions.source_refs` → Task 1; D43 → Task 7. D44's learner half ("passages of their own record only") → Task 6 with the ownership path through the active assignment.
- **Review Focus coverage:** 1 → Task 4 test "works as before …"; 2 → Task 3 test `resolveSourceRefs`; 3 → Task 4 test "still rejects …"; 4 → Task 6 e2e (tips card, no panel) + Task 4 `loadCardEvidence(…, null, …)`; 5 → Task 4 tests (`otherRecordId` exclusion in both retrieval functions).
- **Names across tasks:** `conceptQueries`/`conceptGroupQuery`/`CONCEPT_GROUPS` (T2) → T4; `cardConceptGroup` (T2) → T6; `directReadMaxPages` (T2) → T4; `ReferencePassage`/`SourceRef`/`resolveSourceRefs`/`passagesBlock` (T3) → T4, T5; `GenerateInput.passages` (T3) → T4 (`generator.generate({...passages})`) and the fake; `loadReferencePassages`/`loadCardEvidence`/`Evidence`/`hasReadyIndex`/`documentNamesFor` (T4) → T6; `generateQuestionsIntoBank(db, adminId, input, generator, vector)` (T4) → tests.
- **Placeholder scan:** none.

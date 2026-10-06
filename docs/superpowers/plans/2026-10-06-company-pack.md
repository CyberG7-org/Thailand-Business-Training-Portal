# The company pack (P18a) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A manager uploads one zip per company; the DBD pack, the invoices and the two addresses fill the record with no manual answers; the money facts are computed from the invoices by the Owner's rule; three answers are fixed text.

**Architecture:** The browser unpacks the zip (`fflate`) and sorts the entries; each PDF travels to the bucket by the existing signed-URL upload, registered with a `group` (pack / invoice / agreement) and the two addresses. The pack read is unchanged but sees pack documents only; a new `invoices` job reads the invoices into structured rows (`structured_data.invoices`); every money sentence is derived in code when the fact sheet is built (D91 pattern). Nature of business is written by the reader from objectives + items after each read. Agreements are stored only; links are stored on the record.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase (one migration), fflate (browser), Claude structured output (existing SDK wiring), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-06-company-pack-design.md`. **Decision:** D101. **Branch:** `feat/company-pack` (worktree `../portal-p17a`).

**Corrections to the spec found while planning:** a company record is created, read and accepted *before* a learner is assigned (D93), so the record cannot owe the learner's email and phone; the acceptance constraint keeps nature and products (now derived) and drops the two contact fields; the learner form keeps mobile and email *(for the name card)* as today, and the name card keeps reading them from the learner's contact (D80). The record's `contact_email` / `contact_phone` become optional record-keeping.

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20261007010000_company_pack.sql` | document group and types, record links, job kind, exception kinds, acceptance constraint |
| `lib/domain/pack/sort.ts` (new) | pure: zip entries → pack / invoice / agreement / link file / ignored, with the limits |
| `lib/domain/pack/links.ts` (new) | pure: addresses out of text (website, Facebook) |
| `lib/pack/unzip.ts` (new, browser) | fflate: a zip `File` → entries with bytes; `.docx` inner read; `.doc` text |
| `lib/domain/invoices/schema.ts` (new) | the invoice row as read, zod; `InvoiceRead` stored in `structured_data.invoices` |
| `lib/domain/invoices/arithmetic.ts` (new) | set-aside checks and the figures |
| `lib/domain/invoices/answers.ts` (new) | the derived Thai sentences, products, customer examples; `withInvoiceAnswers` |
| `lib/domain/standard-answers.ts` | three more fixed answers; the asked fields shrink |
| `lib/domain/bank-interview.ts` | required answers: nature and products only |
| `lib/domain/facts/fact-sheet.ts`, `snapshot.ts` | invoice answers applied; `invoice_summary` in the extras |
| `lib/integrations/extraction/{types,invoices,fake,normalizing,claude}.ts` | `readInvoices`, `describeBusiness` |
| `lib/db/invoices.ts` (new), `lib/db/dbd-index.ts`, `app/api/cron/index/route.ts` | the `invoices` job |
| `lib/db/extraction.ts`, `lib/db/dbd-records.ts` | pack read reads pack documents; register with a group; agreements not indexed |
| `lib/db/derived-facts.ts` | nature written from objectives + items; category follows |
| `lib/domain/validation/validators.ts` | `invoice_set_aside`, `few_invoices`; contact fields no longer block |
| `app/[locale]/(admin)/admin/dbd-records/{actions.ts,use-direct-upload.ts,[id]/*}` | zip in the upload hook; groups and links through the actions; the Documents card; links fields; *Read the invoices again* |
| `app/[locale]/(admin)/admin/users/{create-dbd-form,new-user-form,learner-contact-fields}.tsx` | no answer boxes; the zip preview; labels *(for the name card)*; website/Facebook boxes gone |
| `lib/db/name-cards.ts` | record links first, learner's as fallback |
| `messages/{th,en,zh}.json`, docs, tests | wording; D101; runbook; UAT A21 |

---

## Task 1: Migration

**Files:** create `supabase/migrations/20261007010000_company_pack.sql`; run `pnpm db:reset`, `pnpm db:types`.

- [ ] Write:

```sql
-- P18a: the company pack (spec 2026-10-06, D101).

-- 1. A document belongs to a group of the pack; invoices and agreements are document types too.
alter table public.dbd_documents
  add column "group" text not null default 'pack'
    check ("group" in ('pack', 'invoice', 'agreement'));
alter table public.dbd_documents drop constraint dbd_documents_document_type_check;
alter table public.dbd_documents add constraint dbd_documents_document_type_check
  check (document_type in ('certificate', 'objectives_sheet', 'shareholder_list', 'memorandum',
                           'articles', 'other', 'invoice', 'agreement'));

-- 2. The company's addresses, from the zip's link files; editable on the record.
alter table public.dbd_records add column website text, add column facebook_page text;

-- 3. The invoice read is a job of its own.
alter table public.index_jobs drop constraint index_jobs_kind_check;
alter table public.index_jobs add constraint index_jobs_kind_check
  check (kind in ('index', 'reindex', 'transcript', 'extract', 'invoices'));

-- 4. Two informational exception kinds.
alter table public.training_fact_exceptions drop constraint training_fact_exceptions_kind_check;
alter table public.training_fact_exceptions add constraint training_fact_exceptions_kind_check
  check (kind in ('missing', 'low_confidence', 'conflict', 'invalid', 'geo_mismatch',
                  'category_review', 'render_failure', 'invoice_set_aside', 'few_invoices'));

-- 5. A record is accepted before its learner exists (D93): it owes what it sells, not a phone.
alter table public.dbd_records drop constraint dbd_confirmed_requires_business_answers;
alter table public.dbd_records add constraint dbd_confirmed_requires_business_answers
  check (
    extraction_status <> 'confirmed'
    or (public.interview_answer(structured_data, 'nature_of_business') is not null
        and public.interview_answer(structured_data, 'products_services') is not null)
  ) not valid;
```

(The exact constraint names are read from `\d` on the local database before writing: `index_jobs_kind_check` is set in 20260921000017; the exceptions check is unnamed in 20261003010000 — name it by querying `pg_constraint` and dropping by that name in the migration, or recreate with `alter table … drop constraint <found>`.)

- [ ] `pnpm db:reset` applies; `pnpm db:types`; `pnpm typecheck` (expect errors where `group` is now required in inserts — fixed in Task 5).
- [ ] Commit `feat(db): the company pack — document groups, record links, the invoices job (D101)`.

## Task 2: Sorting a zip and reading its links (pure domain)

**Files:** create `lib/domain/pack/sort.ts`, `lib/domain/pack/links.ts`; tests `tests/unit/domain/pack/sort.test.ts`, `links.test.ts`.

- [ ] Tests first (sort): entries `[{path:'chaya/CHAYA dbd.pdf', size}, 'chaya/invoice/invoice 1.pdf', 'chaya/agreement/agreement (1).pdf', 'chaya/chaya fb.doc', '__MACOSX/._x.pdf', 'chaya/.DS_Store', 'chaya/photo.jpg', 'chaya/สัญญา/a.pdf', 'chaya/Invoices/b.PDF']` → pack 1, invoices 2, agreements 2, linkFiles 1, ignored 3; a zip with no PDF → problem `no-document`; 41 files → `too-many-files`; a 31 MB PDF → `file-too-large`; 201 MB in all → `zip-too-large`; a link file over 1 MB is ignored.
- [ ] Implement:

```ts
export type PackGroup = 'pack' | 'invoice' | 'agreement';
export type SortedEntry = { path: string; size: number; group: PackGroup };
export type SortedPack = {
  documents: SortedEntry[];
  linkFiles: { path: string; size: number }[];
  ignored: string[];
  problem: 'no-document' | 'too-many-files' | 'file-too-large' | 'zip-too-large' | null;
};
export const MAX_PACK_FILES = 40;
export const MAX_PACK_BYTES = 200 * 1024 * 1024;
export const MAX_LINK_FILE_BYTES = 1024 * 1024;
const INVOICE = /(^|\/)(invoices?|ใบแจ้งหนี้|ใบกำกับภาษี)[^/]*\//i;   // folder
const INVOICE_NAME = /(^|\/)invoice[^/]*\.pdf$/i;
const AGREEMENT = /(^|\/)(agreements?|contracts?|สัญญา)[^/]*\//i;
const AGREEMENT_NAME = /(^|\/)(agreement|contract)[^/]*\.pdf$/i;
const LINK = /\.(doc|docx|txt|url|html?)$/i;
const JUNK = /(^|\/)(__MACOSX|\.)/;   // Apple's resource forks and dot files
export function sortPackEntries(entries: { path: string; size: number }[]): SortedPack
```
groups: `JUNK` → ignored; `.pdf` under `INVOICE` folder or `INVOICE_NAME` → invoice; under `AGREEMENT` or `AGREEMENT_NAME` → agreement; other `.pdf` → pack; `LINK` ≤ 1 MB → link file; else ignored. Problems in order: too-many-files (documents > 40), file-too-large (any > `MAX_DOCUMENT_BYTES`), zip-too-large (sum > 200 MB), no-document (no PDF).

- [ ] Tests (links): `linksFromText('see https://www.facebook.com/Chayasritrade/ and www.chayasri.co.th')` → `{ facebook: 'https://www.facebook.com/Chayasritrade', website: 'https://www.chayasri.co.th' }`; a text with only a Facebook address → website null; `fb.com/x`, `m.facebook.com/x` are Facebook; a `mailto:` is ignored; nothing → both null. Reuse `toWebAddress` / `toFacebookPage` from `lib/domain/learner-contact.ts` (export them).
- [ ] Commit `feat(pack): a zip's entries are sorted and its addresses read (D101)`.

## Task 3: Unpacking in the browser

**Files:** `pnpm add fflate`; create `lib/pack/unzip.ts` (`'use client'`-safe: no Node imports); test `tests/unit/pack/unzip.test.ts` (fflate's `zipSync` builds the fixture in the test; `.docx` fixture built the same way with `word/document.xml`; `.doc` fixture = UTF-16LE bytes of a sentence with the address).

- [ ] `unpackZip(bytes: Uint8Array): Promise<{ entries: { path: string; bytes: Uint8Array }[] }>` with `unzip` (async, so a 200 MB zip does not block); throws `PackZipError('cannot-open')` on a bad zip.
- [ ] `textOfLinkFile(path, bytes): string` — `.txt/.url/.html`: UTF-8; `.docx`: `unzipSync` → `word/document.xml` → tags stripped; `.doc`: Latin-1 and UTF-16LE decodings joined.
- [ ] `openPack(file: File)` → `{ sorted: SortedPack, files: { group, file: File }[], links: { website, facebook } }` — the entries sorted (Task 2), each PDF wrapped as a `File` with its base name (`new File([bytes], name, { type: 'application/pdf' })`), the links from every link file (first found wins).
- [ ] Commit `feat(pack): the browser unpacks the zip (D101)`.

## Task 4: Invoice rows, arithmetic and answers (pure domain)

**Files:** create `lib/domain/invoices/schema.ts`, `arithmetic.ts`, `answers.ts`; tests under `tests/unit/domain/invoices/`.

- [ ] `schema.ts`:

```ts
export const invoiceItemSchema = z.object({ name: z.string(), quantity: z.number().nullable(), unit_price: z.number().nullable(), amount: z.number().nullable() });
export const invoiceRowSchema = z.object({
  index: z.number().int(), is_invoice: z.boolean(), issue_date: z.string().nullable(), invoice_no: z.string().nullable(),
  currency: z.string().nullable(), grand_total: z.number().nullable(),
  buyer_kind: z.enum(['company', 'person', 'unknown']), buyer_name_if_company: z.string().nullable(),
  items: z.array(invoiceItemSchema),
});
export const invoiceReadSchema = z.object({ read_at: z.string(), model: z.string(), rows: z.array(invoiceRowSchema) });
export type InvoiceRow = z.infer<typeof invoiceRowSchema>; export type InvoiceRead = z.infer<typeof invoiceReadSchema>;
```
`StructuredData` gains `invoices?: InvoiceRead | null`, read in `readStructuredData` with `invoiceReadSchema.safeParse`.

- [ ] `arithmetic.ts` — tests first with the Owner's example (five rows, 53000/11500/18400/12500/11500 on 2026-09-15..19, items 10..2500) expecting `{ total: 106900, invoices: 5, days: 5, averagePerTransaction: 21380, revenuePerDay: 21380, transactionsPerMonth: 30, monthlyRevenue: 641400, dailyRange: [11500, 53000], itemPriceRange: [10, 2500], dates: ['2026-09-15','2026-09-19'] }`; two invoices one day → days 4, transactions 38 (5/4×30 = 37.5 → 38); an item sum off by 15% → set aside `items_do_not_add_up`; items + 7% = total → passes; `is_invoice: false` → `not_an_invoice`; no date → `no_date`; USD → `not_baht`; fewer than 3 usable → `few: true`.

```ts
export type SetAside = 'not_an_invoice' | 'no_date' | 'no_total' | 'not_baht' | 'items_do_not_add_up';
export function checkInvoice(row: InvoiceRow): SetAside | null
export type InvoiceSummary = { invoices: number; days: number; total: number; averagePerTransaction: number; revenuePerDay: number; transactionsPerMonth: number; monthlyRevenue: number; dailyRange: [number, number]; itemPriceRange: [number, number] | null; dates: [string, string]; few: boolean; setAside: { index: number; reason: SetAside }[] };
export function summarizeInvoices(rows: InvoiceRow[]): InvoiceSummary | null   // null when no usable row
```
Tolerance: `|sum(items) − total| ≤ max(10, 0.01·total)` or `|sum·1.07 − total| ≤ max(10, 0.01·total)`. Rounding: `Math.round`.

- [ ] `answers.ts` — `invoiceAnswers(summary, rows, locale)` → `{ monthly_revenue, average_transaction, monthly_transactions, revenue_basis, transaction_details, products_services, customer_examples }` in Thai (the sheet's language), exactly the sentences of spec §6.2; products = distinct item names by frequency, max 12; examples = `buyer_name_if_company` of company rows, max 5, distinct. `withInvoiceAnswers(profile, invoices)` returns the profile with these set when `summarizeInvoices` is not null, else unchanged. Tests on the example.
- [ ] `standard-answers.ts`: `FIXED_ANSWERS` gains `client_origin`, `customer_profile`, `main_suppliers` (spec §6.3 Thai); `ASKED_INTERVIEW_FIELDS = ['monthly_revenue', 'average_transaction']` (typed only when a record has no invoices); `withStandardAnswers` computes `monthly_transactions` / `revenue_basis` as today from the typed amounts, and `withInvoiceAnswers` — applied **after** it in `buildFactSheet` and `buildTrainingSnapshot` — wins when invoices exist. Existing tests for the fixed answers updated (`tests/unit/domain/standard-answers.test.ts`).
- [ ] `bank-interview.ts`: `REQUIRED_INTERVIEW_FIELDS = ['nature_of_business', 'products_services']`; `missingBusinessAnswers` follows. `validators.ts`: the loop over `REQUIRED_INTERVIEW_FIELDS` keeps working; add findings `invoice_set_aside` (field `invoices.<index>`, detail `{ reason, signature: reason }`) and `few_invoices` (field `invoices`, signature `String(usable)`), both `blocks: 'none'`, from `input.structured.invoices`.
- [ ] `snapshot.ts`: `TrainingExtras.invoice_summary: InvoiceSummary | null`.
- [ ] Unit: `pnpm test:unit` green. Commit `feat(invoices): the money facts are computed from the invoices; three answers are fixed (D101)`.

## Task 5: Reading invoices and describing the business (extractor)

**Files:** `lib/integrations/extraction/types.ts`, create `invoices.ts` (Claude instructions + schema), `claude.ts`, `fake.ts`, `normalizing.ts`; tests `tests/unit/integrations/extraction-invoices.test.ts` (stub client, as `extraction-pictures.test.ts`).

- [ ] `DbdExtractor` gains `readInvoices(documents: Uint8Array[]): Promise<InvoiceRow[]>` and `describeBusiness(input: { objectives: string[]; items: string[] }): Promise<{ nature: string; confidence: number }>`.
- [ ] Claude `readInvoices`: documents as PDF blocks with page pictures (`pagePictures`, shared budget) and `INVOICE_INSTRUCTIONS` (copy as printed; grand total = amount payable; Buddhist years → Gregorian; `is_invoice:false` for non-invoices; never a person's name); output `zodOutputFormat(z.object({ rows: z.array(invoiceRowApiSchema) }))`; over 20 pages in all → batches of documents under 20 pages, indices offset. `describeBusiness`: one short call, `{ nature, confidence }`, max 120 Thai characters.
- [ ] Fake: `readInvoices` returns the Owner's example as five rows (dates 2026-09-15..19, totals 53000/11500/18400/12500/11500, items with a pen at 10 and a table at 2500, buyers: 3 companies named `บริษัท ลูกค้าตัวอย่าง จำกัด` …, 2 persons) — one row per document given, cycling; `describeBusiness` returns `ค้าส่งและค้าปลีกเครื่องเขียนและเฟอร์นิเจอร์สำนักงาน` at 0.9. Normalizing wrapper passes both through `normalizeThaiDeep`.
- [ ] Commit `feat(reading): invoices are read into rows; the business is described from objectives and items (D101)`.

## Task 6: The invoices job, the pack read, registering with a group

**Files:** create `lib/db/invoices.ts`; `lib/db/dbd-index.ts`, `lib/db/extraction.ts`, `lib/db/dbd-records.ts`, `lib/db/derived-facts.ts`, `app/api/cron/index/route.ts`; tests `tests/integration/invoices.test.ts`, and `tests/integration/extraction.test.ts` / `dbd-index.test.ts` updated.

- [ ] `registerDbdDocument(db, id, { path, originalName, group = 'pack' })`: writes `group`; `document_type` `'invoice'` / `'agreement'` for those groups; an agreement gets `index_status: 'skipped'` and no index job.
- [ ] `runExtraction` / `planDirectRead` / `enqueueExtractJob`: pack documents only (`group = 'pack'`). `listDbdDocuments` unchanged; add `listPackDocuments`, `listInvoiceDocuments`.
- [ ] `lib/db/invoices.ts`: `enqueueInvoicesJob(db, recordId)` (one live per record; `document_id` = first invoice; `'no_invoices'` when none); `runInvoiceRead(admin, recordId, extractor)`: download invoice documents, `readInvoices`, `updateStructuredData` → `invoices: { read_at, model: extractor.name, rows }`; then `refreshDerivedFacts(admin, recordId, { describe: true })` and `validateAfterChange`.
- [ ] `refreshDerivedFacts`: when `describe` is asked or the objectives/items hash changed, `describeBusiness({ objectives, items })` → `interview.nature_of_business` (and `products_services` from `invoiceAnswers` when invoices exist) with provenance `pack`; a typed nature on a record without invoices is kept. The category mapping follows the nature as today.
- [ ] `processIndexJobs`: `kind === 'invoices'` handled like `extract` with `deps.invoices`; the cron route passes `invoices: ({ recordId }) => runInvoiceRead(...)`. `settleReading` unchanged.
- [ ] Integration: a record with 2 pack docs + 3 invoice docs: `enqueueExtractJob` names a pack doc and `runExtraction` downloads 2 files only (spy on `extract`); `runInvoiceRead` with the fake stores 3 rows and the sheet shows `monthly_revenue = ประมาณ … บาท` computed from them; `few_invoices` opens at 2 invoices and closes at 3; a set-aside row opens `invoice_set_aside`; a new read that changes the figures makes a new training version; an agreement is `index_status: 'skipped'`.
- [ ] Commit `feat(reading): the invoices job; the pack read reads the pack alone (D101)`.

## Task 7: The upload — zip in the browser, groups and links through the actions

**Files:** `lib/domain/document-upload.ts`, `app/[locale]/(admin)/admin/dbd-records/{use-direct-upload.ts,actions.ts}`, `components/staff/pdf-file-picker.tsx`, `app/[locale]/(admin)/admin/users/create-dbd-form.tsx`, `app/[locale]/(admin)/admin/dbd-records/new/upload-first-form.tsx`, messages.

- [ ] `checkDocumentFiles`: `MAX_DOCUMENT_FILES = 40`.
- [ ] `useDirectUpload`: when the picked file is a `.zip` → `openPack` → `files` with groups, `links`; otherwise PDFs as `pack`. Exposes `preview: SortedPack & { links }` for the form (counts per group, the addresses, the problem) — computed on `change` of the file input so the manager sees it before pressing the button. `prepareUploadsAction` takes `files: (DocumentFileMeta & { group })[]` and `links`; `registerUploadsAction` takes `uploads: { path, name, group }[]` and `links`, registers each with its group, writes `website` / `facebook_page` on the record when given, queues the pack read **and** the invoices job (when any invoice).
- [ ] `PdfFilePicker`: `accept=".zip,application/pdf,application/zip"`, hint text updated; a `preview` slot renders the counts (`data-testid="pack-preview"`, with `data-pack`, `data-invoices`, `data-agreements`).
- [ ] `CreateDbdForm` and `UploadFirstForm`: the four answer inputs removed; the preview shown; `answers` no longer sent; `parseNewRecordAnswers` removed from `prepareUploadsAction`.
- [ ] Messages (`admin.createDbd`, `admin.dbd`): `documents` label → "Company zip or PDFs"; `packPreview.{pack,invoices,agreements,facebook,website,none}`; errors `too-many-files`, `file-too-large`, `zip-too-large`, `cannot-open`, `no-document`.
- [ ] E2E `tests/e2e/company-pack.spec.ts`: the test builds a zip in Node from the fixture PDFs (`three-pages.pdf` as the pack, two copies under `invoice/`, one under `agreement/`, a `links.txt` with both addresses) and uploads it with `setInputFiles`; the preview shows 1 / 2 / 1 and the Facebook page; after *Upload and read* the record's Documents tab lists the three groups and the two links; `create-learner-and-dbd.spec.ts` no longer fills the four answers.
- [ ] Commit `feat(pack): a manager uploads one zip; the browser sorts it (D101)`.

## Task 8: The record page

**Files:** `app/[locale]/(admin)/admin/dbd-records/[id]/{page.tsx,record-tools.tsx,record-data.ts,interview-form.tsx}`, `actions.ts` (`saveLinksAction`, `readInvoicesAgainAction`), messages.

- [ ] Documents card: three lists by group; an invoice row shows date and total from `structured_data.invoices` (by document position/index) or *check this invoice: reason*; *Read the invoices again* button (`data-testid="read-invoices"`); agreements with remove; below, the two link fields with Save (`data-testid="record-links"`). Reading line gains the invoices job state (`readingStatesOf` extended with kind `invoices`).
- [ ] Bank interview tab: *From the DBD* (as today), *From the invoices* (figures from `invoice_summary`, dates covered, per-invoice rows, `few_invoices` note; `data-testid="invoice-figures"`), *Fixed answers* (seven now). The two asked amounts are shown as inputs **only** when the record has no invoices, with the note *typed because there are no invoices*.
- [ ] `lib/db/name-cards.ts`: links from the record (`website`, `facebook_page`) when set, else the learner's.
- [ ] Learner form: `LearnerContactFields` drops `website` / `facebookPage`; labels for name, mobile, email carry *(for the name card)* (`admin.users.contact.forCard`).
- [ ] E2E additions in `company-pack.spec.ts`: after the cron (fake extractor) the Bank interview tab shows *ประมาณ 641,400 บาท* and *30 รายการต่อเดือน*; a learner's money study card shows the figure; the exception panel shows nothing blocking.
- [ ] Commit `feat(record): the pack's documents by group, the invoice figures, the links (D101)`.

## Task 9: The interview grader's tolerance

**Files:** `lib/integrations/interview/claude.ts` (rubric), `lib/integrations/interview/fake.ts`, `lib/db/interviews.ts` (facts carry the ranges), `tests/unit/domain/interview/*`.

- [ ] The interview fact sheet gets `revenue_per_day_range`, `item_price_range` strings built from `invoice_summary`; the money concept's expected text already carries the figures. Rubric line: *an amount within 20% of the expected one, or inside an expected range, is correct*. Fake grader: numbers within 20% match.
- [ ] Commit `feat(interview): money answers are graded with the Owner's tolerance (D101)`.

## Task 10: Real-reader check, docs, gate

- [ ] Throwaway script (never committed) runs `readInvoices` on the Owner's example zip's five invoices three times: totals and dates must equal the Owner's sums each time; print only counts and whether they match.
- [ ] Decisions log D101; runbook rows (*a zip is refused*, *check this invoice*, *the invoice figures look wrong → add or remove invoices and read again*); UAT A21; spec marked implemented with the planning corrections.
- [ ] Full gate: format, lint, typecheck, unit, `db:reset` + integration, build, secrets, e2e in two shards.
- [ ] **Before opening the PR:** ask the Owner for the production migration (`20261007010000`) and apply it on their word; then push and open the PR. The Owner merges.

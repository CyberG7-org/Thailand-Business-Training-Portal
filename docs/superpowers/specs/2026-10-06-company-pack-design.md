# The company pack — design (P18a)

Date 2026-10-06. Status: for the Owner's review.

## 1. What the Owner asked

A manager uploads **one zip** per company instead of the DBD PDFs. The zip holds the DBD pack, the
company's Facebook address, its website address (not always present), a folder of invoices and a
folder of agreements. From it the system fills everything the record needs — company name,
registration number, directors, shareholders, registration date, capital, address, objectives,
business nature, website, Facebook, business activities — **with no manual fill-in**.

Decisions taken with the Owner on 2026-10-06:

| # | Decision |
|---|---|
| 1 | The agreements are stored and listed, **not read**. The DBD pack, the invoices and the two addresses are what matters. |
| 2 | Three answers are **fixed text** for every company (§6.3): where customers are found, what kind of customers, main suppliers. |
| 3 | The three money answers — transactions per month, average per transaction, monthly revenue — are **computed from the invoices** by the rule in §5. Tolerance for grading: ±20%. |
| 4 | The website and the Facebook address are **stored and shown, not read**. |
| 5 | The company's phone and email are **not** taken from the invoices. The manager types the learner's name, mobile and email at *Create learner*, marked *(for the name card)*, as today. |
| 6 | The browser unpacks the zip and sends each file to storage as the PDF upload does today (option 1 of three; the zip never passes through a server function). |
| 7 | All arithmetic is done in code. The reader copies what is printed; it never computes. |

Two further requests from the same conversation are separate projects, specced in outline in
§15: deleting companies and learners (P18b) and manager-booked appointments (P18c).

## 2. The zip, in the browser

The *Create learner and company* page and the record's *Documents* tab get one file field that
accepts **a zip or PDFs**. Plain PDFs keep working exactly as today.

For a zip, the browser (`fflate`, ~8 KB) opens it and sorts every entry:

| Entry | Sorted as | How it is recognised |
|---|---|---|
| PDF under a folder named `invoice*` / `invoices*` / `ใบแจ้งหนี้*`, or named `invoice*` | **invoice** | folder or file name |
| PDF under a folder named `agreement*` / `contract*` / `สัญญา*`, or named `agreement*` / `contract*` | **agreement** | folder or file name |
| any other PDF | **pack** (the DBD documents) | the reader classifies it page by page, as today |
| `.doc`, `.docx`, `.txt`, `.url`, `.html` of 1 MB or less | **link file** | the first `facebook.com/…` address found is the Facebook page; the first other `http(s)://` or `www.` address is the website. A `.docx` is a zip: `word/document.xml` is searched. A `.doc` is scanned as Latin-1 and UTF-16 text. Nothing else in the file is kept. |
| anything else (images, spreadsheets, `__MACOSX`, hidden files) | **ignored** | — |

Before anything is sent, the page shows what it found — *DBD pack: 1 file · Invoices: 5 ·
Agreements: 5 (stored, not read) · Facebook: facebook.com/… · Website: none* — and one button,
*Upload and read*. A zip with no PDF at all is refused (*no document*). A zip over **200 MB**, or
with more than **40 files**, or with any file over **30 MB** (the bucket's limit), is refused
before upload with the reason. The learner's name, mobile and email stay required on the form.

Each file then travels as today: signed upload URL, browser → bucket, register. Registration
carries the sort (`pack` / `invoice` / `agreement`) and the two addresses; nothing larger than
names crosses a function boundary.

## 3. What is stored

`dbd_documents` gains `group text not null default 'pack' check (group in ('pack', 'invoice',
'agreement'))`. The existing `document_type` (certificate, objectives sheet, …) keeps describing
the pack's documents; invoices get `document_type = 'invoice'`, agreements `'agreement'` (two new
values in the check).

`dbd_records` gains `website text` and `facebook_page text`, written from the link files and
editable on the record. The name card prints these (D99) **from the record** when they are set;
the learner-profile fields of D80 remain as the fallback for cards made before this change, and
the *Create learner* form no longer asks for them.

The agreements are listed on the record with their names and sizes and can be removed; they are
never sent to the reader and never indexed.

## 4. Reading

Two different things happen to a document, and the design keeps them apart:

- **Reading for facts** — the document goes to the reader (Claude) once with a fixed form to fill
  in, and the answer is stored on the record. Every fact on the record comes from here.
- **Indexing for evidence** — the pages are cut into chunks and put into the vector index
  (Pinecone), so a page can be found and quoted: the study cards show where a fact comes from,
  *Ask the documents* answers from the pages, the interview grader can cite an invoice. **No
  record field is ever filled from the index**: retrieval finds passages, not exact values.

| File | Read for facts | Indexed |
|---|---|---|
| Pack (DBD PDFs) | As today: one reader call with sharp pictures of pages without text (D98); over 20 pages, transcribed first (D42). | Yes, as today. |
| Invoices | One reader call for the set (§5.1); pictures for pages without text. Then code computes the money facts. | Yes, `document_type = 'invoice'`. |
| Link files | Not read. The browser took the addresses. | No. |
| Agreements | Not read. | No. |

The **pack read only receives pack documents.** Today `runExtraction` sends every document of the
record that fits; it now filters on `group = 'pack'`. The invoice read is its own job
(`index_jobs.kind = 'invoices'`), queued when invoices are registered and by *Read the invoices
again*, run by the same cron with the same lease, retry and backoff as the pack read (D46), so a
slow invoice read never delays the pack and either is retried on its own.

## 5. The invoices

### 5.1 The reading form

One call, all invoices of the record attached (each is a document; over 20 pages in all, the
set is read in batches of documents that fit). Structured output, one row per document:

```
{ index, is_invoice, issue_date (YYYY-MM-DD as printed, Buddhist years converted),
  invoice_no, currency, grand_total, buyer_kind ('company' | 'person' | 'unknown'),
  buyer_name_if_company, items: [{ name, quantity, unit_price, amount }] }
```

Rules in the instructions: copy numbers as printed; the grand total is the amount payable
(รวมทั้งสิ้น / Grand total), VAT included when printed so; an attached page that is not an invoice
(a receipt, a delivery note, a blank) gets `is_invoice: false`; a person's name is never
returned — `buyer_name_if_company` is empty for a private buyer.

### 5.2 Checks in code

- An invoice whose items do not add up to its grand total within 1% (or 10 baht, whichever is
  larger) is **set aside**: shown on the record as *check this invoice*, left out of the
  arithmetic. VAT is allowed for: items + 7% VAT = total passes as well.
- A row with `is_invoice: false`, no date or no total is set aside with the reason.
- Currency other than THB is set aside (*not in baht*).

### 5.3 The arithmetic

Over the invoices that pass, with `n` invoices, `T` the sum of grand totals and `D` the number
of **distinct issue dates**:

| Figure | Rule | Owner's example (5 invoices, 15–19 Sep) |
|---|---|---|
| Average per transaction | `T / n` | 106,900 / 5 = 21,380 |
| Revenue per day | `T / D` | 21,380 |
| Transactions per month | `round(n / D × 30)` | 30 |
| Monthly revenue | `round(T / D × 30)` | 641,400 |
| Daily range | lowest and highest day total | 11,500 – 53,000 |
| Item price range | cheapest and dearest unit price across items | 10 – 2,500 |

Whole baht. Two invoices on one day are one day and two transactions. Only dates with an invoice
count as days (the Owner's example has five consecutive days; five invoices spread over two months
are still five typical days) — the record shows the dates covered so a manager sees what the
estimate rests on. With **fewer than 3 usable invoices** the figures are still computed and the
record carries an informational notice *estimated from N invoices*.

### 5.4 Where it lives

`structured_data.invoices`: the per-invoice rows as read (with `set_aside: reason | null`), the
read's time and model. Nothing else is stored: every figure in §5.3 and every sentence in §6.2
is **derived in code when the fact sheet is built** (`buildFactSheet`), the way D91's standard
answers are — so a change of rule or wording applies to every record at once, and a hand edit of
a computed figure is impossible by construction. A manager who disagrees with a figure adds or
removes invoices and reads again.

## 6. What the record is taught

### 6.1 From the DBD pack (unchanged)

Company name (Thai and English), registration number, registration and issue dates, capital,
directors, signing authority, head office address, objectives, shareholders, share structure,
promoters — read as today (D37, D42, D92, D98).

### 6.2 From the invoices (derived, Thai, as the learner is taught it)

| Fact | Text |
|---|---|
| `monthly_revenue` | ประมาณ 641,400 บาท |
| `average_transaction` | ประมาณ 21,380 บาท |
| `monthly_transactions` | ประมาณ 30 รายการต่อเดือน |
| `revenue_basis` | ประมาณจากใบแจ้งหนี้ 5 ใบ (15–19 ก.ย. 2569) รวม 106,900 บาท เฉลี่ยวันละ 21,380 บาท |
| `transaction_details` | ลูกค้าชำระด้วยการโอนเงินผ่านธนาคารและ PromptPay / QR ยอดต่อรายการระหว่าง 11,500 ถึง 53,000 บาท สินค้าราคาตั้งแต่ 10 ถึง 2,500 บาท |
| `products_services` | the distinct item names from the invoices, most frequent first, up to 12, joined with spaces (Thai) |
| `customer_examples` | the names of **company** buyers only, up to 5; empty when every buyer is a person |

Dates print in Thai Buddhist years in Thai, Gregorian in English and Chinese, through the existing
`formatDate`.

### 6.3 Fixed for every company (D91 pattern, `FIXED_ANSWERS`)

| Fact | Owner's English | Thai (for the Owner's approval) |
|---|---|---|
| `client_origin` | Online through Facebook, TikTok and website, as well as referrals and walk-in customers. | หาลูกค้าผ่านช่องทางออนไลน์ ได้แก่ Facebook, TikTok และเว็บไซต์ รวมถึงการแนะนำจากลูกค้าเดิมและลูกค้าที่เข้ามาที่ร้าน |
| `customer_profile` | Mainly businesses and individual customers in Thailand. | ส่วนใหญ่เป็นลูกค้าธุรกิจและลูกค้าบุคคลทั่วไปในประเทศไทย |
| `main_suppliers` | Local wholesalers and manufacturers in Thailand, with some products sourced from overseas suppliers. | ผู้ค้าส่งและผู้ผลิตในประเทศไทยเป็นหลัก และมีสินค้าบางส่วนที่สั่งจากผู้จำหน่ายในต่างประเทศ |

`main_clients` follows `customer_profile` as today. The four fixed answers of D91 stay.

### 6.4 Business nature and activities

- **Business nature** (`nature_of_business`): one Thai line naming the kind of business the
  company actually does, written by the reader from the objectives **and** the invoice items
  (e.g. ค้าส่งและค้าปลีกเครื่องเขียนและเฟอร์นิเจอร์สำนักงาน). It is produced by a small call
  that runs after each read of the record (pack or invoices) with whatever is present; with no
  invoices it rests on the objectives alone and carries the reader's confidence, so the
  existing category review (P17c) can ask a person when it is unsure. The category mapping reads
  it as today. `business_purpose` follows it as today (D91).
- **Business activities**: what the company actually sells and to whom — `products_services`
  (§6.2) with `customer_profile` (§6.3). No new field.

### 6.5 The learner's name card and account

Name, mobile and email are typed by the manager at *Create learner*, required, labelled *(for
the name card)*. The record's `contact_email` / `contact_phone` are filled from them as today
(D80). The website and Facebook page come from the zip (§3).

## 7. Manager screens

- **Create learner and company**: name, mobile, email *(for the name card)*; the zip (or PDFs);
  the preview of what the zip holds; *Upload and read*. The boxes for nature, products, website
  and Facebook are gone.
- **Record → Documents**: three lists — the pack (with the reader's classification, as today),
  the invoices (date and total once read; *check this invoice* with the reason; *Read the invoices
  again*), the agreements (name, size, remove). Below them the website and Facebook page as
  editable fields. More files can be added, as a zip or as PDFs, and each is sorted the same way.
- **Record → Bank interview**: nothing to type. Three groups: *From the DBD*, *From the invoices*
  (the figures of §5.3, the dates covered, the per-invoice rows, the notices), *Fixed answers*.
- **Reading line**: *reading the pack* / *reading the invoices* / *could not read the invoices
  (reason)*, each independently, like today's reading line.

## 8. Acceptance and exceptions (P17c)

- A pack **without invoices** is accepted on its DBD facts; the money facts and products are
  *missing*, the record says so, and the quiz concepts that need them are not ready for that
  company until invoices are added (D100's notice names them).
- New exception kinds, both `blocks: 'none'`: `invoice_set_aside` (one per invoice set aside,
  with the reason) and `few_invoices` (fewer than 3 usable). They close when the next invoice read
  no longer finds the problem.
- The confirmation constraint (migration 20260924000000) keeps its four answers: email and phone
  come from the form, nature and products from the reads.

## 9. The index

Unchanged in design: one chunk per page, `record_id` and `document_type` metadata, the existing
`index` job. Invoices are indexed with `document_type = 'invoice'`; the interview grader and the
money study card may ask for `documentTypes: ['invoice']` to cite one. Agreements and link files
are not indexed.

## 10. The quiz and the interview

- The quiz's money questions (concepts 18–21) render from the derived facts; nothing in the bank
  changes. `monthly_transactions_count` and the two amounts read the digits as today (D100).
- The interview's money slot is graded against the four figures with the Owner's tolerance: a
  revenue-per-day answer inside the daily range, monthly revenue and per-transaction amount
  within ±20% of the computed figure, a price inside the item range. The ranges travel to the
  grader in the fact sheet (`invoice_summary` on `TrainingExtras`); the grader's rubric gains one
  line.
- Training versions (P17b): the derived facts are part of the sheet, so a new invoice read that
  changes them makes a new version, pinned by the existing rules.

## 11. Privacy

Invoices name customers. A private person's name is never returned by the reader, never stored
and never shown; only company buyers appear, and only in `customer_examples`. The invoice pages
themselves are in the index and visible to staff of the team, as the pack is.

## 12. Limits and failure

| Case | Behaviour |
|---|---|
| Zip over 200 MB, over 40 files, a file over 30 MB, or no PDF | Refused in the browser, with the reason, before upload. |
| Zip the browser cannot open (corrupt, encrypted) | *This zip cannot be opened*; nothing uploaded. |
| Link file with no address | Nothing stored; the record's link fields stay editable. |
| Invoice read fails (model timeout, provider) | Retried by the cron as the pack read is; the reading line says so. |
| An invoice that is not an invoice | Set aside, named on the record, left out of the arithmetic. |
| Pack read fails | As today; invoices are read regardless. |

## 13. Testing

- Unit: zip sorting and link extraction on fixtures (a `.doc`, a `.docx`, a `.txt`, nested
  folders, `__MACOSX`); the arithmetic on the Owner's example and on edge sets (two invoices one
  day, one invoice, an invoice set aside, VAT totals); the derived Thai sentences; the fixed
  answers in the fact sheet.
- Integration: an invoice read with the fake extractor fills the derived facts; the pack read
  ignores invoices; versions change when invoices do; exceptions open and close.
- Real-reader check (throwaway, never committed): the Owner's example zip — the five invoices
  must read to the totals and dates of the Owner's own sums; three readings.
- E2E: a manager uploads a zip; the record lists 1 pack, 5 invoices, 5 agreements and the
  Facebook page; after the background reads the Bank interview tab shows the computed figures; a
  learner's money study card shows them with an invoice cited.

## 14. Out of scope

Reading agreements; reading the website or the Facebook page; customers' names; any new quiz or
interview concept; changes to the practice round.

## 15. The two projects that follow

**P18b — deleting companies and learners.** A delete icon in the right-hand column of the
companies list and of the learners list, for the owning manager and the Owner, with a confirm
step naming what goes. Deleting a company removes its documents (bucket and index), versions,
exceptions, the assignment, and everything the learner did on it — quiz attempts, interview
sessions, appointment, name card — and the learner account stays; the Learner Record then shows
**Ready to assign** under *Company name*, a button that opens *Create company* for that learner.
Deleting a learner removes the account and everything theirs; the company record stays, free to
be assigned again. The foreign keys that today refuse a delete (`user_dbd_assignments`,
`eligibility_snapshots`, `name_cards`, `calls`, `interview_sessions`, `appointments`) move to
`on delete cascade`.

**P18c — manager-booked appointments.** Booking moves from the learner to the manager: the
learner's *Bank appointment* page becomes read-only (the booked date, or *your manager will book
it*). The manager books from the Learner Record, only once the learner has passed the quiz and
the readiness interview, on a **month-view calendar** where any date can be picked — no time
slots, no notice period, no holiday or window rule; the slot settings and blocks of P16b leave the
screen. One appointment per learner, replaceable; the learner and the manager see the date.

## 16. For the Owner to approve with this spec

1. The Thai wording of the three fixed answers (§6.3).
2. The "dates with an invoice" rule (§5.3).
3. That a private buyer's name is never used (§11).

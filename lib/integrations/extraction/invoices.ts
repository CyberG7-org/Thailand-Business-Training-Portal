import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { InvoiceRow } from '@/lib/domain/invoices/schema';
import { countPages } from '@/lib/pdf/slice';
import { newPictureBudget, pagePictures } from './page-pictures';
import { THAI_MARKS_RULE } from './thai-marks';
import { ExtractionError } from './types';

/**
 * The invoice read (spec 2026-10-06 §5.1, D101): the reader copies each invoice into a row —
 * numbers as printed, never computed — and the code works the figures out. A private buyer's
 * name is never returned. Structured output has no nulls here, as the pack read's schema has
 * none: an empty string or a zero means "not printed", and `fromApiRow` turns them back.
 */
const MODEL = 'claude-opus-5';
const MAX_TOKENS = 16000;
/** A whole-pack read has this long; an invoice batch is smaller and gets the same. */
const TIMEOUT_MS = 140_000;
/** Documents are batched so one call carries at most this many pages. */
export const INVOICE_BATCH_PAGES = 20;

const invoiceItemApiSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit_price: z.number(),
  amount: z.number(),
});

export const invoiceRowApiSchema = z.object({
  index: z.number().int(),
  is_invoice: z.boolean(),
  issue_date: z.string(),
  invoice_no: z.string(),
  currency: z.string(),
  grand_total: z.number(),
  buyer_kind: z.enum(['company', 'person', 'unknown']),
  buyer_name_if_company: z.string(),
  items: z.array(invoiceItemApiSchema),
});
const invoiceReadApiSchema = z.object({ rows: z.array(invoiceRowApiSchema) });
type ApiRow = z.infer<typeof invoiceRowApiSchema>;

const textOrNull = (s: string) => (s.trim() === '' ? null : s.trim());
const numberOrNull = (n: number) => (n > 0 ? n : null);

export function fromApiRow(row: ApiRow, offset: number): InvoiceRow {
  return {
    index: row.index + offset,
    is_invoice: row.is_invoice,
    issue_date: textOrNull(row.issue_date),
    invoice_no: textOrNull(row.invoice_no),
    currency: textOrNull(row.currency),
    grand_total: numberOrNull(row.grand_total),
    buyer_kind: row.buyer_kind,
    // Never a person's name, whatever the reader wrote (spec §11).
    buyer_name_if_company:
      row.buyer_kind === 'company' ? textOrNull(row.buyer_name_if_company) : null,
    items: row.items.map((item) => ({
      name: item.name.trim(),
      quantity: numberOrNull(item.quantity),
      unit_price: numberOrNull(item.unit_price),
      amount: numberOrNull(item.amount),
    })),
  };
}

export const INVOICE_INSTRUCTIONS = `You are given the invoices of one Thai company, each as its own document labelled "Invoice N". Return
one row per document, in the same order, with "index" = N. Copy every value exactly as printed; never compute,
estimate or round anything — the figures are worked out afterwards from what you return.

- is_invoice: false when the document is not an invoice (a receipt, a delivery note, a quotation, a blank page).
  Fill the rest of such a row with empty values.
- issue_date: the invoice's own date as YYYY-MM-DD. A Buddhist year is converted (15/09/2569 → 2026-09-15).
  Empty when none is printed.
- invoice_no: the invoice number as printed; empty when none.
- currency: "THB" when the amounts are in baht (บาท, ฿, THB); the printed currency otherwise.
- grand_total: the amount payable — รวมทั้งสิ้น / จำนวนเงินรวมทั้งสิ้น / Grand total / Total — VAT included when
  the invoice includes it. 0 when none is printed.
- items: every line item: name as printed, quantity, unit price and line amount; 0 for a number not printed.
- buyer_kind: "company" when the customer is a juristic person (บริษัท, หจก., ห้างหุ้นส่วน, Co., Ltd., Ltd.,
  Partnership); "person" when the customer is an individual (a name with นาย, นาง, นางสาว, Mr, Mrs, Ms, or no
  company word); "unknown" when no customer is printed.
- buyer_name_if_company: the customer's name only when buyer_kind is "company"; empty otherwise. Never write a
  private person's name anywhere in the output.
- ${THAI_MARKS_RULE}
- Some pages are given a second time as a sharp picture, labelled with their document and page number. Those
  pages have no reliable text of their own: read every number and name on them from the picture.`;

/** Documents in batches of at most `INVOICE_BATCH_PAGES` pages; a long document is a batch alone. */
export async function batchByPages(
  documents: readonly Uint8Array[],
  maxPages = INVOICE_BATCH_PAGES,
): Promise<{ offset: number; documents: Uint8Array[] }[]> {
  const batches: { offset: number; documents: Uint8Array[] }[] = [];
  let current: Uint8Array[] = [];
  let pages = 0;
  let offset = 0;
  for (const [i, doc] of documents.entries()) {
    let count = 1;
    try {
      count = await countPages(doc);
    } catch {
      count = 1;
    }
    if (current.length > 0 && pages + count > maxPages) {
      batches.push({ offset, documents: current });
      offset = i;
      current = [];
      pages = 0;
    }
    current.push(doc);
    pages += count;
  }
  if (current.length > 0) batches.push({ offset, documents: current });
  return batches;
}

async function readBatch(
  client: Anthropic,
  documents: readonly Uint8Array[],
  offset: number,
): Promise<InvoiceRow[]> {
  const content: Anthropic.ContentBlockParam[] = [];
  const budget = newPictureBudget(documents.reduce((n, d) => n + d.byteLength, 0));
  for (const [i, pdf] of documents.entries()) {
    content.push(
      { type: 'text', text: `Invoice ${i + 1} of ${documents.length}:` },
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: Buffer.from(pdf).toString('base64'),
        },
      },
    );
    for (const picture of await pagePictures(pdf, budget)) {
      content.push(
        { type: 'text', text: `Page ${picture.page} of invoice ${i + 1}, as a sharp picture:` },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: Buffer.from(picture.png).toString('base64'),
          },
        },
      );
    }
  }
  content.push({ type: 'text', text: INVOICE_INSTRUCTIONS });
  const response = await client.messages
    .stream(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content }],
        output_config: { format: zodOutputFormat(invoiceReadApiSchema) },
      },
      { timeout: TIMEOUT_MS },
    )
    .finalMessage();
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    throw new ExtractionError('The model did not return the invoices', 'invalid_output');
  }
  return response.parsed_output.rows.map((row) => fromApiRow(row, offset));
}

/** Every invoice document of a record, read into rows; indices follow the order given. */
export async function readInvoicesWithClaude(
  client: Anthropic,
  documents: readonly Uint8Array[],
): Promise<InvoiceRow[]> {
  if (documents.length === 0) return [];
  const rows: InvoiceRow[] = [];
  for (const batch of await batchByPages(documents)) {
    rows.push(...(await readBatch(client, batch.documents, batch.offset)));
  }
  return rows.sort((a, b) => a.index - b.index);
}

const natureApiSchema = z.object({ nature: z.string(), confidence: z.number() });

export const NATURE_INSTRUCTIONS = `From a Thai company's registered objectives and the items it actually sold, write ONE Thai line naming the
kind of business it does, as a bank officer would summarise it — for example
"ค้าส่งและค้าปลีกเครื่องเขียนและเฟอร์นิเจอร์สำนักงาน". At most 120 characters, no company name, no list of items.
What the invoices show was sold counts more than the objectives, which are often a long standard list. Give a
confidence from 0 to 1: high when the items make the business plain, low when only the objectives are there.`;

/** One Thai line for `nature_of_business` (spec 2026-10-06 §6.4), with the reader's confidence. */
export async function describeBusinessWithClaude(
  client: Anthropic,
  input: { objectives: string[]; items: string[] },
): Promise<{ nature: string; confidence: number }> {
  const text = [
    `Registered objectives (${input.objectives.length}):`,
    ...input.objectives.slice(0, 60).map((o, i) => `${i + 1}. ${o}`),
    '',
    `Items sold, from the invoices (${input.items.length}):`,
    ...input.items.slice(0, 60).map((item) => `- ${item}`),
    '',
    NATURE_INSTRUCTIONS,
  ].join('\n');
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 400,
    messages: [{ role: 'user', content: text }],
    output_config: { format: zodOutputFormat(natureApiSchema) },
  });
  if (!response.parsed_output) {
    throw new ExtractionError('The model did not describe the business', 'invalid_output');
  }
  return {
    nature: response.parsed_output.nature.trim().slice(0, 120),
    confidence: Math.min(1, Math.max(0, response.parsed_output.confidence)),
  };
}

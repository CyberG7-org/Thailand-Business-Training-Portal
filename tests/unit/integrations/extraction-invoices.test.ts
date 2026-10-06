import type Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { summarizeInvoices } from '@/lib/domain/invoices/arithmetic';
import { ClaudeDbdExtractor } from '@/lib/integrations/extraction/claude';
import { FAKE_INVOICES, FakeDbdExtractor } from '@/lib/integrations/extraction/fake';
import {
  INVOICE_INSTRUCTIONS,
  batchByPages,
  fromApiRow,
} from '@/lib/integrations/extraction/invoices';

type Block = { type: string; text?: string };

/** A stub that keeps what it was sent and answers with the rows given, offsets applied by the code. */
function stubClient(calls: Block[][], rowsPerCall: () => unknown[]) {
  return {
    messages: {
      stream: (params: { messages: { content: Block[] }[] }) => {
        calls.push(params.messages[0].content);
        return {
          finalMessage: async () => ({
            stop_reason: 'end_turn',
            parsed_output: { rows: rowsPerCall() },
          }),
        };
      },
      parse: async () => ({
        parsed_output: { nature: ' ค้าส่งเครื่องเขียน ', confidence: 1.4 },
      }),
    },
  } as unknown as Anthropic;
}

async function pdfOf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return doc.save();
}

const apiRow = (index: number) => ({
  index,
  is_invoice: true,
  issue_date: '2026-09-15',
  invoice_no: '',
  currency: 'THB',
  grand_total: 1000,
  buyer_kind: 'person' as const,
  buyer_name_if_company: 'นายคนหนึ่ง',
  items: [{ name: ' ปากกา ', quantity: 0, unit_price: 10, amount: 0 }],
});

describe('the invoice read (D101)', () => {
  it('sends each invoice as its own document, labelled, then the instructions', async () => {
    const calls: Block[][] = [];
    const extractor = new ClaudeDbdExtractor(stubClient(calls, () => [apiRow(1), apiRow(2)]));
    const rows = await extractor.readInvoices([await pdfOf(2), await pdfOf(2)]);
    expect(calls).toHaveLength(1);
    const texts = calls[0].filter((b) => b.type === 'text').map((b) => b.text);
    expect(texts[0]).toBe('Invoice 1 of 2:');
    expect(calls[0].filter((b) => b.type === 'document')).toHaveLength(2);
    expect(texts.at(-1)).toBe(INVOICE_INSTRUCTIONS);
    expect(INVOICE_INSTRUCTIONS).toContain("private person's name anywhere");
    expect(rows.map((r) => r.index)).toEqual([1, 2]);
  });

  it('reads nothing for no documents', async () => {
    const calls: Block[][] = [];
    expect(await new ClaudeDbdExtractor(stubClient(calls, () => [])).readInvoices([])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('batches documents so a call carries at most twenty pages, keeping the indices', async () => {
    const docs = [await pdfOf(8), await pdfOf(8), await pdfOf(8), await pdfOf(25), await pdfOf(1)];
    const batches = await batchByPages(docs);
    expect(batches.map((b) => [b.offset, b.documents.length])).toEqual([
      [0, 2],
      [2, 1],
      [3, 1],
      [4, 1],
    ]);
    const calls: Block[][] = [];
    const extractor = new ClaudeDbdExtractor(
      stubClient(calls, () =>
        calls[calls.length - 1].filter((b) => b.type === 'document').map((_, i) => apiRow(i + 1)),
      ),
    );
    const rows = await extractor.readInvoices(docs);
    expect(calls).toHaveLength(4);
    expect(rows.map((r) => r.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it('turns empty values into nulls and never keeps a person’s name', () => {
    const row = fromApiRow(apiRow(1), 2);
    expect(row).toMatchObject({
      index: 3,
      invoice_no: null,
      grand_total: 1000,
      buyer_kind: 'person',
      buyer_name_if_company: null,
      items: [{ name: 'ปากกา', quantity: null, unit_price: 10, amount: null }],
    });
    expect(
      fromApiRow(
        { ...apiRow(1), buyer_kind: 'company', buyer_name_if_company: ' บริษัท ก จำกัด ' },
        0,
      ).buyer_name_if_company,
    ).toBe('บริษัท ก จำกัด');
  });

  it('describes the business in one trimmed line with a bounded confidence', async () => {
    const extractor = new ClaudeDbdExtractor(stubClient([], () => []));
    expect(await extractor.describeBusiness({ objectives: ['ค้าปลีก'], items: ['ปากกา'] })).toEqual(
      {
        nature: 'ค้าส่งเครื่องเขียน',
        confidence: 1,
      },
    );
  });

  it('fake: hands back the Owner’s example, one row per document, which sums to the Owner’s figures', async () => {
    const fake = new FakeDbdExtractor();
    const rows = await fake.readInvoices([
      new Uint8Array(1),
      new Uint8Array(1),
      new Uint8Array(1),
      new Uint8Array(1),
      new Uint8Array(1),
    ]);
    expect(rows.map((r) => r.index)).toEqual([1, 2, 3, 4, 5]);
    expect(summarizeInvoices(rows)).toMatchObject({
      total: 106900,
      monthlyRevenue: 641400,
      transactionsPerMonth: 30,
    });
    expect(
      (await fake.readInvoices([new Uint8Array(1), new Uint8Array(1)])).map((r) => r.grand_total),
    ).toEqual([FAKE_INVOICES[0].grand_total, FAKE_INVOICES[1].grand_total]);
    expect((await fake.describeBusiness({ objectives: [], items: [] })).confidence).toBe(0.6);
  });
});

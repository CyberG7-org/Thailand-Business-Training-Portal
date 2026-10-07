import { describe, expect, it } from 'vitest';
import { EMPTY_INTERVIEW_PROFILE } from '@/lib/domain/bank-interview';
import { invoiceAnswers, invoiceFacts, withInvoiceAnswers } from '@/lib/domain/invoices/answers';
import {
  checkInvoice,
  invoiceSetAsides,
  summarizeInvoices,
} from '@/lib/domain/invoices/arithmetic';
import type { InvoiceRow } from '@/lib/domain/invoices/schema';

const item = (name: string, quantity: number, unit_price: number) => ({
  name,
  quantity,
  unit_price,
  amount: quantity * unit_price,
});

/** The Owner's example: five invoices on five days, 106,900 baht in all, a pen and a table. */
export const EXAMPLE: InvoiceRow[] = [
  {
    index: 1,
    is_invoice: true,
    issue_date: '2026-09-15',
    invoice_no: 'INV-001',
    currency: 'THB',
    grand_total: 53000,
    buyer_kind: 'company',
    buyer_name_if_company: 'บริษัท ลูกค้าหนึ่ง จำกัด',
    items: [item('โต๊ะทำงาน', 20, 2500), item('ปากกา', 300, 10)],
  },
  {
    index: 2,
    is_invoice: true,
    issue_date: '2026-09-16',
    invoice_no: 'INV-002',
    currency: 'THB',
    grand_total: 11500,
    buyer_kind: 'person',
    buyer_name_if_company: null,
    items: [item('เก้าอี้', 10, 1150)],
  },
  {
    index: 3,
    is_invoice: true,
    issue_date: '2026-09-17',
    invoice_no: 'INV-003',
    currency: 'THB',
    grand_total: 18400,
    buyer_kind: 'company',
    buyer_name_if_company: 'บริษัท ลูกค้าสอง จำกัด',
    items: [item('กระดาษ A4', 80, 230)],
  },
  {
    index: 4,
    is_invoice: true,
    issue_date: '2026-09-18',
    invoice_no: 'INV-004',
    currency: 'THB',
    grand_total: 12500,
    buyer_kind: 'person',
    buyer_name_if_company: null,
    items: [item('ปากกา', 50, 10), item('แฟ้ม', 100, 120)],
  },
  {
    index: 5,
    is_invoice: true,
    issue_date: '2026-09-19',
    invoice_no: 'INV-005',
    currency: 'THB',
    grand_total: 11500,
    buyer_kind: 'company',
    buyer_name_if_company: 'บริษัท ลูกค้าหนึ่ง จำกัด',
    items: [item('เก้าอี้', 10, 1150)],
  },
];

describe('the money figures from the invoices (D101)', () => {
  it('works the Owner’s example out to the Owner’s figures', () => {
    expect(summarizeInvoices(EXAMPLE)).toEqual({
      invoices: 5,
      days: 5,
      total: 106900,
      averagePerTransaction: 21380,
      revenuePerDay: 21380,
      transactionsPerMonth: 30,
      monthlyRevenue: 641400,
      dailyRange: [11500, 53000],
      itemPriceRange: [10, 2500],
      dates: ['2026-09-15', '2026-09-19'],
      few: false,
      setAside: [],
    });
  });

  it('counts two invoices on one day as one day and two transactions', () => {
    const rows = EXAMPLE.map((r, i) => (i === 4 ? { ...r, issue_date: '2026-09-18' } : r));
    const s = summarizeInvoices(rows)!;
    expect(s.days).toBe(4);
    expect(s.transactionsPerMonth).toBe(38); // 5 / 4 × 30 = 37.5
    expect(s.revenuePerDay).toBe(26725);
    expect(s.monthlyRevenue).toBe(801750);
    expect(s.dailyRange).toEqual([11500, 53000]);
  });

  it('sets aside what cannot enter the arithmetic, and names why', () => {
    const base = EXAMPLE[0];
    expect(checkInvoice({ ...base, is_invoice: false })).toBe('not_an_invoice');
    expect(checkInvoice({ ...base, issue_date: null })).toBe('no_date');
    expect(checkInvoice({ ...base, issue_date: '15/09/2569' })).toBe('no_date');
    expect(checkInvoice({ ...base, grand_total: null })).toBe('no_total');
    expect(checkInvoice({ ...base, currency: 'USD' })).toBe('not_baht');
    expect(checkInvoice({ ...base, currency: null })).toBeNull();
    expect(checkInvoice({ ...base, currency: 'บาท' })).toBeNull();
    // Items 15% short of the total.
    expect(checkInvoice({ ...base, grand_total: 61000 })).toBe('items_do_not_add_up');
    // Items plus 7% VAT equal the total.
    expect(checkInvoice({ ...base, grand_total: 56710 })).toBeNull();
    // Within rounding.
    expect(checkInvoice({ ...base, grand_total: 53009 })).toBeNull();
    // No items printed: nothing to check against.
    expect(checkInvoice({ ...base, items: [] })).toBeNull();
  });

  it('leaves a set-aside invoice out and notes fewer than three usable ones', () => {
    const rows = [EXAMPLE[0], { ...EXAMPLE[1], is_invoice: false }, EXAMPLE[2]];
    const s = summarizeInvoices(rows)!;
    expect(s.setAside).toEqual([{ index: 2, reason: 'not_an_invoice' }]);
    expect(s.invoices).toBe(2);
    expect(s.few).toBe(true);
    expect(s.total).toBe(71400);
    expect(summarizeInvoices([{ ...EXAMPLE[0], grand_total: null }])).toBeNull();
    expect(
      invoiceSetAsides([
        { ...EXAMPLE[0], currency: 'USD' },
        { ...EXAMPLE[1], is_invoice: false },
      ]),
    ).toEqual([
      { index: 1, reason: 'not_baht' },
      { index: 2, reason: 'not_an_invoice' },
    ]);
    expect(summarizeInvoices([])).toBeNull();
  });
});

describe('what the record is taught from the invoices (D101)', () => {
  it('says the figures in Thai, exactly as the spec words them', () => {
    const s = summarizeInvoices(EXAMPLE)!;
    expect(invoiceAnswers(s, EXAMPLE)).toEqual({
      monthly_revenue: 'ประมาณ 641,400 บาท',
      average_transaction: 'ประมาณ 21,380 บาท',
      monthly_transactions: 'ประมาณ 30 รายการต่อเดือน',
      revenue_basis:
        'ประมาณจากใบแจ้งหนี้ 5 ใบ (15 กันยายน 2569 – 19 กันยายน 2569) รวม 106,900 บาท เฉลี่ยวันละ 21,380 บาท',
      transaction_details:
        'ลูกค้าชำระด้วยการโอนเงินผ่านธนาคารและ PromptPay / QR ยอดต่อรายการระหว่าง 11,500 ถึง 53,000 บาท สินค้าราคาตั้งแต่ 10 ถึง 2,500 บาท',
      products_services: 'เก้าอี้ ปากกา กระดาษ A4 โต๊ะทำงาน แฟ้ม',
      customer_examples: 'บริษัท ลูกค้าหนึ่ง จำกัด, บริษัท ลูกค้าสอง จำกัด',
    });
  });

  it('puts the invoices’ answers over the typed ones, and leaves a record without invoices alone', () => {
    const typed = {
      ...EMPTY_INTERVIEW_PROFILE,
      monthly_revenue: 'ประมาณ 300,000 บาท',
      products_services: 'ชุดเดรส',
      customer_examples: null,
    };
    const read = { read_at: '2026-10-06T00:00:00Z', model: 'fake', rows: EXAMPLE };
    const filled = withInvoiceAnswers(typed, read);
    expect(filled.monthly_revenue).toBe('ประมาณ 641,400 บาท');
    expect(filled.monthly_volume).toBe('ประมาณ 641,400 บาท');
    expect(filled.products_services).toBe('เก้าอี้ ปากกา กระดาษ A4 โต๊ะทำงาน แฟ้ม');
    expect(withInvoiceAnswers(typed, null)).toEqual(typed);
    expect(withInvoiceAnswers(typed, { ...read, rows: [] })).toEqual(typed);
    // Invoices with no items keep the typed product list; private buyers give no example.
    const bare = read.rows.map((r) => ({ ...r, items: [], buyer_kind: 'person' as const }));
    const kept = withInvoiceAnswers(typed, { ...read, rows: bare });
    expect(kept.products_services).toBe('ชุดเดรส');
    expect(kept.customer_examples).toBeNull();
  });
});

describe('the ranges the officer grades against (D101)', () => {
  it('states a day’s takings and an item’s price as ranges, in Thai', () => {
    expect(invoiceFacts(summarizeInvoices(EXAMPLE))).toEqual({
      revenue_per_day: 'ประมาณ 21,380 บาท',
      revenue_per_day_range: 'ระหว่าง 11,500 ถึง 53,000 บาท',
      transactions_per_month: 'ประมาณ 30 รายการ',
      item_price_range: 'ระหว่าง 10 ถึง 2,500 บาท',
    });
  });

  it('adds nothing when there are no invoices', () => {
    expect(invoiceFacts(null)).toEqual({});
  });
});

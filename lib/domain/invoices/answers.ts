import type { InterviewProfile } from '@/lib/domain/bank-interview';
import { formatDate } from '@/lib/domain/thai-date';
import { summarizeInvoices, type InvoiceSummary } from './arithmetic';
import type { InvoiceRead, InvoiceRow } from './schema';

/** The answers the invoices supply (spec 2026-10-06 §6.2), in Thai, as every fact is. */
export type InvoiceAnswers = Pick<
  InterviewProfile,
  | 'monthly_revenue'
  | 'average_transaction'
  | 'monthly_transactions'
  | 'revenue_basis'
  | 'transaction_details'
  | 'products_services'
  | 'customer_examples'
>;

const MAX_PRODUCTS = 12;
const MAX_EXAMPLES = 5;
const PAYMENT = 'ลูกค้าชำระด้วยการโอนเงินผ่านธนาคารและ PromptPay / QR';
const baht = (n: number) => `${n.toLocaleString('en-US')} บาท`;

/** `15–19 ก.ย. 2569`, or one date when the invoices are all of a day. */
function datesCovered([first, last]: [string, string]): string {
  const a = formatDate(first, 'th');
  const b = formatDate(last, 'th');
  return first === last ? a : `${a} – ${b}`;
}

/** Distinct item names, most frequent first, as the products the company sells. */
export function productsOf(rows: readonly InvoiceRow[]): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!row.is_invoice) continue;
    for (const item of row.items) {
      const name = item.name.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const names = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'))
    .slice(0, MAX_PRODUCTS)
    .map(([name]) => name);
  return names.length ? names.join(' ') : null;
}

/** Company buyers only: a private person's name is never copied off an invoice (spec §11). */
export function customerExamplesOf(rows: readonly InvoiceRow[]): string | null {
  const names: string[] = [];
  for (const row of rows) {
    const name = row.buyer_kind === 'company' ? row.buyer_name_if_company?.trim() : null;
    if (name && !names.includes(name)) names.push(name);
    if (names.length === MAX_EXAMPLES) break;
  }
  return names.length ? names.join(', ') : null;
}

export function invoiceAnswers(
  summary: InvoiceSummary,
  rows: readonly InvoiceRow[],
): InvoiceAnswers {
  const [lowDay, highDay] = summary.dailyRange;
  const prices = summary.itemPriceRange
    ? ` สินค้าราคาตั้งแต่ ${summary.itemPriceRange[0].toLocaleString('en-US')} ถึง ${summary.itemPriceRange[1].toLocaleString('en-US')} บาท`
    : '';
  return {
    monthly_revenue: `ประมาณ ${baht(summary.monthlyRevenue)}`,
    average_transaction: `ประมาณ ${baht(summary.averagePerTransaction)}`,
    monthly_transactions: `ประมาณ ${summary.transactionsPerMonth.toLocaleString('en-US')} รายการต่อเดือน`,
    revenue_basis: `ประมาณจากใบแจ้งหนี้ ${summary.invoices} ใบ (${datesCovered(summary.dates)}) รวม ${baht(summary.total)} เฉลี่ยวันละ ${baht(summary.revenuePerDay)}`,
    transaction_details: `${PAYMENT} ยอดต่อรายการระหว่าง ${lowDay.toLocaleString('en-US')} ถึง ${baht(highDay)}${prices}`,
    products_services: productsOf(rows),
    customer_examples: customerExamplesOf(rows),
  };
}

/**
 * The profile with the invoices' answers on top (D91 pattern: derived always wins, nothing is
 * stored as prose). Unchanged when the record has no usable invoice, so a record from before
 * the pack keeps what was typed.
 */
export function withInvoiceAnswers(
  profile: InterviewProfile,
  invoices: InvoiceRead | null | undefined,
): InterviewProfile {
  const summary = invoices ? summarizeInvoices(invoices.rows) : null;
  if (!summary) return profile;
  const answers = invoiceAnswers(summary, invoices!.rows);
  return {
    ...profile,
    ...answers,
    // A product list the invoices cannot give keeps what the record had.
    products_services: answers.products_services ?? profile.products_services,
    customer_examples: answers.customer_examples ?? profile.customer_examples,
    // The earlier answer the study card prints follows the new one (D91).
    monthly_volume: answers.monthly_revenue,
  };
}

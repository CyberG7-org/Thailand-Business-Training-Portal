import type { InvoiceRow } from './schema';

/** Why an invoice is left out of the arithmetic; shown on the record as "check this invoice". */
export type SetAside =
  'not_an_invoice' | 'no_date' | 'no_total' | 'not_baht' | 'items_do_not_add_up';

/** With fewer usable invoices than this the figures still stand, with a notice. */
export const FEW_INVOICES = 3;
const VAT = 1.07;
const BAHT = /^(thb|บาท|baht|฿)?$/i;

/** Whether `sum` is `total` within rounding: 1% of the total, or 10 baht, whichever is larger. */
function closeTo(sum: number, total: number): boolean {
  return Math.abs(sum - total) <= Math.max(10, 0.01 * Math.abs(total));
}

/** What the reader returned for one invoice, checked before it enters the arithmetic (§5.2). */
export function checkInvoice(row: InvoiceRow): SetAside | null {
  if (!row.is_invoice) return 'not_an_invoice';
  if (!row.issue_date || !/^\d{4}-\d{2}-\d{2}$/.test(row.issue_date)) return 'no_date';
  if (row.grand_total === null || !(row.grand_total > 0)) return 'no_total';
  if (!BAHT.test((row.currency ?? '').trim())) return 'not_baht';
  const amounts = row.items.map((i) => i.amount ?? (i.quantity ?? 1) * (i.unit_price ?? 0));
  if (row.items.length > 0 && amounts.every((a) => Number.isFinite(a))) {
    const sum = amounts.reduce((n, a) => n + a, 0);
    if (!closeTo(sum, row.grand_total) && !closeTo(sum * VAT, row.grand_total)) {
      return 'items_do_not_add_up';
    }
  }
  return null;
}

export type InvoiceSummary = {
  invoices: number;
  days: number;
  total: number;
  averagePerTransaction: number;
  revenuePerDay: number;
  transactionsPerMonth: number;
  monthlyRevenue: number;
  dailyRange: [number, number];
  itemPriceRange: [number, number] | null;
  /** First and last invoice date, YYYY-MM-DD. */
  dates: [string, string];
  few: boolean;
  setAside: { index: number; reason: SetAside }[];
};

/** Rejection reasons exist even when no invoice is usable and therefore no summary can be made. */
export function invoiceSetAsides(
  rows: readonly InvoiceRow[],
): { index: number; reason: SetAside }[] {
  return rows.flatMap((row) => {
    const reason = checkInvoice(row);
    return reason ? [{ index: row.index, reason }] : [];
  });
}

/**
 * The Owner's rule (spec 2026-10-06 §5.3): whole baht; two invoices on one day are one day and
 * two transactions; only dates with an invoice count as days; a month is thirty of them.
 * Null when no invoice can be used.
 */
export function summarizeInvoices(rows: readonly InvoiceRow[]): InvoiceSummary | null {
  const setAside = invoiceSetAsides(rows);
  const usable = rows.filter((row) => checkInvoice(row) === null);
  if (usable.length === 0) return null;

  const total = usable.reduce((n, r) => n + r.grand_total!, 0);
  const byDay = new Map<string, number>();
  for (const row of usable) {
    byDay.set(row.issue_date!, (byDay.get(row.issue_date!) ?? 0) + row.grand_total!);
  }
  const days = byDay.size;
  const dayTotals = [...byDay.values()];
  const dates = [...byDay.keys()].sort();
  const prices = usable
    .flatMap((r) => r.items.map((i) => i.unit_price))
    .filter((p): p is number => p !== null && p > 0);
  return {
    invoices: usable.length,
    days,
    total: Math.round(total),
    averagePerTransaction: Math.round(total / usable.length),
    revenuePerDay: Math.round(total / days),
    transactionsPerMonth: Math.round((usable.length / days) * 30),
    monthlyRevenue: Math.round((total / days) * 30),
    dailyRange: [Math.round(Math.min(...dayTotals)), Math.round(Math.max(...dayTotals))],
    itemPriceRange: prices.length ? [Math.min(...prices), Math.max(...prices)] : null,
    dates: [dates[0], dates[dates.length - 1]],
    few: usable.length < FEW_INVOICES,
    setAside,
  };
}

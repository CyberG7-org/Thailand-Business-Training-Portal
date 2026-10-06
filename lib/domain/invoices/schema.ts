import { z } from 'zod';

/**
 * An invoice as the reader copies it (spec 2026-10-06 §5.1, D101): numbers as printed, never
 * computed; a private buyer's name never returned. The rows are stored on the record
 * (`structured_data.invoices`) and every figure is worked out from them in code.
 */
export const invoiceItemSchema = z.object({
  name: z.string(),
  quantity: z.number().nullable(),
  unit_price: z.number().nullable(),
  amount: z.number().nullable(),
});
export type InvoiceItem = z.infer<typeof invoiceItemSchema>;

export const invoiceRowSchema = z.object({
  /** 1-based position among the invoice documents given to the reader. */
  index: z.number().int(),
  is_invoice: z.boolean(),
  /** YYYY-MM-DD, Buddhist years converted; null when none is printed. */
  issue_date: z.string().nullable(),
  invoice_no: z.string().nullable(),
  currency: z.string().nullable(),
  /** The amount payable, VAT included when printed so. */
  grand_total: z.number().nullable(),
  buyer_kind: z.enum(['company', 'person', 'unknown']),
  buyer_name_if_company: z.string().nullable(),
  items: z.array(invoiceItemSchema),
});
export type InvoiceRow = z.infer<typeof invoiceRowSchema>;

export const invoiceReadSchema = z.object({
  read_at: z.string(),
  model: z.string(),
  rows: z.array(invoiceRowSchema),
});
export type InvoiceRead = z.infer<typeof invoiceReadSchema>;

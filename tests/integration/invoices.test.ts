import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enqueueExtractJob, processIndexJobs } from '@/lib/db/dbd-index';
import {
  getDbdRecord,
  listDbdDocuments,
  newDocumentPath,
  registerDbdDocument,
} from '@/lib/db/dbd-records';
import { runExtraction } from '@/lib/db/extraction';
import { enqueueInvoicesJob, invoicesRunner, runInvoiceRead } from '@/lib/db/invoices';
import { getActiveVersion, readSnapshot } from '@/lib/db/training-versions';
import { listOpenExceptions, validateRecord } from '@/lib/db/validation';
import { readStructuredData } from '@/lib/domain/dbd-profile';
import { buildFactSheet } from '@/lib/domain/facts/fact-sheet';
import type { PackGroup } from '@/lib/domain/pack/sort';
import { FAKE_INVOICES, FAKE_NATURE, FakeDbdExtractor } from '@/lib/integrations/extraction/fake';
import type { DbdExtractor } from '@/lib/integrations/extraction/types';
import {
  adminClient,
  completeRecord,
  confirmRecord,
  deleteTeam,
  seedTeam,
  type Team,
} from './helpers';

const svc = adminClient();
const fixture = new Uint8Array(readFileSync('tests/fixtures/three-pages.pdf'));

/** Puts the fixture PDF in the bucket under the record and registers it with its group. */
async function addDocument(recordId: string, name: string, group: PackGroup): Promise<string> {
  const path = newDocumentPath(recordId);
  const { error } = await svc.storage
    .from('dbd-documents')
    .upload(path, fixture, { contentType: 'application/pdf' });
  if (error) throw error;
  await registerDbdDocument(svc, recordId, { path, originalName: name, group });
  return path;
}

describe('the invoices of a company pack (D101)', () => {
  let team: Team;
  const fake = new FakeDbdExtractor();

  beforeAll(async () => {
    team = await seedTeam('ใบแจ้งหนี้');
    await addDocument(team.recordId, 'objectives.pdf', 'pack');
    await addDocument(team.recordId, 'invoice 1.pdf', 'invoice');
    await addDocument(team.recordId, 'invoice 2.pdf', 'invoice');
    await addDocument(team.recordId, 'invoice 3.pdf', 'invoice');
    await addDocument(team.recordId, 'agreement (1).pdf', 'agreement');
  });

  afterAll(async () => {
    await deleteTeam(team);
  });

  it('registers each document with its group; an agreement is neither read nor indexed', async () => {
    const docs = await listDbdDocuments(svc, team.recordId);
    expect(docs.map((d) => [d.group, d.document_type])).toEqual([
      ['pack', null],
      ['pack', null],
      ['invoice', 'invoice'],
      ['invoice', 'invoice'],
      ['invoice', 'invoice'],
      ['agreement', 'agreement'],
    ]);
    expect(docs.find((d) => d.group === 'agreement')?.index_status).toBe('skipped');
  });

  it('reads the pack alone: the extract job names a pack document and the reader gets two files', async () => {
    expect(await enqueueExtractJob(svc, team.recordId)).toBe('queued');
    const { data: job } = await svc
      .from('index_jobs')
      .select('document_id, dbd_documents(group)')
      .eq('record_id', team.recordId)
      .eq('kind', 'extract')
      .single();
    expect((job?.dbd_documents as unknown as { group: string }).group).toBe('pack');
    await svc.from('index_jobs').delete().eq('record_id', team.recordId).eq('kind', 'extract');

    let given = 0;
    const counting: DbdExtractor = {
      ...fake,
      name: 'counting',
      extract: async (documents) => {
        given = documents.length;
        return fake.extract(documents);
      },
      transcribe: (s, r) => fake.transcribe(s, r),
      classify: (t) => fake.classify(t),
      extractFacts: (p) => fake.extractFacts(p),
      sweep: (p, t) => fake.sweep(p, t),
      readInvoices: (d) => fake.readInvoices(d),
      describeBusiness: (i) => fake.describeBusiness(i),
    };
    await runExtraction(svc, team.recordId, counting, null);
    expect(given).toBe(2);
  });

  it('reads the invoices into rows, computes the figures, describes the business and raises nothing blocking', async () => {
    expect(await enqueueInvoicesJob(svc, team.recordId)).toBe('queued');
    expect(await enqueueInvoicesJob(svc, team.recordId)).toBe('already_live');
    const summary = await processIndexJobs({
      extractor: fake,
      vector: null,
      invoices: (input) => invoicesRunner(fake, input),
      budgetMs: 60_000,
    });
    expect(summary.invoices).toBe(1);

    const record = (await getDbdRecord(svc, team.recordId))!;
    const structured = readStructuredData(record.structured_data);
    expect(structured.invoices?.rows).toHaveLength(3);
    expect(structured.invoices?.rows.map((r) => r.grand_total)).toEqual([53000, 11500, 18400]);
    // Three invoices on three days: 82,900 in all, 27,633 a day, 30 a month, 829,000 a month.
    const facts = buildFactSheet({ record, structured, address: null, role: null });
    expect(facts.monthly_revenue).toBe('ประมาณ 829,000 บาท');
    expect(facts.average_transaction).toBe('ประมาณ 27,633 บาท');
    expect(facts.monthly_transactions).toBe('ประมาณ 30 รายการต่อเดือน');
    expect(facts.products_services).toContain('โต๊ะทำงาน');
    expect(facts.customer_examples).toBe(
      [FAKE_INVOICES[0].buyer_name_if_company, FAKE_INVOICES[2].buyer_name_if_company].join(', '),
    );
    expect(facts.nature_of_business).toBe(FAKE_NATURE);
    expect(structured.described?.confidence).toBe(0.9);
    expect(structured.interview?.products_services).toContain('ปากกา');

    const open = await listOpenExceptions(svc, team.recordId);
    expect(open.filter((e) => e.kind === 'few_invoices' || e.kind === 'invoice_set_aside')).toEqual(
      [],
    );
    expect(open.every((e) => e.blocks !== 'none' || e.kind !== 'few_invoices')).toBe(true);
  });

  it('notes fewer than three usable invoices, and an invoice set aside, until the next read says otherwise', async () => {
    // Two usable rows: the third says it is not an invoice.
    const twoAndOneAside: DbdExtractor = {
      ...fake,
      readInvoices: async (documents) => {
        const rows = await fake.readInvoices(documents);
        return rows.map((r, i) => (i === 2 ? { ...r, is_invoice: false } : r));
      },
    } as DbdExtractor;
    await runInvoiceRead(svc, team.recordId, twoAndOneAside);
    const open = await listOpenExceptions(svc, team.recordId);
    expect(open.map((e) => [e.kind, e.field, e.blocks]).filter(([k]) => k !== 'missing')).toEqual(
      expect.arrayContaining([
        ['invoice_set_aside', 'invoices.3', 'none'],
        ['few_invoices', 'invoices', 'none'],
      ]),
    );
    // The figures rest on the two that passed.
    const record = (await getDbdRecord(svc, team.recordId))!;
    const facts = buildFactSheet({
      record,
      structured: readStructuredData(record.structured_data),
      address: null,
      role: null,
    });
    expect(facts.revenue_basis).toContain('ใบแจ้งหนี้ 2 ใบ');

    await runInvoiceRead(svc, team.recordId, fake);
    const after = await listOpenExceptions(svc, team.recordId);
    expect(
      after.filter((e) => e.kind === 'few_invoices' || e.kind === 'invoice_set_aside'),
    ).toEqual([]);
  });

  it('a confirmed record gets a new training version when a read changes its figures', async () => {
    await confirmRecord(team.recordId, team.manager.id);
    await completeRecord(team.recordId);
    // completeRecord rewrote the structured data: read the invoices again so the rows are there.
    await runInvoiceRead(svc, team.recordId, fake);
    const validated = await validateRecord(svc, team.recordId, null);
    expect(['activated', 'unchanged']).toContain(validated?.version);
    const first = (await getActiveVersion(svc, team.recordId))!;
    expect(readSnapshot(first).facts.monthly_revenue).toBe('ประมาณ 829,000 บาท');

    const dearer: DbdExtractor = {
      ...fake,
      readInvoices: async (documents) =>
        (await fake.readInvoices(documents)).map((r) => ({
          ...r,
          grand_total: r.grand_total! * 2,
          items: r.items.map((i) => ({
            ...i,
            unit_price: i.unit_price! * 2,
            amount: i.amount! * 2,
          })),
        })),
    } as DbdExtractor;
    await runInvoiceRead(svc, team.recordId, dearer);
    const second = (await getActiveVersion(svc, team.recordId))!;
    expect(second.id).not.toBe(first.id);
    expect(readSnapshot(second).facts.monthly_revenue).toBe('ประมาณ 1,658,000 บาท');
    expect(readSnapshot(second).extras.invoice_summary?.monthlyRevenue).toBe(1658000);
  });
});

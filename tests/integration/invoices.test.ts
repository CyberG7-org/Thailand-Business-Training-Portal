import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enqueueExtractJob, processIndexJobs } from '@/lib/db/dbd-index';
import { listDbdDocuments, newDocumentPath, registerDbdDocument } from '@/lib/db/dbd-records';
import { runExtraction } from '@/lib/db/extraction';
import { enqueueInvoicesJob } from '@/lib/db/invoices';
import type { PackGroup } from '@/lib/domain/pack/sort';
import { FakeDbdExtractor } from '@/lib/integrations/extraction/fake';
import type { DbdExtractor } from '@/lib/integrations/extraction/types';
import { adminClient, deleteTeam, seedTeam, type Team } from './helpers';

const svc = adminClient();
const fixture = new Uint8Array(readFileSync('tests/fixtures/three-pages.pdf'));

async function addDocument(recordId: string, name: string, group: PackGroup): Promise<void> {
  const path = newDocumentPath(recordId);
  const { error } = await svc.storage
    .from('dbd-documents')
    .upload(path, fixture, { contentType: 'application/pdf' });
  if (error) throw error;
  await registerDbdDocument(svc, recordId, { path, originalName: name, group });
}

describe('invoice PDFs are retained but not read', () => {
  let team: Team;
  const fake = new FakeDbdExtractor();

  beforeAll(async () => {
    team = await seedTeam('ใบแจ้งหนี้');
    await addDocument(team.recordId, 'objectives.pdf', 'pack');
    await addDocument(team.recordId, 'invoice 1.pdf', 'invoice');
    await addDocument(team.recordId, 'invoice 2.pdf', 'invoice');
    await addDocument(team.recordId, 'agreement (1).pdf', 'agreement');
  });

  afterAll(async () => {
    await deleteTeam(team);
  });

  it('stores invoices and agreements without queuing their indexing', async () => {
    const docs = await listDbdDocuments(svc, team.recordId);
    expect(docs.map((doc) => [doc.group, doc.index_status])).toEqual([
      ['pack', expect.any(String)],
      ['pack', expect.any(String)],
      ['invoice', 'skipped'],
      ['invoice', 'skipped'],
      ['agreement', 'skipped'],
    ]);
    const invoiceIds = docs.filter((doc) => doc.group === 'invoice').map((doc) => doc.id);
    const { count, error } = await svc
      .from('index_jobs')
      .select('id', { count: 'exact', head: true })
      .in('document_id', invoiceIds);
    expect(error).toBeNull();
    expect(count).toBe(0);
  });

  it('extracts only DBD pack documents', async () => {
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
      readInvoices: (documents) => fake.readInvoices(documents),
      describeBusiness: (input) => fake.describeBusiness(input),
    };
    await runExtraction(svc, team.recordId, counting, null);
    expect(given).toBe(2);
  });

  it('closes a previously queued invoice job without invoking an invoice reader', async () => {
    expect(await enqueueInvoicesJob(svc, team.recordId)).toBe('queued');
    const summary = await processIndexJobs({ extractor: fake, vector: null, budgetMs: 60_000 });
    expect(summary.invoices).toBe(0);
    const { data: job, error } = await svc
      .from('index_jobs')
      .select('status')
      .eq('record_id', team.recordId)
      .eq('kind', 'invoices')
      .single();
    expect(error).toBeNull();
    expect(job?.status).toBe('done');
  });
});

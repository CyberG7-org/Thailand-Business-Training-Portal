import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbdRecord, listDbdDocuments, uploadDbdDocument } from '@/lib/db/dbd-records';
import { loadCardEvidence, loadReferencePassages } from '@/lib/db/passages';
import { generateQuestionsIntoBank, loadReference } from '@/lib/db/question-gen';
import { getQuestion } from '@/lib/db/questions';
import { dbdRecordInputSchema } from '@/lib/domain/dbd-record';
import { FakeQuestionGenerator } from '@/lib/integrations/question-gen/fake';
import type { GeneratedQuestion, QuestionGenerator } from '@/lib/integrations/question-gen/types';
import { FakeVectorStore } from '@/lib/integrations/vector/fake';
import { loadChunksFromDb } from '@/lib/integrations/vector/fake-loader';
import {
  adminClient,
  clientFor,
  createTestUser,
  deleteTestUser,
  type Client,
  type TestUser,
} from './helpers';

const fixture = readFileSync('tests/fixtures/three-pages.pdf');
const PAGES: Record<number, string> = {
  1: 'หนังสือรับรอง\nชื่อบริษัท บริษัท อ้างอิงแรก จำกัด\nทะเบียนเลขที่ 0105569000777\nทุนจดทะเบียน 3,000,000 บาท\nกรรมการของบริษัทมี 1 คน',
  2: 'วัตถุที่ประสงค์\n1. ประกอบกิจการค้าปลีก\n2. ประกอบกิจการนำเข้าส่งออก',
  3: 'บัญชีรายชื่อผู้ถือหุ้น (บอจ.5)\n1 | นายอ้างอิง ทดสอบ | ไทย | 29,998 หุ้น\n2 | นายสอง ทดสอบ | ไทย | 2 หุ้น',
};

const baseInput = {
  studyMaterialIds: [] as string[],
  pastedText: '',
  upload: null,
  pools: ['quiz'] as Array<'quiz' | 'exam'>,
  difficulty: 'medium' as const,
  focus: null,
};

describe('retrieval consumers', () => {
  const svc = adminClient();
  const store = new FakeVectorStore(loadChunksFromDb);
  let admin: TestUser;
  let asAdmin: Client;
  let recordId: string;
  let otherRecordId: string;
  let documentId: string;
  const batchIds: string[] = [];
  const questionIds: string[] = [];

  /** A ready document with typed chunk pages, straight into the tables (no worker needed). */
  async function seedIndexedDocument(record: string, name: string, texts: Record<number, string>) {
    const path = await uploadDbdDocument(
      asAdmin,
      record,
      new File([fixture], name, { type: 'application/pdf' }),
      name,
    );
    const doc = (await listDbdDocuments(svc, record)).find((d) => d.path === path)!;
    await svc.from('index_jobs').update({ status: 'done' }).eq('document_id', doc.id);
    await svc
      .from('dbd_documents')
      .update({ index_status: 'ready', indexed_pages: 3, document_type: 'certificate' })
      .eq('id', doc.id);
    const types: Record<number, string> = {
      1: 'certificate',
      2: 'objectives_sheet',
      3: 'shareholder_list',
    };
    const { error } = await svc.from('dbd_chunks').insert(
      Object.entries(texts).map(([page, text]) => ({
        id: `${doc.id}#${page}#0`,
        record_id: record,
        document_id: doc.id,
        document_type: types[Number(page)],
        page: Number(page),
        chunk_index: 0,
        chunk_text: text,
        char_count: text.length,
      })),
    );
    if (error) throw error;
    return doc.id;
  }

  beforeAll(async () => {
    admin = await createTestUser('admin');
    asAdmin = await clientFor(admin);
    const confirmed = {
      ...dbdRecordInputSchema.parse({}),
      company_name_th: 'บริษัท อ้างอิงแรก จำกัด',
      juristic_id: '0105569000777',
      registered_capital: 3000000,
      directors: [{ name_th: 'นายอ้างอิง ทดสอบ', name_en: null }],
    };
    recordId = (await createDbdRecord(asAdmin, confirmed, admin.id)).id;
    otherRecordId = (
      await createDbdRecord(
        asAdmin,
        { ...confirmed, company_name_th: 'บริษัท อีกแห่ง จำกัด', juristic_id: '0105569000778' },
        admin.id,
      )
    ).id;
    documentId = await seedIndexedDocument(recordId, 'reference.pdf', PAGES);
    await seedIndexedDocument(otherRecordId, 'other.pdf', {
      1: 'บริษัท อีกแห่ง จำกัด ทุนจดทะเบียน 9 บาท',
    });
    for (const id of [recordId, otherRecordId]) {
      await svc
        .from('dbd_records')
        .update({
          extraction_status: 'confirmed',
          confirmed_by: admin.id,
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', id);
    }
  });

  afterAll(async () => {
    await svc.from('questions').delete().in('id', questionIds);
    await svc.from('question_generation_batches').delete().in('id', batchIds);
    for (const id of [recordId, otherRecordId]) {
      const docs = await listDbdDocuments(svc, id);
      await svc.storage.from('dbd-documents').remove(docs.map((d) => d.path));
      await svc.from('dbd_records').delete().eq('id', id);
    }
    await deleteTestUser(admin.id);
  });

  it('retrieves labelled passages per concept group, deduplicated', async () => {
    const passages = await loadReferencePassages(svc, store, recordId);
    expect(passages.length).toBeGreaterThanOrEqual(3);
    expect(passages.length).toBeLessThanOrEqual(16);
    expect(new Set(passages.map((p) => p.id)).size).toBe(passages.length);
    const identity = passages.filter((p) => p.group === 'identity');
    expect(identity[0]).toMatchObject({ documentName: 'reference.pdf', documentId, page: 1 });
    // With only three chunks every group's query hits them all; dedupe keeps each under the
    // first group that retrieved it, so only the page set is asserted here.
    expect(passages.some((p) => p.page === 3)).toBe(true);
    expect(await loadReferencePassages(svc, null, recordId)).toEqual([]);
    expect(await loadReferencePassages(svc, store, otherRecordId)).not.toContainEqual(
      expect.objectContaining({ documentId }),
    );
  });

  it('stores which passages each generated question came from', async () => {
    const result = await generateQuestionsIntoBank(
      asAdmin,
      admin.id,
      { ...baseInput, referenceRecordId: recordId, count: 2, templateCount: 1 },
      new FakeQuestionGenerator(),
      store,
    );
    batchIds.push(result.batchId);
    questionIds.push(...result.questionIds);
    expect(result.produced).toBe(2);
    const first = await getQuestion(asAdmin, result.questionIds[0]);
    expect(first?.source_refs).toEqual([
      {
        document_id: documentId,
        document_name: 'reference.pdf',
        document_type: expect.any(String),
        page: expect.any(Number),
      },
    ]);
    const { data: batch } = await svc
      .from('question_generation_batches')
      .select('material_summary')
      .eq('id', result.batchId)
      .single();
    expect(batch?.material_summary).toMatch(/\d+ passages/);
  });

  it('works as before for a reference record without an index (empty refs)', async () => {
    const result = await generateQuestionsIntoBank(
      asAdmin,
      admin.id,
      { ...baseInput, referenceRecordId: recordId, count: 1, templateCount: 1 },
      new FakeQuestionGenerator(),
      null,
    );
    batchIds.push(result.batchId);
    questionIds.push(...result.questionIds);
    const q = await getQuestion(asAdmin, result.questionIds[0]);
    expect(q?.source_refs).toEqual([]);
  });

  it('still rejects a question that repeats a reference literal, passages or not', async () => {
    const leaking: QuestionGenerator = {
      name: 'leaking',
      model: null,
      async generate() {
        const fake = await new FakeQuestionGenerator().generate({
          reference: null,
          passages: [],
          material: { text: '', pdf: null },
          count: 1,
          templateCount: 0,
          difficulty: 'medium',
          focus: null,
        });
        const q: GeneratedQuestion = structuredClone(fake[0]);
        q.localizations.th.prompt = 'ทุนจดทะเบียนของ บริษัท อ้างอิงแรก จำกัด คือเท่าใด';
        return [q];
      },
      async translate() {
        return {};
      },
    };
    const result = await generateQuestionsIntoBank(
      asAdmin,
      admin.id,
      { ...baseInput, referenceRecordId: recordId, count: 1, templateCount: 0 },
      leaking,
      store,
    );
    batchIds.push(result.batchId);
    expect(result.produced).toBe(0);
    expect(result.rejected[0].reason).toMatch(/reference value/i);
  });

  it('attaches the reference PDF only when its first document is small enough', async () => {
    expect((await loadReference(asAdmin, recordId)).pdf).not.toBeNull();
    await svc.from('dbd_documents').update({ page_count: 25 }).eq('id', documentId);
    expect((await loadReference(asAdmin, recordId)).pdf).toBeNull();
    await svc.from('dbd_documents').update({ page_count: null }).eq('id', documentId);
    expect((await loadReference(asAdmin, recordId)).pdf).not.toBeNull(); // pre-P14 upload: unknown = small
    await svc.from('dbd_documents').update({ page_count: 3 }).eq('id', documentId);
  });

  it("returns at most three passages of the learner's own record for a card group", async () => {
    const evidence = await loadCardEvidence(svc, store, recordId, 'identity');
    expect(evidence.length).toBeGreaterThanOrEqual(1);
    expect(evidence.length).toBeLessThanOrEqual(3);
    expect(evidence[0]).toMatchObject({ document: 'reference.pdf', page: 1 });
    expect(evidence.every((e) => !e.text.includes('อีกแห่ง'))).toBe(true);
    expect(await loadCardEvidence(svc, null, recordId, 'identity')).toEqual([]);
  });
});

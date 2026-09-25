import { describe, expect, it } from 'vitest';
import { resolveSourceRefs, type ReferencePassage } from '@/lib/integrations/question-gen/passages';

const passage: ReferencePassage = {
  id: 'doc-1#3#0',
  documentId: 'doc-1',
  documentName: 'หนังสือรับรอง บริษัท ลับเฉพาะทีมเอ จำกัด.pdf',
  documentType: 'certificate',
  page: 3,
  text: 'ข้อความ',
  group: 'identity',
};

/**
 * Spec §4: content is communal while data is private. A question's stored sources are read by
 * every staff member, so they may say what kind of document and which page — never its name,
 * which is the company's.
 */
describe('resolveSourceRefs', () => {
  it('keeps the document id, type and page, and drops the name', () => {
    const [ref] = resolveSourceRefs([1], [passage]);
    expect(ref).toEqual({ document_id: 'doc-1', document_type: 'certificate', page: 3 });
    expect(ref).not.toHaveProperty('document_name');
  });
});

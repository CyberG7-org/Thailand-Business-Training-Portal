import { describe, expect, it } from 'vitest';
import {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_FILES,
  checkDocumentFiles,
} from '@/lib/domain/document-upload';

const pdf = (size = 1000) => ({ name: 'a.pdf', size, type: 'application/pdf' });

describe('checkDocumentFiles', () => {
  it('accepts up to six PDFs within the bucket limit and ignores empty entries', () => {
    expect(checkDocumentFiles([pdf(), pdf(MAX_DOCUMENT_BYTES)])).toBeNull();
    expect(checkDocumentFiles([pdf(), { name: '', size: 0, type: '' }])).toBeNull();
    expect(checkDocumentFiles(Array.from({ length: MAX_DOCUMENT_FILES }, () => pdf()))).toBeNull();
  });

  it('reports nothing to upload, and refuses non-PDFs, oversized files and too many files', () => {
    expect(checkDocumentFiles([])).toBe('no-file');
    expect(checkDocumentFiles([{ name: '', size: 0, type: '' }])).toBe('no-file');
    expect(checkDocumentFiles([{ name: 'x.png', size: 10, type: 'image/png' }])).toBe(
      'invalid-file',
    );
    expect(checkDocumentFiles([pdf(MAX_DOCUMENT_BYTES + 1)])).toBe('invalid-file');
    expect(checkDocumentFiles(Array.from({ length: MAX_DOCUMENT_FILES + 1 }, () => pdf()))).toBe(
      'invalid-file',
    );
  });
});

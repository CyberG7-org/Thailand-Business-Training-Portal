import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countPages, slicePdf } from '@/lib/pdf/slice';

const fixture = new Uint8Array(readFileSync('tests/fixtures/three-pages.pdf'));

describe('pdf slicing', () => {
  it('counts the pages of a PDF', async () => {
    expect(await countPages(fixture)).toBe(3);
  });

  it('copies a page range into a new PDF, clamped to the document', async () => {
    expect(await countPages(await slicePdf(fixture, { firstPage: 2, lastPage: 3 }))).toBe(2);
    expect(await countPages(await slicePdf(fixture, { firstPage: 3, lastPage: 9 }))).toBe(1);
  });

  it('refuses an encrypted PDF as unreadable (the model would only see ciphertext)', async () => {
    const encrypted = new Uint8Array(readFileSync('tests/fixtures/encrypted.pdf'));
    await expect(countPages(encrypted)).rejects.toThrow(/unreadable_pdf/);
  });

  it('rejects bytes that are not a PDF', async () => {
    await expect(countPages(new TextEncoder().encode('not a pdf'))).rejects.toThrow();
  });
});

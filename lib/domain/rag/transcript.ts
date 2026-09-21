/** A contiguous page range of one document, 1-based and inclusive. */
export type Slice = { firstPage: number; lastPage: number };
export type TranscribedPage = { page: number; text: string };

/** Pages per transcription call (decision D41): small enough for the function budget. */
export const DEFAULT_SLICE_PAGES = 5;

/** The next slice to read, or null when every page is done. */
export function planSlice(
  pageCount: number,
  nextPage: number,
  slicePages = DEFAULT_SLICE_PAGES,
): Slice | null {
  if (pageCount < 1 || nextPage > pageCount) return null;
  const firstPage = Math.max(1, nextPage);
  return { firstPage, lastPage: Math.min(pageCount, firstPage + slicePages - 1) };
}

export class MissingPagesError extends Error {
  constructor(public readonly missing: number[]) {
    super(`Transcript is missing page(s) ${missing.join(', ')}`);
    this.name = 'MissingPagesError';
  }
}

const MARKER = /^[ \t]*=== PAGE (\d+) ===[ \t]*$/gm;

export function formatPageMarkers(pages: TranscribedPage[]): string {
  return pages.map((p) => `=== PAGE ${p.page} ===\n${p.text}`).join('\n');
}

/**
 * Splits a transcript on `=== PAGE n ===` markers. Every page of the slice must be present
 * (a blank page is its marker followed by nothing); text before the first marker is ignored,
 * a duplicated marker keeps its first occurrence.
 */
export function parsePageMarkers(text: string, slice: Slice): TranscribedPage[] {
  const matches = [...text.matchAll(MARKER)];
  const found = new Map<number, string>();
  matches.forEach((m, i) => {
    const page = Number(m[1]);
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    if (page >= slice.firstPage && page <= slice.lastPage && !found.has(page)) {
      found.set(page, text.slice(start, end).trim());
    }
  });
  const missing: number[] = [];
  const pages: TranscribedPage[] = [];
  for (let page = slice.firstPage; page <= slice.lastPage; page++) {
    const body = found.get(page);
    if (body === undefined) missing.push(page);
    else pages.push({ page, text: body });
  }
  if (missing.length > 0) throw new MissingPagesError(missing);
  return pages;
}

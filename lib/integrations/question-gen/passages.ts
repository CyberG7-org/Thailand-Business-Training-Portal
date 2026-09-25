import type { ConceptGroup } from '@/lib/domain/bank-interview';

/** A retrieved chunk of the reference record, labelled with the concept group it answers. */
export type ReferencePassage = {
  id: string;
  group: ConceptGroup;
  documentId: string;
  documentName: string;
  documentType: string | null;
  page: number;
  text: string;
};

/**
 * Stored on `questions.source_refs` (decision D43). The name stays out: a question is shared with
 * every staff member, and a file name is the company's (spec §4 — content is communal, data is
 * private). The type and page say where a fact came from without saying whose.
 */
export type SourceRef = {
  document_id: string;
  document_type: string | null;
  page: number;
};

export const MAX_PASSAGE_CHARS = 1200;

/** Prompt block: `[n] (group) document, หน้า page` followed by the (capped) passage text. */
export function passagesBlock(passages: ReferencePassage[]): string {
  return passages
    .map(
      (p, i) =>
        `[${i + 1}] (${p.group}) ${p.documentName}, หน้า ${p.page}\n${p.text.slice(0, MAX_PASSAGE_CHARS)}`,
    )
    .join('\n\n');
}

/** Passage numbers the model cited → stored refs; unknown numbers dropped, duplicates collapsed. */
export function resolveSourceRefs(
  sources: number[] | undefined,
  passages: ReferencePassage[],
): SourceRef[] {
  const out: SourceRef[] = [];
  const seen = new Set<string>();
  for (const n of sources ?? []) {
    if (!Number.isInteger(n)) continue;
    const p = passages[n - 1];
    if (!p) continue;
    const key = `${p.documentId}#${p.page}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ document_id: p.documentId, document_type: p.documentType, page: p.page });
  }
  return out;
}

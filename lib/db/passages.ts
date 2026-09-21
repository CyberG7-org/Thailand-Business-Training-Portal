import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConceptGroup } from '@/lib/domain/bank-interview';
import { CONCEPT_GROUPS, conceptGroupQuery, conceptQueries } from '@/lib/domain/rag/concepts';
import type { ReferencePassage } from '@/lib/integrations/question-gen/passages';
import { VectorError, type Passage, type VectorStore } from '@/lib/integrations/vector/types';
import type { Database } from './database.types';
import { searchRecordPassages } from './dbd-index';

type Db = SupabaseClient<Database>;

/** Document names/types of a record, for labelling passages (admins or the service role). */
export async function documentNamesFor(
  db: Db,
  recordId: string,
): Promise<Map<string, { name: string; type: string | null }>> {
  const { data, error } = await db
    .from('dbd_documents')
    .select('id, original_name, document_type')
    .eq('record_id', recordId);
  if (error) throw error;
  return new Map((data ?? []).map((d) => [d.id, { name: d.original_name, type: d.document_type }]));
}

export async function hasReadyIndex(db: Db, recordId: string): Promise<boolean> {
  const { count, error } = await db
    .from('dbd_documents')
    .select('id', { head: true, count: 'exact' })
    .eq('record_id', recordId)
    .eq('index_status', 'ready');
  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * Runs the queries concurrently (one round trip of latency, not one per query). A store that is
 * up but failing yields no passages: every consumer then falls back to its pre-index behaviour
 * instead of failing the page or the batch.
 */
async function searchAll(
  vector: VectorStore,
  recordId: string,
  queries: string[],
  topK: number,
): Promise<Passage[][]> {
  try {
    return await Promise.all(
      queries.map(
        async (query) => (await searchRecordPassages(vector, recordId, query, { topK })) ?? [],
      ),
    );
  } catch (e) {
    if (e instanceof VectorError) {
      console.error('passages: vector store unavailable, falling back', e.message);
      return queries.map(() => []);
    }
    throw e;
  }
}

/**
 * Passages for a generation run (spec §8): one query per concept group built from the bank's
 * questions, top 4 per group, deduplicated by chunk id. Empty when the record has no index.
 */
export async function loadReferencePassages(
  db: Db,
  vector: VectorStore | null,
  recordId: string,
): Promise<ReferencePassage[]> {
  if (!vector || !(await hasReadyIndex(db, recordId))) return [];
  const names = await documentNamesFor(db, recordId);
  const perGroup = await searchAll(
    vector,
    recordId,
    CONCEPT_GROUPS.map((group) => conceptGroupQuery(group)),
    4,
  );
  const out: ReferencePassage[] = [];
  const seen = new Set<string>();
  CONCEPT_GROUPS.forEach((group, i) => {
    for (const hit of perGroup[i]) {
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      out.push(toReferencePassage(hit, group, names));
    }
  });
  return out;
}

export type Evidence = { document: string; page: number; text: string };

/**
 * "From your documents" for a study card (spec §8): one query per concept of the group, top 2
 * each, merged by score, best three. The caller passes the learner's own record id only.
 */
export async function loadCardEvidence(
  db: Db,
  vector: VectorStore | null,
  recordId: string,
  group: ConceptGroup,
): Promise<Evidence[]> {
  if (!vector || !(await hasReadyIndex(db, recordId))) return [];
  const names = await documentNamesFor(db, recordId);
  const best = new Map<string, Passage>();
  for (const hits of await searchAll(vector, recordId, conceptQueries(group), 2)) {
    for (const hit of hits) {
      const prev = best.get(hit.id);
      if (!prev || prev.score < hit.score) best.set(hit.id, hit);
    }
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.page - b.page)
    .slice(0, 3)
    .map((p) => ({ document: names.get(p.documentId)?.name ?? '', page: p.page, text: p.text }));
}

function toReferencePassage(
  hit: Passage,
  group: ConceptGroup,
  names: Map<string, { name: string; type: string | null }>,
): ReferencePassage {
  const doc = names.get(hit.documentId);
  return {
    id: hit.id,
    group,
    documentId: hit.documentId,
    documentName: doc?.name ?? hit.documentId,
    documentType: hit.documentType ?? doc?.type ?? null,
    page: hit.page,
    text: hit.text,
  };
}

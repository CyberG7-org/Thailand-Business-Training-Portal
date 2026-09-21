import type { Chunk } from '@/lib/domain/rag/chunk';
import { trigramOverlap } from '@/lib/domain/rag/score';
import type { Passage, SearchOptions, VectorStore } from './types';

export type ChunkLoader = (recordId: string, documentTypes?: string[]) => Promise<Chunk[]>;

/**
 * Dev/test store: the `dbd_chunks` rows are the index, ranked by trigram overlap. Deterministic,
 * so e2e and CI need no key. `index`/`remove` are no-ops because the rows are written by the worker.
 */
export class FakeVectorStore implements VectorStore {
  readonly name = 'fake';
  constructor(private readonly loadChunks: ChunkLoader) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async index(chunks: Chunk[]): Promise<void> {}
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async remove(ids: string[]): Promise<void> {}

  async search({ recordId, query, topK = 4, documentTypes }: SearchOptions): Promise<Passage[]> {
    const chunks = await this.loadChunks(recordId, documentTypes);
    return chunks
      .map((c) => ({
        id: c.id,
        documentId: c.documentId,
        documentType: c.documentType,
        page: c.page,
        text: c.text,
        score: trigramOverlap(query, c.text),
      }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score || a.page - b.page || a.id.localeCompare(b.id))
      .slice(0, topK);
  }
}

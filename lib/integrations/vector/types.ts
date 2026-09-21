import type { Chunk } from '@/lib/domain/rag/chunk';

export type VectorProvider = 'pinecone' | 'fake' | 'off';

export type Passage = {
  id: string;
  documentId: string;
  documentType: string | null;
  page: number;
  text: string;
  /** Higher is better; scales differ per provider (rerank score vs trigram overlap). */
  score: number;
};

export type SearchOptions = {
  recordId: string;
  query: string;
  /** Passages returned after reranking (default 4). */
  topK?: number;
  documentTypes?: string[];
};

export interface VectorStore {
  readonly name: 'pinecone' | 'fake';
  index(chunks: Chunk[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  search(options: SearchOptions): Promise<Passage[]>;
}

export class VectorError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_configured' | 'unavailable' | 'provider',
  ) {
    super(message);
    this.name = 'VectorError';
  }
}

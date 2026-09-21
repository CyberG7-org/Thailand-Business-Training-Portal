import 'server-only';
import { Errors, Pinecone, type Index } from '@pinecone-database/pinecone';
import type { Chunk } from '@/lib/domain/rag/chunk';
import { VectorError, type Passage, type SearchOptions, type VectorStore } from './types';

export const PINECONE_EMBED_MODEL = 'multilingual-e5-large';
export const PINECONE_RERANK_MODEL = 'bge-reranker-v2-m3';
export const PINECONE_TEXT_FIELD = 'chunk_text';
const UPSERT_BATCH = 96;
const DELETE_BATCH = 1000;

export type PineconeConfig = {
  apiKey: string;
  indexName: string;
  namespace: string;
  region: string;
};

export function pineconeConfig(
  env: Record<string, string | undefined> = process.env,
): PineconeConfig {
  if (!env.PINECONE_API_KEY) throw new VectorError('PINECONE_API_KEY is not set', 'not_configured');
  return {
    apiKey: env.PINECONE_API_KEY,
    indexName: env.PINECONE_INDEX || 'thai-portal-dbd',
    namespace: env.PINECONE_NAMESPACE || 'dev',
    region: env.PINECONE_REGION || 'us-east-1',
  };
}

/** Metadata stored next to each chunk; every field is filterable (decision D40). */
type ChunkMetadata = {
  chunk_text: string;
  record_id: string;
  document_id: string;
  document_type: string;
  page: number;
  chunk_index: number;
};

/** SDK failures → our three codes: retry later (unavailable), fix the key, or a real bug. */
export function toVectorError(error: unknown): VectorError {
  if (error instanceof Errors.PineconeAuthorizationError) {
    return new VectorError('Pinecone API key is missing or invalid', 'not_configured');
  }
  if (
    error instanceof Errors.PineconeConnectionError ||
    error instanceof Errors.PineconeUnavailableError ||
    error instanceof Errors.PineconeTimeoutError ||
    error instanceof Errors.PineconeMaxRetriesExceededError ||
    error instanceof Errors.PineconeInternalServerError
  ) {
    return new VectorError('Pinecone is unreachable', 'unavailable');
  }
  return new VectorError(error instanceof Error ? error.message : String(error), 'provider');
}

/**
 * Integrated-embedding index: Pinecone embeds `chunk_text` on upsert and reranks on search.
 * One namespace per environment; records are separated by the `record_id` filter.
 */
export class PineconeVectorStore implements VectorStore {
  readonly name = 'pinecone';
  private readonly target: Index<ChunkMetadata>;

  constructor(config: PineconeConfig = pineconeConfig()) {
    const client = new Pinecone({ apiKey: config.apiKey });
    this.target = client.index<ChunkMetadata>({
      name: config.indexName,
      namespace: config.namespace,
    });
  }

  async index(chunks: Chunk[]): Promise<void> {
    try {
      for (let i = 0; i < chunks.length; i += UPSERT_BATCH) {
        await this.target.upsertRecords({
          records: chunks.slice(i, i + UPSERT_BATCH).map((c) => ({
            _id: c.id,
            chunk_text: c.text,
            record_id: c.recordId,
            document_id: c.documentId,
            document_type: c.documentType ?? 'other',
            page: c.page,
            chunk_index: c.chunkIndex,
          })),
        });
      }
    } catch (error) {
      throw toVectorError(error);
    }
  }

  async remove(ids: string[]): Promise<void> {
    try {
      for (let i = 0; i < ids.length; i += DELETE_BATCH) {
        await this.target.deleteMany({ ids: ids.slice(i, i + DELETE_BATCH) });
      }
    } catch (error) {
      throw toVectorError(error);
    }
  }

  async search({ recordId, query, topK = 4, documentTypes }: SearchOptions): Promise<Passage[]> {
    const filter: Record<string, unknown> = { record_id: { $eq: recordId } };
    if (documentTypes && documentTypes.length > 0) filter.document_type = { $in: documentTypes };
    try {
      const response = await this.target.searchRecords({
        query: { topK: Math.max(12, topK * 3), inputs: { text: query }, filter },
        fields: ['chunk_text', 'document_id', 'document_type', 'page'],
        rerank: { model: PINECONE_RERANK_MODEL, rankFields: [PINECONE_TEXT_FIELD], topN: topK },
      });
      return response.result.hits.map((hit) => {
        const f = hit.fields as Partial<ChunkMetadata>;
        return {
          id: hit._id,
          documentId: f.document_id ?? '',
          documentType: f.document_type ?? null,
          page: f.page ?? 0,
          text: f.chunk_text ?? '',
          score: hit._score,
        };
      });
    } catch (error) {
      throw toVectorError(error);
    }
  }
}

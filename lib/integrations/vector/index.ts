import 'server-only';
import { FakeVectorStore } from './fake';
import { loadChunksFromDb } from './fake-loader';
import { PineconeVectorStore, pineconeConfig } from './pinecone';
import type { VectorProvider, VectorStore } from './types';

export type { Passage, SearchOptions, VectorStore } from './types';
export { VectorError } from './types';

/**
 * VECTOR_PROVIDER=pinecone|fake|off. Default: pinecone when PINECONE_API_KEY is set,
 * otherwise fake outside production and off in production (decision D40).
 */
export function resolveVectorProvider(
  env: Record<string, string | undefined> = process.env,
): VectorProvider {
  const configured = env.VECTOR_PROVIDER;
  if (configured === 'pinecone' || configured === 'fake' || configured === 'off') return configured;
  if (env.PINECONE_API_KEY) return 'pinecone';
  return env.NODE_ENV === 'production' ? 'off' : 'fake';
}

export function getVectorStore(
  env: Record<string, string | undefined> = process.env,
): VectorStore | null {
  switch (resolveVectorProvider(env)) {
    case 'pinecone':
      return new PineconeVectorStore(pineconeConfig(env));
    case 'fake':
      return new FakeVectorStore(loadChunksFromDb);
    case 'off':
      return null;
  }
}

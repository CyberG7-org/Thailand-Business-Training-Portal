/** Chunk sizing for Pinecone's multilingual-e5-large (≤ ~500 tokens) — decision D41. */
export const CHUNK_MAX_CHARS = 1000;
export const CHUNK_OVERLAP_CHARS = 100;

export type ChunkInput = {
  recordId: string;
  documentId: string;
  documentType: string | null;
  page: number;
  text: string;
};

export type Chunk = ChunkInput & { id: string; chunkIndex: number };

/** Deterministic id: re-indexing a page overwrites instead of duplicating. */
export function chunkId(documentId: string, page: number, chunkIndex: number): string {
  return `${documentId}#${page}#${chunkIndex}`;
}

/** Lines that begin a new item: "1.", "๒)", "(3)", "ข้อ 4". Table rows already sit one per line. */
const ITEM_START = /^\s*(?:\(?[0-9๐-๙]{1,3}[.)]|ข้อ\s*[0-9๐-๙]+)\s/;

/** Splits a page into pieces at blank lines and item starts, keeping line breaks inside a piece. */
function pieces(text: string): string[] {
  const out: string[] = [];
  let current = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if ((line === '' || ITEM_START.test(line)) && current.trim() !== '') {
      out.push(current.trim());
      current = '';
    }
    if (line !== '') current += (current ? '\n' : '') + line;
  }
  if (current.trim() !== '') out.push(current.trim());
  return out;
}

/** Cuts an oversized piece at the last space/newline before the limit, repeating with overlap. */
function hardSplit(piece: string): string[] {
  if (piece.length <= CHUNK_MAX_CHARS) return [piece];
  const out: string[] = [];
  let start = 0;
  while (start < piece.length) {
    let end = Math.min(piece.length, start + CHUNK_MAX_CHARS);
    if (end < piece.length) {
      const window = piece.slice(start, end);
      const boundary = Math.max(window.lastIndexOf(' '), window.lastIndexOf('\n'));
      if (boundary > CHUNK_MAX_CHARS / 2) end = start + boundary;
    }
    out.push(piece.slice(start, end).trim());
    if (end >= piece.length) break;
    start = Math.max(end - CHUNK_OVERLAP_CHARS, start + 1);
  }
  return out.filter((s) => s.length > 0);
}

/** Chunks of one page: pieces merged up to the limit, long pieces cut with overlap. */
export function chunkPage(input: ChunkInput): Chunk[] {
  const merged: string[] = [];
  for (const piece of pieces(input.text).flatMap(hardSplit)) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.length + 1 + piece.length <= CHUNK_MAX_CHARS) {
      merged[merged.length - 1] = `${last}\n${piece}`;
    } else {
      merged.push(piece);
    }
  }
  return merged.map((text, chunkIndex) => ({
    id: chunkId(input.documentId, input.page, chunkIndex),
    recordId: input.recordId,
    documentId: input.documentId,
    documentType: input.documentType,
    page: input.page,
    chunkIndex,
    text,
  }));
}

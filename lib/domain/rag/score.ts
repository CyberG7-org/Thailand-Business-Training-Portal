const STRIP = /[\s​.,;:()[\]"'“”‘’\-–—/|]/g;

/** Character trigrams of the normalised text (Thai has no word spaces, so characters it is). */
export function trigrams(text: string): Set<string> {
  const s = text.normalize('NFC').toLowerCase().replace(STRIP, '');
  const out = new Set<string>();
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3));
  return out;
}

/** Share of the query's trigrams present in the text, 0–1. Deterministic; the fake store's ranking. */
export function trigramOverlap(query: string, text: string): number {
  const q = trigrams(query);
  if (q.size === 0) return 0;
  const t = trigrams(text);
  let hits = 0;
  for (const g of q) if (t.has(g)) hits++;
  return hits / q.size;
}

/**
 * Ids per `.in()` filter. PostgREST takes the filter in the URL, and a list of every learner's
 * uuid grows it until the gateway answers "URI too long" (an admin with a few hundred learners
 * did); 100 uuids is about 3.7 KB.
 */
export const IN_FILTER_CHUNK = 100;

/** Runs `fetch` once per slice of `ids` and concatenates the rows, in order. */
export async function inChunks<T>(
  ids: readonly string[],
  fetch: (chunk: string[]) => Promise<T[]>,
  size = IN_FILTER_CHUNK,
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    rows.push(...(await fetch(ids.slice(i, i + size))));
  }
  return rows;
}

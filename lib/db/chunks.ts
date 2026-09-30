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

/** Rows per request: PostgREST returns at most `max_rows` (1000, supabase/config.toml) at once. */
export const PAGE_ROWS = 1000;

/**
 * Every row of a query, read a page at a time, so a long list is never cut off at `max_rows`
 * without a word. The query must be ordered on something unique, or pages may overlap.
 */
export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size = PAGE_ROWS,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
}

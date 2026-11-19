type QueryError = { message: string; code?: string };
type PageResult<Row> = { data: Row[] | null; error: QueryError | null };

// PostgREST caps each response (max_rows, 1000), so tables that grow by a row per animal
// or per check are read in pages. Each page is a sequential round trip on the Worker, so
// past the cap this returns an error instead of a slow load or silently truncated data.
export const PAGE_SIZE = 1000;
export const MAX_PAGES = 20;

export async function selectAll<Row>(
  page: (from: number, to: number) => PromiseLike<PageResult<Row>>,
  maxPages = MAX_PAGES,
): Promise<{ data: Row[]; error: null } | { data: null; error: QueryError }> {
  const rows: Row[] = [];
  for (let index = 0; index < maxPages; index += 1) {
    const from = index * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
  return {
    data: null,
    error: { message: `Query returned more than ${maxPages * PAGE_SIZE} rows; narrow its date range.` },
  };
}

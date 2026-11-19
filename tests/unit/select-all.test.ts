import assert from "node:assert/strict";
import test from "node:test";

import { PAGE_SIZE, selectAll } from "@/lib/supabase/select-all";

function pagesOf(total: number) {
  const calls: Array<[number, number]> = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    const count = Math.max(0, Math.min(to + 1, total) - from);
    return { data: Array.from({ length: count }, (_, i) => from + i), error: null };
  };
  return { calls, page };
}

test("selectAll reads pages until a short page", async () => {
  const { calls, page } = pagesOf(PAGE_SIZE + 5);
  const result = await selectAll(page);
  assert.equal(result.error, null);
  assert.equal(result.data?.length, PAGE_SIZE + 5);
  assert.deepEqual(calls, [[0, PAGE_SIZE - 1], [PAGE_SIZE, 2 * PAGE_SIZE - 1]]);
});

test("selectAll stops after an exactly full page is followed by an empty one", async () => {
  const { calls, page } = pagesOf(PAGE_SIZE);
  const result = await selectAll(page);
  assert.equal(result.data?.length, PAGE_SIZE);
  assert.equal(calls.length, 2);
});

test("selectAll returns the first query error and no rows", async () => {
  const error = { message: "permission denied", code: "42501" };
  const result = await selectAll(async () => ({ data: null, error }));
  assert.deepEqual(result, { data: null, error });
});

test("selectAll errors instead of truncating past the page cap", async () => {
  const { calls, page } = pagesOf(3 * PAGE_SIZE);
  const result = await selectAll(page, 2);
  assert.equal(result.data, null);
  assert.match(result.error?.message ?? "", /more than 2000 rows/);
  assert.equal(calls.length, 2);
});

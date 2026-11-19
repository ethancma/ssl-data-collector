import assert from "node:assert/strict";
import test from "node:test";

import {
  createQueryStats,
  formatQueryStats,
  instrumentFetch,
  recordQuery,
  supabaseQueryLabel,
} from "@/lib/supabase/query-stats";

test("supabaseQueryLabel keeps only the resource name", () => {
  const base = "https://abc.supabase.co";
  assert.equal(supabaseQueryLabel(`${base}/rest/v1/tanks?select=id&system_id=eq.4`), "rest/tanks");
  assert.equal(supabaseQueryLabel(`${base}/rest/v1/rpc/create_batch`), "rpc/create_batch");
  assert.equal(supabaseQueryLabel(new URL(`${base}/auth/v1/user`)), "auth/user");
  assert.equal(supabaseQueryLabel(new Request(`${base}/storage/v1/object/sign/photos/a.jpg`)), "storage");
  assert.equal(supabaseQueryLabel(`${base}/functions/v1/x`), "other");
  assert.equal(supabaseQueryLabel("not a url"), "other");
});

test("recordQuery counts, sums, flags errors, and tracks the slowest", () => {
  const stats = createQueryStats();
  recordQuery(stats, "rest/tanks", 12.4, false);
  recordQuery(stats, "rest/systems", 30.6, true);
  recordQuery(stats, "auth/user", 5, false);
  assert.deepEqual(stats, { queries: 3, errors: 1, supabaseMs: 48, slowest: { label: "rest/systems", ms: 31 } });
  assert.equal(formatQueryStats(stats), '{"evt":"supabase_queries","queries":3,"errors":1,"supabaseMs":48,"slowest":{"label":"rest/systems","ms":31}}');
});

test("instrumentFetch records successful, failed, and thrown requests", async (t) => {
  const responses = [new Response("[]", { status: 200 }), new Response("{}", { status: 401 })];
  t.mock.method(globalThis, "fetch", async () => {
    const next = responses.shift();
    if (!next) throw new TypeError("network down");
    return next;
  });
  let clock = 0;
  const stats = createQueryStats();
  const wrapped = instrumentFetch(stats, () => (clock += 10));

  assert.equal((await wrapped("https://x.supabase.co/rest/v1/tanks")).status, 200);
  assert.equal((await wrapped("https://x.supabase.co/auth/v1/user")).status, 401);
  await assert.rejects(wrapped("https://x.supabase.co/rest/v1/systems"), /network down/);
  assert.deepEqual(stats, { queries: 3, errors: 2, supabaseMs: 30, slowest: { label: "rest/tanks", ms: 10 } });
});

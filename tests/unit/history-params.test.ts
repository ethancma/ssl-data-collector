import assert from "node:assert/strict";
import test from "node:test";

import { parseHistoryParams } from "@/lib/history/params";
import { applyHistoryFilters, applyHistoryOrder, searchPattern } from "@/lib/history/query";

const TODAY = "2026-10-14";

test("defaults to the last 30 Pacific days, newest first, page 1", () => {
  const params = parseHistoryParams({}, TODAY, true);
  assert.deepEqual(params, {
    dataset: "all", range: "30", from: "2026-09-15", to: TODAY, system: null, recorder: null, source: null,
    q: "", outOfRange: false, sort: "occurred_at", dir: "desc", page: 1,
  });
});

test("range presets resolve to inclusive Pacific dates", () => {
  assert.equal(parseHistoryParams({ range: "7" }, TODAY, true).from, "2026-10-08");
  assert.equal(parseHistoryParams({ range: "90" }, TODAY, true).from, "2026-07-17");
  assert.equal(parseHistoryParams({ range: "365" }, TODAY, true).from, "2025-10-15");
});

test("custom ranges need two real dates, and reversed dates are swapped", () => {
  const custom = parseHistoryParams({ range: "custom", from: "2026-10-05", to: "2026-10-01" }, TODAY, true);
  assert.deepEqual([custom.range, custom.from, custom.to], ["custom", "2026-10-01", "2026-10-05"]);
  for (const bad of [{ from: "2026-02-30", to: "2026-10-01" }, { from: "2026-10-01" }, { from: "x", to: "y" }]) {
    const fallback = parseHistoryParams({ range: "custom", ...bad }, TODAY, true);
    assert.deepEqual([fallback.range, fallback.from, fallback.to], ["30", "2026-09-15", TODAY]);
  }
});

test("unknown values fall back to defaults and the first repeated value wins", () => {
  const params = parseHistoryParams(
    { dataset: "bogus", range: "zzz", sort: "drop table", dir: "up", system: "abc", recorder: "-4", source: "x", page: "-3" },
    TODAY,
    true,
  );
  assert.deepEqual([params.dataset, params.range, params.sort, params.dir, params.system, params.recorder, params.source, params.page], ["all", "30", "occurred_at", "desc", null, null, null, 1]);
  const repeated = parseHistoryParams({ dataset: ["feeding", "maintenance"], system: ["3", "4"], dir: ["asc", "desc"] }, TODAY, true);
  assert.deepEqual([repeated.dataset, repeated.system, repeated.dir], ["feeding", 3, "asc"]);
});

test("filters accept known datasets, sources, ids and a trimmed search of limited length", () => {
  const params = parseHistoryParams({ dataset: "water_quality", source: "paper_backfill", system: "3", recorder: "12", q: `  ${"a".repeat(150)}  `, page: "7" }, TODAY, true);
  assert.deepEqual([params.dataset, params.source, params.system, params.recorder, params.q.length, params.page], ["water_quality", "paper_backfill", 3, 12, 100, 7]);
});

test("star treatments are only accepted for roles that can read them", () => {
  assert.equal(parseHistoryParams({ dataset: "star_treatment" }, TODAY, true).dataset, "star_treatment");
  assert.equal(parseHistoryParams({ dataset: "star_treatment" }, TODAY, false).dataset, "all");
});

test("out of range implies the water quality dataset", () => {
  const params = parseHistoryParams({ oor: "1", dataset: "feeding" }, TODAY, true);
  assert.deepEqual([params.outOfRange, params.dataset], [true, "water_quality"]);
  assert.equal(parseHistoryParams({ oor: "yes" }, TODAY, true).outOfRange, false);
});

test("sorting is limited to the dataset's sortable columns", () => {
  assert.equal(parseHistoryParams({ dataset: "water_quality", sort: "ammonia" }, TODAY, true).sort, "ammonia");
  assert.equal(parseHistoryParams({ dataset: "feeding", sort: "ammonia" }, TODAY, true).sort, "occurred_at");
  assert.equal(parseHistoryParams({ sort: "recorded_by_name" }, TODAY, true).sort, "recorded_by_name");
  // Notes and data source are not sortable.
  assert.equal(parseHistoryParams({ dataset: "maintenance", sort: "notes" }, TODAY, true).sort, "occurred_at");
  assert.equal(parseHistoryParams({ sort: "data_source" }, TODAY, true).sort, "occurred_at");
});

test("search patterns are quoted and special characters match literally", () => {
  assert.equal(searchPattern("plain"), '"%plain%"');
  assert.equal(searchPattern("a,b (c)"), '"%a,b (c)%"');
  assert.equal(searchPattern("50%_"), '"%50\\\\%\\\\_%"');
  assert.equal(searchPattern('say "hi"'), '"%say \\"hi\\"%"');
  assert.equal(searchPattern("back\\slash"), '"%back\\\\\\\\slash%"');
  assert.equal(searchPattern("a*b"), '"%ab%"');
});

type Call = [string, ...unknown[]];

function recorder() {
  const calls: Call[] = [];
  const chain = new Proxy({}, {
    get: (_target, method: string) => (...args: unknown[]) => {
      calls.push([method, ...args]);
      return chain;
    },
  });
  return { chain, calls };
}

test("filters become Pacific day bounds and exact matches", () => {
  const { chain, calls } = recorder();
  const params = parseHistoryParams({ range: "custom", from: "2026-10-01", to: "2026-10-05", system: "3", recorder: "2", source: "import", q: "ph" }, TODAY, true);
  applyHistoryFilters(chain, params);
  assert.deepEqual(calls[0], ["gte", "occurred_at", "2026-10-01T07:00:00.000Z"]);
  assert.deepEqual(calls[1], ["lt", "occurred_at", "2026-10-06T07:00:00.000Z"]);
  assert.deepEqual(calls.slice(2, 5), [["eq", "system_id", 3], ["eq", "recorded_by", 2], ["eq", "data_source", "import"]]);
  assert.equal(calls[5][0], "or");
  assert.match(String(calls[5][1]), /^notes\.ilike\."%ph%",system_name\.ilike\."%ph%",tank_name\./);
});

test("out of range overlaps every water quality parameter", () => {
  const { chain, calls } = recorder();
  applyHistoryFilters(chain, parseHistoryParams({ oor: "1" }, TODAY, true));
  const overlap = calls.find((call) => call[0] === "overlaps");
  assert.deepEqual(overlap?.slice(0, 2), ["overlaps", "out_of_range"]);
  assert.deepEqual(overlap?.[2], ["ph", "magnesium", "ammonia", "alkalinity", "calcium", "phosphate", "salinity", "nitrate", "nitrite"]);
});

test("ordering ends with stable tie-breakers", () => {
  const { chain, calls } = recorder();
  applyHistoryOrder(chain, parseHistoryParams({ sort: "system_name", dir: "asc" }, TODAY, true));
  assert.deepEqual(calls.map((call) => [call[0], call[1], (call[2] as { ascending: boolean }).ascending]), [
    ["order", "system_name", true], ["order", "occurred_at", false], ["order", "dataset", true], ["order", "id", false],
  ]);
});

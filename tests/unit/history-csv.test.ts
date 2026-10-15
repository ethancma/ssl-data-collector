import assert from "node:assert/strict";
import test from "node:test";

import { buildCsv, csvCell } from "@/lib/history/csv";
import { DATASET_COLUMNS, columnsFor, type HistoryRow } from "@/lib/history/datasets";

const row = (overrides: Partial<HistoryRow> = {}): HistoryRow => ({
  dataset: "health_observation",
  id: 1,
  occurred_at: "2026-10-12T17:00:00Z",
  occurred_on: "2026-10-12",
  system_id: 3,
  system_name: "Graham",
  tank_id: 2,
  tank_name: "Lower-9L",
  animal_id: 1,
  animal_name: "SSL25",
  recorded_by: 2,
  recorded_by_name: "Test Technician",
  data_source: "live",
  entered_at: "2026-10-12T17:05:00Z",
  notes: null,
  ...overrides,
});

test("cells are always quoted and embedded quotes are doubled", () => {
  assert.equal(csvCell("plain"), '"plain"');
  assert.equal(csvCell('say "hi", then (leave)'), '"say ""hi"", then (leave)"');
  assert.equal(csvCell("two\nlines"), '"two\nlines"');
  assert.equal(csvCell(""), '""');
});

test("a leading formula character gets an apostrophe prefix", () => {
  for (const trigger of ["=SUM(A1)", "+1", "-1", "@cmd", "\tindented", "\rreturn"]) {
    assert.equal(csvCell(trigger), `"'${trigger}"`);
  }
  assert.equal(csvCell("a=b"), '"a=b"');
});

test("the CSV starts with a BOM and uses CRLF line breaks", () => {
  const csv = buildCsv(columnsFor("maintenance"), [row({ dataset: "maintenance", task_type: "sump_flush" })]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[0], '"Time","System","Task","Recorded by","Source","Notes"');
  assert.match(lines[1], /^"Oct 12, 2026, 10:00 AM","Graham","Sump flush","Test Technician","Live",""$/);
});

test("arrays are joined with semicolons using the issue labels", () => {
  const csv = buildCsv(DATASET_COLUMNS.health_observation, [row({ issues: ["lesion", "arm_drop"], severity: "high", has_photo: true, notes: "=oops" })]);
  const [, line] = csv.slice(1).split("\r\n");
  assert.match(line, /"High","Lesion; Arm drop","Yes","Test Technician","Live","'=oops"$/);
});

test("missing recorder names read Unknown and empty cells stay empty", () => {
  const csv = buildCsv(columnsFor("all"), [row({ recorded_by_name: null, tank_name: null, animal_name: null })]);
  const [header, line] = csv.slice(1).split("\r\n");
  assert.equal(header, '"Time","Dataset","System","Tank","Animal","Recorded by","Source"');
  assert.match(line, /"Graham","","","Unknown","Live"$/);
});

test("water quality exports one column per parameter and an empty header-only file has no rows", () => {
  const columns = columnsFor("water_quality");
  assert.deepEqual(columns.map((column) => column.label).slice(2, 12), [
    "pH source", "pH", "Magnesium (ppm)", "Ammonia (ppm)", "Alkalinity (dKH)", "Calcium (ppm)", "Phosphate (ppm)", "Salinity (ppt)", "Nitrate (ppm)", "Nitrite (ppb)",
  ]);
  assert.equal(buildCsv(columns, []).slice(1).split("\r\n").length, 1);
});

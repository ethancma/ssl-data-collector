import assert from "node:assert/strict";
import test from "node:test";

import {
  formatPacificDateTime,
  getPacificDateTimeParts,
  pacificWallTimeToIso,
} from "@/lib/pacific-date-time";

test("converts ordinary operational form values into an ISO payload timestamp", () => {
  const payload = {
    tested_at: pacificWallTimeToIso("2026-01-15", "12:00"),
  };

  assert.deepEqual(payload, {
    tested_at: "2026-01-15T20:00:00.000Z",
  });
});

test("rejects a nonexistent spring-forward wall time", () => {
  assert.throws(
    () => pacificWallTimeToIso("2026-03-08", "02:30"),
    /does not exist in Pacific time/,
  );
});

test("resolves a fall-back overlap to its earlier occurrence", () => {
  assert.equal(
    pacificWallTimeToIso("2026-11-01", "01:30"),
    "2026-11-01T08:30:00.000Z",
  );
});

test("formats operational timestamps and form defaults in Pacific time", () => {
  const instant = new Date("2026-01-15T20:00:00.000Z");

  assert.deepEqual(getPacificDateTimeParts(instant), {
    date: "2026-01-15",
    time: "12:00",
  });
  assert.equal(formatPacificDateTime(instant), "Jan 15, 2026, 12:00 PM");
});
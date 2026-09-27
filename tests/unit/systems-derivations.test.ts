import assert from "node:assert/strict";
import test from "node:test";

import { deriveSystemOverview } from "@/app/protected/systems/derivations";

test("deriveSystemOverview preserves the 36-hour overview semantics", () => {
  const overview = deriveSystemOverview(
    [
      { id: 1, slug: "graham", name: "Graham" },
      { id: 2, slug: "wholey", name: "Wholey" },
    ],
    [
      {
        system_id: 1,
        check_type: "PM",
        temperature: 9.1,
        checked_at: "2026-09-24T18:00:00.000Z",
      },
      {
        system_id: 1,
        check_type: "AM",
        temperature: 10.2,
        checked_at: "2026-09-26T16:00:00.000Z",
      },
      {
        system_id: 1,
        check_type: "PM",
        temperature: 10.8,
        checked_at: "2026-09-26T23:00:00.000Z",
      },
      {
        system_id: 2,
        check_type: "AM",
        temperature: null,
        checked_at: "2026-09-26T17:00:00.000Z",
      },
    ],
    "2026-09-25T12:00:00.000Z",
    "2026-09-26",
  );

  assert.deepEqual(overview, [
    {
      slug: "graham",
      name: "Graham",
      latestTemperature: 10.8,
      amDoneToday: true,
      pmDoneToday: true,
    },
    {
      slug: "wholey",
      name: "Wholey",
      latestTemperature: null,
      amDoneToday: true,
      pmDoneToday: false,
    },
  ]);
});
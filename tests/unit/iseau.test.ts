import assert from "node:assert/strict";
import test from "node:test";
import { STARS, isCurrent, lastHealth, lastTemperature, starData } from "@/components/iseau/mock-data";
import { compareIds, starsFor } from "@/components/iseau/use-iseau";

const star = (id: string) => STARS.find((candidate) => candidate.id === id)!;

test("compareIds drops unknown and duplicate ids, then pads from the sickest current stars", () => {
  assert.deepEqual(compareIds("moss,moss,nope,sol"), ["moss", "sol", "dune"]);
  assert.equal(compareIds(null).length, 3);
  assert.ok(compareIds(null).every((id) => isCurrent(star(id))));
});

test("current and past lists split on the 14-day rule and sort by severity", () => {
  assert.ok(starsFor("current", "all").every(isCurrent));
  assert.ok(starsFor("past", "all").every((candidate) => !isCurrent(candidate)));
  assert.equal(starsFor("current", "all")[0].id, "dune");
});

test("a past patient's window ends a day after its last observation", () => {
  const moss = star("moss");
  const { end } = starData(moss, 14);
  assert.equal(end - lastHealth(moss).at, 86_400_000);
  assert.ok(starData(moss, 14).health.length > 0);
});

test("a moved star reads temperature and water from the system it was in at that time", () => {
  const sol = star("sol");
  assert.equal(lastTemperature(sol).system, "Nursery");
  const systems = new Set(starData(sol, 30).water.map((reading) => reading.system));
  assert.deepEqual([...systems].sort(), ["Graham", "Nursery"]);
});

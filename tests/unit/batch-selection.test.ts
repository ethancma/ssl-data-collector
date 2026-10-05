import assert from "node:assert/strict";
import test from "node:test";

import {
  describeBatchError,
  eligibleAnimalsForScope,
  freezeSelectionForRefresh,
  runBatchSave,
  setAnimalsChecked,
  splitSelection,
  type BatchScopeAnimal,
  type BatchScopeTank,
  type BatchSelection,
} from "@/lib/daily-operations/batch-selection";

const tanks: BatchScopeTank[] = [
  { id: 10, name: "Middle", systemId: 1 },
  { id: 11, name: "Small", systemId: 1 },
  { id: 20, name: "Other system tank", systemId: 2 },
];
const animals: BatchScopeAnimal[] = [
  { id: 3, name: "Cohort A", tankId: 10, detail: "Cohort" },
  { id: 1, name: "Star 1", tankId: 10 },
  { id: 2, name: "Star 2", tankId: 11 },
  { id: 9, name: "Elsewhere", tankId: 20 },
];

const fresh = (scopeKey = "1::"): BatchSelection => ({
  scopeKey,
  checked: new Map(),
  newAnimalsChecked: true,
});

const ids = (list: BatchScopeAnimal[]) => list.map((animal) => animal.id);

test("eligibility narrows from system to tank to one animal", () => {
  assert.deepEqual(
    ids(eligibleAnimalsForScope({ systemId: null, tankId: null, animalId: null }, tanks, animals)),
    [],
  );
  assert.deepEqual(
    ids(eligibleAnimalsForScope({ systemId: 1, tankId: null, animalId: null }, tanks, animals)),
    [3, 1, 2],
  );
  assert.deepEqual(
    ids(eligibleAnimalsForScope({ systemId: 1, tankId: 10, animalId: null }, tanks, animals)),
    [3, 1],
  );
  assert.deepEqual(
    ids(eligibleAnimalsForScope({ systemId: 1, tankId: 10, animalId: 1 }, tanks, animals)),
    [1],
  );
});

test("an animal outside the selected tank is not eligible", () => {
  assert.deepEqual(
    ids(eligibleAnimalsForScope({ systemId: 1, tankId: 10, animalId: 2 }, tanks, animals)),
    [],
  );
});

test("a fresh selection includes everyone, sorted by id", () => {
  const eligible = eligibleAnimalsForScope(
    { systemId: 1, tankId: null, animalId: null },
    tanks,
    animals,
  );
  assert.deepEqual(splitSelection(eligible, fresh()), {
    includedIds: [1, 2, 3],
    excludedIds: [],
  });
});

test("unchecked animals move to the excluded list", () => {
  const eligible = eligibleAnimalsForScope(
    { systemId: 1, tankId: null, animalId: null },
    tanks,
    animals,
  );
  const selection = setAnimalsChecked(fresh(), [3, 2], false);
  assert.deepEqual(splitSelection(eligible, selection), {
    includedIds: [1],
    excludedIds: [2, 3],
  });
  assert.deepEqual(splitSelection(eligible, setAnimalsChecked(selection, [1], false)), {
    includedIds: [],
    excludedIds: [1, 2, 3],
  });
});

test("a stale refresh keeps exclusions and leaves newly listed animals unchecked", () => {
  const before = animals.filter((animal) => animal.tankId === 10);
  const selection = setAnimalsChecked(fresh("1:10:"), [3], false);
  const frozen = freezeSelectionForRefresh(selection, before);

  const after: BatchScopeAnimal[] = [...before, { id: 4, name: "New star", tankId: 10 }];
  assert.deepEqual(splitSelection(after, frozen), {
    includedIds: [1],
    excludedIds: [3, 4],
  });
  assert.equal(frozen.scopeKey, "1:10:");
});

test("a stale refresh ignores animals that left the scope", () => {
  const before = animals.filter((animal) => animal.tankId === 10);
  const frozen = freezeSelectionForRefresh(fresh("1:10:"), before);
  const after = before.filter((animal) => animal.id !== 1);
  assert.deepEqual(splitSelection(after, frozen), { includedIds: [3], excludedIds: [] });
});

test("batch error codes map to specific messages that say nothing was saved", () => {
  const stale = describeBatchError(
    { code: "SSL01", message: "STALE_PREVIEW: The animals in this scope changed." },
    "stars",
  );
  assert.equal(stale.kind, "stale");
  assert.match(stale.message, /Nothing was saved/);
  assert.match(stale.message, /newly listed stars are unchecked/);

  assert.equal(describeBatchError({ code: "SSL02", message: "x" }, "animals").kind, "conflict");
  assert.equal(
    describeBatchError({ code: "SSL03", message: "x" }, "animals").kind,
    "no-eligible",
  );

  const permission = describeBatchError(
    { code: "42501", message: "An active Admin, Technician, or Volunteer profile is required." },
    "animals",
  );
  assert.equal(permission.kind, "permission");
  assert.match(permission.message, /Nothing was saved/);
});

test("server validation details are kept and marked as not saved", () => {
  assert.deepEqual(
    describeBatchError({ code: "23514", message: "Amount must be positive." }, "animals"),
    { kind: "validation", message: "Amount must be positive. Nothing was saved." },
  );
  assert.deepEqual(describeBatchError({ code: "22023", message: "" }, "animals"), {
    kind: "bad-request",
    message: "The save request was invalid. Nothing was saved.",
  });
  const kindFor = (code: string) => describeBatchError({ code, message: "x" }, "animals").kind;
  assert.equal(kindFor("23503"), "missing-reference");
  assert.equal(kindFor("23502"), "missing-time");
  assert.equal(kindFor("PGRST301"), "other");
});

test("an error without a Postgres code is unconfirmed, not a server verdict", () => {
  for (const error of [{}, { code: "", message: "TypeError: Failed to fetch" }]) {
    const described = describeBatchError(error, "animals");
    assert.equal(described.kind, "unconfirmed");
    assert.doesNotMatch(described.message, /Nothing was saved/);
  }
});

test("runBatchSave reports success, server errors, and thrown network failures", async () => {
  const result = {
    request_id: "00000000-0000-4000-8000-000000000000",
    replayed: true,
    created_count: 1,
    excluded_animal_ids: [2],
    records: [{ id: 50, animal_id: 1, tank_id: 10 }],
  };
  assert.deepEqual(
    await runBatchSave(async () => ({ data: result, error: null }), "animals"),
    { ok: true, result },
  );

  const rejected = await runBatchSave(
    async () => ({ data: null, error: { code: "SSL01", message: "STALE_PREVIEW: changed" } }),
    "animals",
  );
  assert.equal(rejected.ok, false);
  assert.equal(!rejected.ok && rejected.error.kind, "stale");

  const thrown = await runBatchSave(async () => {
    throw new TypeError("Failed to fetch");
  }, "animals");
  assert.equal(!thrown.ok && thrown.error.kind, "unconfirmed");
});

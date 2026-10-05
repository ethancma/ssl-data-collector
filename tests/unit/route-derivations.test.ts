import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveDailyOperationsOptions,
  derivePendingFeedingLogs,
  deriveStarTreatmentScope,
  type DailyOperationsSourceData,
} from "@/app/protected/daily-operations/derivations";
import {
  deriveStarTreatmentCatalog,
  deriveStarTreatmentRecords,
  parseStarTreatmentFilters,
  type StarTreatmentRow,
} from "@/app/protected/star-treatments/derivations";

const source: DailyOperationsSourceData = {
  systems: [
    { id: 1, name: "Graham" },
    { id: 2, name: "Moss" },
  ],
  tanks: [
    { id: 10, name: "Graham 1", system_id: 1 },
    { id: 20, name: "Moss 1", system_id: 2 },
  ],
  animals: [
    { id: 100, name: "Sitara", tank_id: 10, species_id: 7, tracking_type: "individual" },
    { id: 101, name: "Larvae A", tank_id: 20, species_id: 8, tracking_type: "cohort" },
  ],
  waterQualityTargets: [
    { id: 1, system_id: 1, parameter_key: "ph", min_value: "7.9", max_value: null },
    { id: 2, system_id: 1, parameter_key: "not_a_parameter", min_value: 1, max_value: 2 },
  ],
  chemicalCatalog: [{ id: 3, name: "Mg", default_unit: "mL" }],
  foodCatalog: [{ id: 4, name: "Krill", default_unit: "pieces" }],
  starTreatmentCatalog: [
    { id: 5, name: "Probiotics", default_amount_unit: "mL", default_concentration_unit: "ppm" },
  ],
};

test("derives feeding scope from tanks that hold animals and marks cohorts", () => {
  const options = deriveDailyOperationsOptions(source);

  assert.deepEqual(options.feedingTanks.map((tank) => tank.id), [10, 20]);
  assert.deepEqual(options.feedingSystems.map((system) => system.id), [1, 2]);
  assert.deepEqual(
    options.feedingAnimals.map((animal) => animal.detail),
    [undefined, "Cohort"],
  );
});

test("drops unknown water-quality parameters and converts bounds to numbers", () => {
  const { waterQualityTargets } = deriveDailyOperationsOptions(source);

  assert.equal(waterQualityTargets.length, 1);
  assert.deepEqual(waterQualityTargets[0], {
    id: 1,
    systemId: 1,
    parameterKey: "ph",
    minValue: 7.9,
    maxValue: null,
  });
});

test("maps catalog rows to camelCase options", () => {
  const options = deriveDailyOperationsOptions(source);

  assert.deepEqual(options.chemicalCatalog, [{ id: 3, name: "Mg", defaultUnit: "mL" }]);
  assert.deepEqual(options.starTreatmentCatalog, [
    { id: 5, name: "Probiotics", defaultAmountUnit: "mL", defaultConcentrationUnit: "ppm" },
  ]);
});

test("limits Star treatment scope to individually tracked star animals", () => {
  const options = deriveDailyOperationsOptions(source);
  const scope = deriveStarTreatmentScope(
    options.systems,
    [
      { id: 10, name: "Graham 1", systemId: 1 },
      { id: 20, name: "Moss 1", systemId: 2 },
    ],
    source.animals,
    [{ id: 7, common_name: "Sunflower star" }],
  );

  assert.deepEqual(scope.stars, [
    { id: 100, name: "Sitara", tankId: 10, detail: "Sunflower star" },
  ]);
  assert.deepEqual(scope.starTanks.map((tank) => tank.id), [10]);
  assert.deepEqual(scope.starSystems.map((system) => system.id), [1]);
});

test("keeps only today's pending feedings and skips rows without a tank", () => {
  const todayKey = "2026-10-03";
  const logs = [
    { id: 1, fed_at: "2026-10-03T18:00:00Z", animals: { name: "Sitara" }, tanks: { system_id: 1 } },
    { id: 2, fed_at: "2026-10-01T18:00:00Z", animals: { name: "Old" }, tanks: { system_id: 1 } },
    { id: 3, fed_at: "2026-10-03T19:00:00Z", animals: null, tanks: { system_id: 2 } },
    { id: 4, fed_at: "2026-10-03T20:00:00Z", animals: { name: "Orphan" }, tanks: null },
  ];

  assert.deepEqual(derivePendingFeedingLogs(logs, todayKey), [
    { id: 1, animalName: "Sitara", systemId: 1 },
    { id: 3, animalName: "Unknown animal", systemId: 2 },
  ]);
});

test("defaults the treatment filters to the last 30 Pacific days", () => {
  const filters = parseStarTreatmentFilters({}, "2026-10-03");

  assert.equal(filters.to, "2026-10-03");
  assert.equal(filters.from, "2026-09-04");
  assert.equal(filters.animalId, undefined);
  assert.equal(filters.treatmentType, undefined);
  assert.ok(filters.fromIso < filters.toExclusiveIso);
});

test("ignores invalid dates and takes the first repeated query value", () => {
  const filters = parseStarTreatmentFilters(
    { from: "2026-02-31", to: ["2026-09-30", "2026-10-01"], animal: ["12", "13"] },
    "2026-10-03",
  );

  assert.equal(filters.from, "2026-09-04");
  assert.equal(filters.to, "2026-09-30");
  assert.equal(filters.animalId, 12);
});

test("accepts only known treatment types and numeric animal ids", () => {
  assert.equal(parseStarTreatmentFilters({ treatment: "probiotics" }, "2026-10-03").treatmentType, "probiotics");
  assert.equal(parseStarTreatmentFilters({ treatment: "other" }, "2026-10-03").treatmentType, "other");
  assert.equal(parseStarTreatmentFilters({ treatment: "bogus" }, "2026-10-03").treatmentType, undefined);
  assert.equal(parseStarTreatmentFilters({ animal: "abc" }, "2026-10-03").animalId, undefined);
  assert.equal(parseStarTreatmentFilters({ animal: "12abc" }, "2026-10-03").animalId, undefined);
});

test("sorts the treatment catalog by name and keeps the active flag", () => {
  const catalog = deriveStarTreatmentCatalog([
    { id: 2, name: "Reef Dip", default_amount_unit: null, default_concentration_unit: null, is_active: false },
    { id: 1, name: "Probiotics", default_amount_unit: "mL", default_concentration_unit: "ppm", is_active: true },
  ]);

  assert.deepEqual(catalog.map((item) => item.name), ["Probiotics", "Reef Dip"]);
  assert.equal(catalog[1].isActive, false);
});

test("maps treatment rows, flattening relations and stringifying numerics", () => {
  const row: StarTreatmentRow = {
    id: 9,
    animal_id: 100,
    tank_id: 10,
    catalog_id: null,
    treatment_type: "probiotics",
    amount: 2.5,
    unit: "mL",
    concentration: null,
    concentration_unit: null,
    notes: null,
    administered_at: "2026-10-03T18:00:00Z",
    recorded_by: 1,
    data_source: "live",
    entered_at: "2026-10-03T18:01:00Z",
    animal: [{ id: 100, name: "Sitara" }],
    tank: { id: 10, name: "Graham 1", system: [{ id: 1, name: "Graham" }] },
  };
  const [record, fallback] = deriveStarTreatmentRecords([
    row,
    { ...row, id: 10, animal: null, tank: null },
  ]);

  assert.equal(record.animalName, "Sitara");
  assert.equal(record.systemName, "Graham");
  assert.equal(record.amount, "2.5");
  assert.equal(record.concentration, null);
  assert.equal(fallback.animalName, "Star 100");
  assert.equal(fallback.tankName, "Tank 10");
  assert.equal(fallback.systemName, "Unknown system");
});

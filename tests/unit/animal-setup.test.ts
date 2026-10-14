import assert from "node:assert/strict";
import test from "node:test";

import { addPacificCalendarDays, getPacificDateString } from "@/lib/pacific-date-time";
import {
  animalSaveError,
  animalSchema,
  customLabelError,
  isSamePlacement,
  placementFromTank,
  retireSchema,
  toTankPlacement,
  type AnimalFormInput,
} from "@/lib/validation/animal-setup";

const today = getPacificDateString();

function validAnimal(): AnimalFormInput {
  return {
    name: "SSL25",
    speciesId: "1",
    trackingType: "individual",
    quantity: "1",
    systemId: "3",
    position: "lower",
    customLabel: "",
    sizeLiters: "9.6",
    lifeStage: "",
    dateAdded: today,
    notes: "",
  };
}

function issueFor(input: Partial<AnimalFormInput>, path: string) {
  const result = animalSchema.safeParse({ ...validAnimal(), ...input });
  assert.equal(result.success, false);
  return result.error?.issues.find((issue) => issue.path.join(".") === path)?.message;
}

test("a complete animal parses with a trimmed name", () => {
  const result = animalSchema.safeParse({ ...validAnimal(), name: "  SSL25 " });
  assert.equal(result.success, true);
  assert.equal(result.data?.name, "SSL25");
});

test("animal fields are required and bounded", () => {
  assert.equal(issueFor({ name: " " }, "name"), "Enter the animal's name");
  assert.equal(issueFor({ speciesId: "" }, "speciesId"), "Select a species");
  assert.equal(issueFor({ systemId: "" }, "systemId"), "Select a system");
  assert.equal(issueFor({ dateAdded: addPacificCalendarDays(today, 1) }, "dateAdded"), "Date can't be in the future");
});

test("individuals have a quantity of 1; cohorts take any whole number", () => {
  assert.equal(issueFor({ quantity: "3" }, "quantity"), "An individual has a quantity of 1");
  assert.equal(animalSchema.safeParse({ ...validAnimal(), trackingType: "cohort", quantity: "40" }).success, true);
  assert.equal(
    issueFor({ trackingType: "cohort", quantity: "2.5" }, "quantity"),
    "Enter a whole number of 1 or more",
  );
});

test("tank size must be a positive number with at most 3 decimals", () => {
  for (const sizeLiters of ["", "0", "-2", "abc", "1e3", "9.6789"]) {
    assert.equal(issueFor({ sizeLiters }, "sizeLiters"), "Enter the size in liters, e.g. 9.6", sizeLiters);
  }
});

test("a custom position may not read as a standard position or a size", () => {
  assert.equal(customLabelError(""), null);
  assert.equal(customLabelError("Middle"), null);
  assert.equal(customLabelError("Shelf 3"), null);
  assert.equal(customLabelError("lower shelf"), "Choose Lower from the list instead");
  assert.equal(customLabelError("Top-B"), "Leave out hyphens; the size is added for you");
  assert.equal(customLabelError("Big 20L"), "Leave out the size; enter it in Tank size");
  assert.equal(customLabelError("x".repeat(31)), "Keep the position under 30 characters");
  assert.equal(
    issueFor({ position: "other", customLabel: "Upper" }, "customLabel"),
    "Choose Upper from the list instead",
  );
});

test("the tank name is the shelf position and size, or the size alone", () => {
  const base = { systemId: "3", customLabel: "", sizeLiters: "9.6" };
  assert.deepEqual(toTankPlacement({ ...base, position: "lower" }), {
    name: "Lower-9.6L",
    shelfPosition: "lower",
    sizeLiters: 9.6,
  });
  assert.deepEqual(toTankPlacement({ ...base, position: "" }), {
    name: "9.6L",
    shelfPosition: null,
    sizeLiters: 9.6,
  });
  assert.equal(toTankPlacement({ ...base, position: "other", customLabel: "Middle" }).name, "Middle-9.6L");
  assert.equal(toTankPlacement({ ...base, position: "other", customLabel: " " }).name, "9.6L");
  assert.equal(toTankPlacement({ ...base, position: "other", customLabel: "mIDDLE" }).name, "Middle-9.6L");
  assert.equal(toTankPlacement({ ...base, position: "other", customLabel: " TOP shelf " }).name, "Top shelf-9.6L");
});

test("an untouched placement is recognized so saving does not move the animal", () => {
  const legacyTank = { systemId: 3, name: "Middle", shelfPosition: "lower" as const, sizeLiters: 9 };
  const prefill = placementFromTank(legacyTank);
  assert.equal(isSamePlacement({ ...prefill }, prefill), true);
  assert.equal(isSamePlacement({ ...prefill, sizeLiters: "9.0" }, prefill), true);
  assert.equal(isSamePlacement({ ...prefill, sizeLiters: "10" }, prefill), false);
  assert.equal(isSamePlacement({ ...prefill, position: "upper" }, prefill), false);
  assert.equal(isSamePlacement({ ...prefill, systemId: "4" }, prefill), false);
  const custom = placementFromTank({ ...legacyTank, name: "Middle-9L", shelfPosition: null });
  assert.equal(isSamePlacement({ ...custom, customLabel: "MIDDLE" }, custom), true);
});

test("placementFromTank prefills the fields from a tank", () => {
  const tank = { systemId: 3, shelfPosition: null, sizeLiters: null };
  assert.deepEqual(placementFromTank({ ...tank, name: "Lower-9.6L", shelfPosition: "lower", sizeLiters: 9.6 }), {
    systemId: "3",
    position: "lower",
    customLabel: "",
    sizeLiters: "9.6",
  });
  assert.deepEqual(placementFromTank({ ...tank, name: "Middle-9.6L" }), {
    systemId: "3",
    position: "other",
    customLabel: "Middle",
    sizeLiters: "9.6",
  });
  assert.deepEqual(placementFromTank({ ...tank, name: "200L" }), {
    systemId: "3",
    position: "",
    customLabel: "",
    sizeLiters: "200",
  });
  // Older free-form names fall back to the stored size.
  assert.deepEqual(placementFromTank({ ...tank, name: "Small", sizeLiters: 3 }), {
    systemId: "3",
    position: "other",
    customLabel: "Small",
    sizeLiters: "3",
  });
});

test("retiring requires a date between the date added and today", () => {
  const schema = retireSchema("2026-01-10");
  assert.equal(schema.safeParse({ status: "deceased", retiredOn: today, notes: "" }).success, true);
  const early = schema.safeParse({ status: "transferred", retiredOn: "2026-01-09", notes: "" });
  assert.equal(early.error?.issues[0]?.message, "Date can't be before the date added");
  const future = schema.safeParse({ status: "deceased", retiredOn: addPacificCalendarDays(today, 1), notes: "" });
  assert.equal(future.error?.issues[0]?.message, "Date can't be in the future");
});

test("a duplicate name explains that names are unique lab-wide", () => {
  assert.match(animalSaveError({ code: "23505", message: "duplicate key" }, "SSL25"), /SSL25 already exists/);
  assert.equal(animalSaveError({ code: "42501", message: "permission denied" }, "SSL25"), "permission denied");
});

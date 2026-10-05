import assert from "node:assert/strict";
import test from "node:test";

import { getPacificDateString } from "@/lib/pacific-date-time";
import {
  nullableNumber,
  optionalPositiveNumber,
  starTreatmentEditSchema,
  starTreatmentSchema,
} from "@/lib/validation/star-treatment";

function validFields() {
  return {
    catalogId: "",
    treatmentName: "Probiotics",
    amount: "1",
    unit: "mL",
    concentration: "",
    concentrationUnit: "",
    notes: "",
  };
}

type ParseResult = {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
};

function issueFor(result: ParseResult, path: string) {
  assert.equal(result.success, false);
  return result.error?.issues.find((issue) => issue.path.join(".") === path);
}

test("optional positive number accepts empty input and requires finite positive values", () => {
  assert.equal(optionalPositiveNumber.safeParse("").success, true);
  for (const value of ["0", "-1", "abc", "Infinity"]) {
    const result = optionalPositiveNumber.safeParse(value);
    assert.equal(result.success, false, value);
    assert.equal(issueFor(result, "")?.message, "Enter a positive number", value);
  }
  assert.equal(optionalPositiveNumber.safeParse("0.25").success, true);
});

test("nullableNumber preserves blank-as-null conversion", () => {
  assert.equal(nullableNumber(""), null);
  assert.equal(nullableNumber("  "), null);
  assert.equal(nullableNumber("2.5"), 2.5);
});

test("treatment name is required and limited to 100 characters", () => {
  const emptyName = starTreatmentEditSchema.safeParse({
    ...validFields(),
    treatmentName: "  ",
  });
  assert.equal(issueFor(emptyName, "treatmentName")?.message, "Enter the treatment name");

  const longName = starTreatmentEditSchema.safeParse({
    ...validFields(),
    treatmentName: "x".repeat(101),
  });
  assert.equal(
    issueFor(longName, "treatmentName")?.message,
    "Keep the treatment name under 100 characters",
  );
});

test("unit fields retain their 50-character limit", () => {
  const result = starTreatmentEditSchema.safeParse({
    ...validFields(),
    unit: "u".repeat(51),
  });
  assert.equal(issueFor(result, "unit")?.message, "Keep the unit under 50 characters");
});

test("measurement refinement reports the amount and unit field paths", () => {
  const missingMeasurements = starTreatmentEditSchema.safeParse({
    ...validFields(),
    treatmentName: "Other treatment",
    amount: "",
    concentration: "",
  });
  assert.equal(issueFor(missingMeasurements, "amount")?.message, "Enter an amount or concentration");

  const missingAmountUnit = starTreatmentEditSchema.safeParse({
    ...validFields(),
    unit: "",
  });
  assert.equal(issueFor(missingAmountUnit, "unit")?.message, "Enter an amount unit");

  const missingConcentrationUnit = starTreatmentEditSchema.safeParse({
    ...validFields(),
    concentration: "2",
    concentrationUnit: "",
  });
  assert.equal(
    issueFor(missingConcentrationUnit, "concentrationUnit")?.message,
    "Enter a concentration unit",
  );
});

test("empty optional measurements remain valid for Reef Dip", () => {
  const result = starTreatmentSchema.safeParse({
    date: getPacificDateString(),
    time: "09:30",
    ...validFields(),
    treatmentName: "Reef Dip",
    amount: "",
    concentration: "",
    unit: "",
    concentrationUnit: "",
  });
  assert.equal(result.success, true);
});

test("create schema requires today's date and an HH:mm time", () => {
  const badDate = starTreatmentSchema.safeParse({
    date: "1900-01-01",
    time: "09:30",
    ...validFields(),
  });
  assert.equal(issueFor(badDate, "date")?.message, "Date must be today in the lab");

  const badTime = starTreatmentSchema.safeParse({
    date: getPacificDateString(),
    time: "9:30",
    ...validFields(),
  });
  assert.equal(issueFor(badTime, "time")?.message, "Enter a valid time");
});

test("edit schema does not validate create-only date and time fields", () => {
  const result = starTreatmentEditSchema.safeParse({
    ...validFields(),
    date: "not-a-date",
    time: "not-a-time",
  });
  assert.equal(result.success, true);
});
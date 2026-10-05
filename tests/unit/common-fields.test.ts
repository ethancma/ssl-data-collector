import assert from "node:assert/strict";
import test from "node:test";

import { chemicalAdditionSchema } from "@/lib/validation/chemical-addition";
import { dateField, idField, timeField } from "@/lib/validation/common-fields";
import { dailyCheckSchema } from "@/lib/validation/daily-check";
import { feedingLogSchema } from "@/lib/validation/feeding-log";
import { healthObservationSchema } from "@/lib/validation/health-observation";
import { maintenanceLogSchema } from "@/lib/validation/maintenance-log";
import { waterQualitySchema } from "@/lib/validation/water-quality";

function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message;
}

test("dateField accepts real calendar dates including leap days", () => {
  for (const value of ["2026-01-31", "2026-04-30", "2024-02-29", "2000-02-29"]) {
    assert.equal(dateField.safeParse(value).success, true, value);
  }
});

test("dateField rejects dates that do not exist on the calendar", () => {
  for (const value of ["2026-02-31", "2026-04-31", "2025-02-29", "2100-02-29", "2026-13-01", "2026-00-10", "2026-01-00"]) {
    const result = dateField.safeParse(value);
    assert.equal(result.success, false, value);
    assert.equal(firstMessage(result), "Enter a valid date", value);
  }
});

test("dateField keeps its existing messages for empty and malformed input", () => {
  assert.equal(firstMessage(dateField.safeParse("")), "Select a date");
  assert.equal(firstMessage(dateField.safeParse("2026/01/15")), "Enter a date as YYYY-MM-DD");
  assert.equal(firstMessage(dateField.safeParse("26-1-5")), "Enter a date as YYYY-MM-DD");
});

test("timeField requires HH:mm and keeps its messages", () => {
  assert.equal(timeField.safeParse("09:05").success, true);
  assert.equal(firstMessage(timeField.safeParse("")), "Select a time");
  assert.equal(firstMessage(timeField.safeParse("9:05")), "Enter a time as HH:mm");
});

test("idField converts positive integer strings and rejects everything else", () => {
  const schema = idField("Select a system");
  assert.deepEqual(schema.parse("12"), 12);
  for (const value of ["", "0", "-3", "1.5", "abc"]) {
    const result = schema.safeParse(value);
    assert.equal(result.success, false, value);
    assert.equal(firstMessage(result), "Select a system", value);
  }
});

test("every operational form schema rejects a nonexistent date", () => {
  const badDate = "2026-02-31";
  const schemas = {
    chemicalAddition: chemicalAdditionSchema,
    dailyCheck: dailyCheckSchema,
    feedingLog: feedingLogSchema,
    healthObservation: healthObservationSchema,
    maintenanceLog: maintenanceLogSchema,
    waterQuality: waterQualitySchema,
  };

  for (const [name, schema] of Object.entries(schemas)) {
    const result = schema.safeParse({ date: badDate, time: "10:00" });
    assert.equal(result.success, false, name);
    const dateIssue = result.error?.issues.find((issue) => issue.path[0] === "date");
    assert.equal(dateIssue?.message, "Enter a valid date", name);
  }
});

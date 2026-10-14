/**
 * Feeding schedules: Settings > Feeding schedules (components/settings/feeding-schedule-manager.tsx,
 * app/protected/settings/feeding-schedules/), core.feeding_schedules RLS, and where the schedule shows
 * up (Home due-today item, Systems lineup and detail). Works on a throwaway system with two tanks so
 * real lab schedules are never touched. Tier 3 per docs/testing-strategy.md. Extend this file for
 * further feeding-schedule changes.
 */
import { test, expect } from "@playwright/test";
import {
  anonRoleClient,
  cleanupStep,
  dbQuery,
  login,
  loginAs,
  RUN_TAG,
  signInRoleClient,
  sqlLiteral,
  TECH_PASSWORD,
  todayDateString,
  VIEWER_EMAIL,
  VIEWER_PASSWORD,
  VOLUNTEER_EMAIL,
  VOLUNTEER_PASSWORD,
} from "./helpers";

const SYSTEM_NAME = `E2E Feeding ${RUN_TAG}`;
const SYSTEM_SLUG = `e2e-feeding-${RUN_TAG}`;
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ISO weekday (1 = Monday) of today in Pacific time, shifted by whole days.
function isoWeekdayOffset(days: number) {
  const [year, month, day] = todayDateString().split("-").map(Number);
  return ((new Date(Date.UTC(year, month - 1, day + days)).getUTCDay() + 6) % 7) + 1;
}

const TODAY = isoWeekdayOffset(0);
const TOMORROW = isoWeekdayOffset(1);
const YESTERDAY = isoWeekdayOffset(-1);

let systemId: number;

function scheduleRows() {
  return dbQuery(
    `select tank_position, size_liters, weekdays from core.feeding_schedules where system_id = ${systemId}
     order by tank_position nulls first, size_liters nulls first`,
  );
}

test.describe("feeding schedules", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");
  test.skip(!VOLUNTEER_PASSWORD, "E2E_TEST_VOLUNTEER_PASSWORD not set");
  test.skip(!VIEWER_PASSWORD, "E2E_TEST_VIEWER_PASSWORD not set");

  test.beforeAll(() => {
    systemId = Number(
      dbQuery(
        `insert into core.systems (slug, name, category) values (${sqlLiteral(SYSTEM_SLUG)}, ${sqlLiteral(SYSTEM_NAME)}, 'grow_out') returning id`,
      )[0].id,
    );
    dbQuery(
      `insert into core.tanks (system_id, name, tank_type, shelf_position)
       values (${systemId}, 'Lower-14.6L', 'shelf', 'lower'), (${systemId}, 'Lower-3L', 'shelf', 'lower'),
         (${systemId}, 'Upper-30L', 'shelf', 'upper')`,
    );
  });

  test.afterAll(async () => {
    await cleanupStep("delete feeding schedule fixtures", () =>
      dbQuery(`delete from core.systems where id = ${systemId}`),
    );
  });

  test("a technician saves a system schedule and overrides by tank position and size", async ({ page }) => {
    await login(page);
    await page.goto("/protected/settings/feeding-schedules");
    await expect(page.getByRole("heading", { name: "Feeding schedules", level: 1 })).toBeVisible();
    await page.getByLabel("System", { exact: true }).selectOption({ label: SYSTEM_NAME });

    await page.getByRole("form", { name: `${SYSTEM_NAME} schedule` }).getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Choose at least one weekday")).toBeVisible();

    const systemForm = page.getByRole("form", { name: `${SYSTEM_NAME} schedule` });
    await systemForm.getByLabel(WEEKDAY_NAMES[TODAY - 1], { exact: true }).check();
    await systemForm.getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("status")).toContainText(`${SYSTEM_NAME} schedule saved`);
    expect(scheduleRows()).toEqual([{ tank_position: null, size_liters: null, weekdays: [TODAY] }]);

    await expect(page.getByRole("form", { name: "Lower", exact: true })).toContainText("Follows the system schedule");
    // Short visible labels: M, Tu, W, Th, F, Sa, Su.
    await expect(systemForm.getByText("Tu", { exact: true })).toBeVisible();

    const upperForm = page.getByRole("form", { name: "Upper", exact: true });
    await upperForm.getByLabel(WEEKDAY_NAMES[TOMORROW - 1], { exact: true }).check();
    await upperForm.getByRole("button", { name: "Add override" }).click();
    await expect(page.getByRole("status")).toContainText("Upper override saved");

    // Lower has two sizes, so a size-specific override is offered.
    const lower3Form = page.getByRole("form", { name: "Lower 3L", exact: true });
    await lower3Form.getByLabel(WEEKDAY_NAMES[TOMORROW - 1], { exact: true }).check();
    await lower3Form.getByRole("button", { name: "Add override" }).click();
    await expect(page.getByRole("status")).toContainText("Lower 3L override saved");

    expect(scheduleRows()).toEqual([
      { tank_position: null, size_liters: null, weekdays: [TODAY] },
      { tank_position: "lower", size_liters: "3", weekdays: [TOMORROW] },
      { tank_position: "upper", size_liters: null, weekdays: [TOMORROW] },
    ]);
  });

  test("Home lists the tank groups still due today", async ({ page }) => {
    await login(page);
    await page.goto("/protected/home");
    const row = page.locator("div.p-4", { has: page.getByText(SYSTEM_NAME, { exact: true }) });
    await expect(row).toContainText("Feeding (Other tanks)");
  });

  test("the Systems lineup and detail show the next feeding", async ({ page }) => {
    await login(page);
    await page.goto("/protected/systems");
    const tile = page.locator(`a[href="?system=${SYSTEM_SLUG}"]`);
    await expect(tile).toContainText("Feeding due today");
    await expect(tile).not.toContainText("Feeding overdue");

    await page.goto(`/protected/systems?system=${SYSTEM_SLUG}`);
    await expect(page.getByText("Feeding due today")).toBeVisible();
  });

  test("a scheduled day that ended unfed shows Overdue and a worth-a-look status", async ({ page }) => {
    dbQuery(`delete from core.feeding_schedules where system_id = ${systemId}`);
    // Backdated so the schedule already covered yesterday.
    dbQuery(
      `insert into core.feeding_schedules (system_id, weekdays, created_at, updated_at)
       values (${systemId}, array[${YESTERDAY}]::smallint[], now() - interval '10 days', now() - interval '10 days')`,
    );

    await login(page);
    await page.goto("/protected/systems");
    const tile = page.locator(`a[href="?system=${SYSTEM_SLUG}"]`);
    await expect(tile).toContainText("Feeding overdue");

    await page.goto(`/protected/systems?system=${SYSTEM_SLUG}`);
    await expect(page.getByText("Feeding was missed yesterday")).toBeVisible();
  });

  test("a feeding or an unscheduled day clears Overdue", async ({ page }) => {
    dbQuery(`update core.feeding_schedules set weekdays = array[${TODAY}]::smallint[] where system_id = ${systemId}`);
    await login(page);
    await page.goto("/protected/systems");
    await expect(page.locator(`a[href="?system=${SYSTEM_SLUG}"]`)).not.toContainText("Feeding overdue");
  });

  test("Volunteer and Viewer read schedules but cannot change them", async ({ page }) => {
    await loginAs(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
    await page.goto("/protected/settings/feeding-schedules");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();

    for (const [email, password] of [
      [VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD],
      [VIEWER_EMAIL, VIEWER_PASSWORD],
    ] as const) {
      const client = await signInRoleClient(email, password);
      const { data, error } = await client.from("feeding_schedules").select("id").eq("system_id", systemId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);

      const { error: insertError } = await client
        .from("feeding_schedules")
        .insert({ system_id: systemId, tank_position: "left", weekdays: [1] });
      expect(insertError).not.toBeNull();
      const { data: updated } = await client
        .from("feeding_schedules")
        .update({ weekdays: [1] })
        .eq("system_id", systemId)
        .select("id");
      expect(updated ?? []).toHaveLength(0);
    }

    const { data: anonymous, error: anonymousError } = await anonRoleClient()
      .from("feeding_schedules")
      .select("id")
      .eq("system_id", systemId);
    expect(anonymousError !== null || (anonymous ?? []).length === 0).toBe(true);
  });

  test("the database rejects empty, duplicate and out-of-range weekdays, bad positions and sizes", async () => {
    for (const weekdays of ["array[]::smallint[]", "array[1,1]::smallint[]", "array[0]::smallint[]", "array[8]::smallint[]"]) {
      expect(() =>
        dbQuery(`insert into core.feeding_schedules (system_id, tank_position, weekdays) values (${systemId}, 'left', ${weekdays})`),
      ).toThrow();
    }
    for (const [position, size] of [["'middle'", "null"], ["'left'", "0"], ["null", "-5"]]) {
      expect(() =>
        dbQuery(
          `insert into core.feeding_schedules (system_id, tank_position, size_liters, weekdays) values (${systemId}, ${position}, ${size}, array[1]::smallint[])`,
        ),
      ).toThrow();
    }
    // One row per system and scope, including the system row (both NULL).
    expect(() =>
      dbQuery(`insert into core.feeding_schedules (system_id, weekdays) values (${systemId}, array[1]::smallint[])`),
    ).toThrow();
  });
});

/**
 * History page (app/protected/history, components/history/, lib/history/ and the
 * core.v_history_* / core.v_profile_names views). Covers filter, sort, and paging; the
 * out-of-range filter; CSV export (row count equals the on-screen total, BOM, formula
 * prefix); Star treatments hidden from viewers; and a volunteer seeing another user's
 * recorder name. Rows are seeded through SQL and tagged with RUN_TAG notes so every
 * assertion targets exactly this run's data. Tier 3 (reads views over RLS-protected tables).
 */
import { expect, test, type Page } from "@playwright/test";
import {
  anonRoleClient,
  cleanupStep,
  dbQuery,
  gotoHydrated,
  loginAs,
  RUN_TAG,
  signInRoleClient,
  sqlLiteral,
  TECH_EMAIL,
  TECH_PASSWORD,
  VIEWER_EMAIL,
  VIEWER_PASSWORD,
  VOLUNTEER_EMAIL,
  VOLUNTEER_PASSWORD,
} from "./helpers";

const TAG = `${RUN_TAG}-history`;
const CHECK_COUNT = 60;
const FORMULA_NOTE = `=${TAG} formula`;
const NOTE_SEARCH = `?q=${encodeURIComponent(TAG)}&range=90`;

let systemName = "";
let createdTargetId: number | null = null;
let technicianName = "";

function showingText(page: Page) {
  return page.getByText(/^Showing /).first();
}

async function totalOnScreen(page: Page) {
  const text = (await showingText(page).textContent()) ?? "";
  return Number(text.match(/of ([\d,]+)/)?.[1].replaceAll(",", ""));
}

test.beforeAll(() => {
  const [system] = dbQuery("select id, name from core.systems order by id limit 1");
  const [animal] = dbQuery("select id, tank_id from core.animals order by id limit 1");
  const [technician] = dbQuery(`select id, display_name from core.profiles where email = ${sqlLiteral(TECH_EMAIL)}`);
  const [volunteer] = dbQuery(`select id from core.profiles where email = ${sqlLiteral(VOLUNTEER_EMAIL)}`);
  systemName = String(system.name);
  technicianName = String(technician.display_name);

  // Technician-recorded rows: 60 AM checks (distinct temperatures for sorting), one formula note.
  dbQuery(`
    insert into core.daily_checks (system_id, check_type, water_running, temperature, checked_at, recorded_by, notes)
    select ${system.id}, 'AM', true, 10 + g / 10.0, now() - (g || ' hours')::interval, ${technician.id},
      case when g = 1 then ${sqlLiteral(FORMULA_NOTE)} else ${sqlLiteral(TAG + " check ")} || g end
    from generate_series(1, ${CHECK_COUNT}) g`);
  // One out-of-range ammonia reading (recorded by the volunteer) and one within range.
  dbQuery(`
    insert into core.water_quality_readings (system_id, tested_at, recorded_by, ph, ammonia, notes) values
      (${system.id}, now() - interval '3 hours', ${volunteer.id}, 8.1, 9999, ${sqlLiteral(TAG + " ammonia high")}),
      (${system.id}, now() - interval '4 hours', ${volunteer.id}, 8.1, 0, ${sqlLiteral(TAG + " ammonia fine")})`);
  const inserted = dbQuery(`
    insert into core.water_quality_target_ranges (system_id, parameter_key, max_value)
    values (${system.id}, 'ammonia', 1000) on conflict do nothing returning id`);
  createdTargetId = inserted.length ? Number(inserted[0].id) : null;
  dbQuery(`
    insert into core.star_treatments (animal_id, tank_id, treatment_type, amount, unit, administered_at, recorded_by, notes)
    values (${animal.id}, ${animal.tank_id}, 'Probiotic', 5, 'mL', now() - interval '2 hours', ${technician.id}, ${sqlLiteral(TAG + " star")})`);
});

test.afterAll(async () => {
  await cleanupStep("delete history fixtures", () => {
    dbQuery(`delete from core.star_treatments where notes like ${sqlLiteral(TAG + "%")}`);
    dbQuery(`delete from core.water_quality_readings where notes like ${sqlLiteral(TAG + "%")}`);
    dbQuery(`delete from core.daily_checks where notes like ${sqlLiteral(TAG + "%")} or notes = ${sqlLiteral(FORMULA_NOTE)}`);
    if (createdTargetId !== null) dbQuery(`delete from core.water_quality_target_ranges where id = ${createdTargetId}`);
  });
});

test.describe("History page as a technician", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, TECH_EMAIL, TECH_PASSWORD);
  });

  test("filters, sorts, and pages", async ({ page }) => {
    await gotoHydrated(page, `/protected/history?dataset=daily_check&q=${encodeURIComponent(TAG)}&range=90`);
    await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible();
    await expect(showingText(page)).toHaveText(new RegExp(`Showing 1–50 of ${CHECK_COUNT}`));
    await expect(page.locator("tbody tr")).toHaveCount(50);

    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(showingText(page)).toHaveText(new RegExp(`Showing 51–${CHECK_COUNT} of ${CHECK_COUNT}`));
    await expect(page.locator("tbody tr")).toHaveCount(CHECK_COUNT - 50);
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect(showingText(page)).toHaveText(/Showing 1–50/);

    // The lowest temperature is 10.1 (g = 1); ascending puts it first and sets aria-sort.
    await page.getByRole("button", { name: "Temperature (°C)" }).click();
    await expect(page).toHaveURL(/sort=temperature&dir=asc/);
    const header = page.getByRole("columnheader", { name: "Temperature (°C)" });
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    await expect(page.locator("tbody tr").first()).toContainText("10.1");

    await page.getByRole("combobox", { name: "System" }).click();
    await page.getByRole("option", { name: systemName, exact: true }).click();
    await expect(page.getByRole("list", { name: "Active filters" }).getByText(systemName)).toBeVisible();
    await expect(page).toHaveURL(/system=\d+/);
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(page).not.toHaveURL(/system=/);
    await expect(page.getByRole("list", { name: "Active filters" })).toBeHidden();

    const search = page.getByRole("searchbox");
    await search.fill(`${TAG} check 7`);
    await search.press("Enter");
    await expect(page).toHaveURL(/check(\+|%20)7/);
    await expect(showingText(page)).toHaveText(/of 1\b/);
  });

  test("the out-of-range filter keeps only flagged water tests", async ({ page }) => {
    await gotoHydrated(page, `/protected/history${NOTE_SEARCH}&oor=1`);
    await expect(page.getByRole("combobox", { name: "Dataset" })).toHaveValue("Water quality");
    await expect(page.getByText("1 water test out of range.")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody td", { hasText: "(outside target)" })).toHaveCount(1);
  });

  test("CSV export has every matching row, a BOM, and formula-safe cells", async ({ page }) => {
    await gotoHydrated(page, `/protected/history?dataset=daily_check&q=${encodeURIComponent(TAG)}&range=90`);
    const total = await totalOnScreen(page);
    expect(total).toBe(CHECK_COUNT);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /^Export / }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^history-daily_check-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/);
    let text = "";
    for await (const chunk of await download.createReadStream()) text += chunk.toString("utf8");

    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).split("\r\n");
    expect(lines[0]).toBe('"Time","System","Check","Water running","Temperature (°C)","Recorded by","Source","Notes"');
    expect(lines.length - 1).toBe(total);
    expect(lines.some((line) => line.endsWith(`"'${FORMULA_NOTE}"`))).toBe(true);
    expect(lines.slice(1).every((line) => line.includes(`"${technicianName}"`))).toBe(true);
  });

  test("the API views are readable but not writable", async () => {
    const technician = await signInRoleClient(TECH_EMAIL, TECH_PASSWORD);
    const events = await technician.from("v_history_events").select("id").limit(1);
    expect(events.error).toBeNull();
    const update = await technician.from("v_profile_names").update({ display_name: "hacked" }).eq("id", 1);
    expect(update.error).not.toBeNull();
    const [{ name }] = dbQuery(`select display_name as name from core.profiles where email = ${sqlLiteral(TECH_EMAIL)}`);
    expect(name).toBe(technicianName);
  });
});

test.describe("History page for other roles", () => {
  test.describe.configure({ mode: "serial" });

  test("a viewer sees no star treatments", async ({ page }) => {
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD);
    await gotoHydrated(page, `/protected/history?dataset=star_treatment&q=${encodeURIComponent(TAG)}&range=90`);
    // The star dataset is ignored for viewers, so the page falls back to every other dataset.
    const dataset = page.getByRole("combobox", { name: "Dataset" });
    await expect(dataset).toHaveValue("All datasets");
    await dataset.click();
    await expect(page.getByRole("option", { name: "Water quality" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Star treatments" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator("tbody td", { hasText: "Star treatments" })).toHaveCount(0);
    await expect(page.locator("tbody tr").first()).toBeVisible();

    const viewer = await signInRoleClient(VIEWER_EMAIL, VIEWER_PASSWORD);
    const stars = await viewer.from("v_history_star_treatments").select("id").limit(1);
    expect(stars.error?.message).toMatch(/permission denied/i);
    const events = await viewer.from("v_history_events").select("id").limit(1);
    expect(events.error).toBeNull();
    const anon = await anonRoleClient().from("v_history_events").select("id").limit(1);
    expect(anon.error).not.toBeNull();
  });

  test("a volunteer sees who recorded other people's entries", async ({ page }) => {
    await loginAs(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
    await gotoHydrated(page, `/protected/history?dataset=daily_check&q=${encodeURIComponent(TAG)}&range=90`);
    await expect(page.locator("tbody tr").first()).toContainText(technicianName);
    await expect(page.locator("tbody td", { hasText: "Unknown" })).toHaveCount(0);

    // Star treatments are visible to volunteers, and the technician's name is on them.
    await gotoHydrated(page, `/protected/history?dataset=star_treatment&q=${encodeURIComponent(TAG)}&range=90`);
    await expect(page.getByRole("combobox", { name: "Dataset" })).toHaveValue("Star treatments");
    await expect(page.locator("tbody tr").first()).toContainText(technicianName);
  });
});

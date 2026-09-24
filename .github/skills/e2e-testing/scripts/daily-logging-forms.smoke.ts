/**
 * Daily-logging forms: the 6 core forms a lab tech uses every day.
 * AM/PM check, feeding + consumption follow-up, water quality, chemical addition,
 * health observation (with/without photo), maintenance (incl. backdated date),
 * the Today dashboard, and each form's date/time-box defaults + picked-time handling.
 * Extend this file when changing one of those forms; see ../SKILL.md for the full
 * procedure and ../references/test-accounts.md for which accounts to use.
 */
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  db,
  dbQuery,
  login,
  TECH_PASSWORD,
  RUN_TAG,
  todayDateString,
  daysAgoDateString,
  localDateOf,
  localTimeOf,
  PICKED_TIME,
  expectDefaultDateAndTime,
} from "./helpers";

test.describe("e2e smoke", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");

  let grahamSystemId: number;
  let ssl25AnimalId: number;

  test.beforeAll(async () => {
    // Must use dbQuery (not db.from) here — schema `core` 403s "permission denied for
    // schema core" against the service-role client, see the gotcha in ../SKILL.md.
    const systemRows = dbQuery(`select id from core.systems where name = 'Graham'`);
    grahamSystemId = Number(systemRows[0]?.id);
    const animalRows = dbQuery(`select id from core.animals where name = 'SSL25'`);
    ssl25AnimalId = Number(animalRows[0]?.id);
  });

  test("technician can sign in", async ({ page }) => {
    await login(page);
  });

  test("daily-operation tabs render centrally and clear stale check state", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    const errorResponses: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => failedRequests.push(request.url()));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        errorResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await login(page);
    await page.goto("/protected/daily-operations?type=daily-check&check=PM");
    await expect(page.locator("form")).toBeVisible();

    const tabs = [
      ["Feeding", "feeding"],
      ["Water quality", "water-quality"],
      ["System chemical addition", "chemical-addition"],
      ["Star treatment", "star-treatment"],
      ["Health observation", "health-observation"],
      ["Maintenance", "maintenance-log"],
      ["Daily check", "daily-check"],
    ] as const;

    for (const [name, type] of tabs) {
      await page.getByRole("link", { name, exact: true }).click();
      await expect(page).toHaveURL(
        `http://localhost:3000/protected/daily-operations?type=${type}`,
      );
      await expect(page.locator("form")).toBeVisible();
    }

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
    expect(errorResponses).toEqual([]);
  });

  test("AM check for Graham lands in daily_checks", async ({ page }) => {
    await login(page);
    await page.goto(
      `/protected/daily-operations?type=daily-check&system=${grahamSystemId}&check=AM`,
    );
    await page.getByLabel("Notes").fill(`${RUN_TAG} AM check`);
    await page.getByLabel("Temperature (°C)").fill("12.5");
    await page.getByRole("button", { name: "Save check" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const rows = dbQuery(`
      select system_id, check_type, water_running, temperature, checked_at
      from core.daily_checks
      where notes = '${RUN_TAG} AM check'
    `);
    expect(rows).toHaveLength(1);
    const check = rows[0];
    expect(Number(check.system_id)).toBe(grahamSystemId);
    expect(check.check_type).toBe("AM");
    expect(check.water_running).toBe(true);
    expect(Number(check.temperature)).toBe(12.5);
    expect(localDateOf(String(check.checked_at))).toBe(todayDateString());
  });

  test("feeding log for SSL25 lands in feeding_logs", async ({ page }) => {
    await login(page);
    await page.goto("/protected/daily-operations?type=feeding");
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Krill" }).click();
    await page.getByLabel("Amount").fill("2 krill");
    await page.getByLabel("Notes").fill(`${RUN_TAG} feeding`);
    await page.getByRole("button", { name: "Save feeding" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const rows = dbQuery(`
      select id, animal_id, food_type, amount, consumption_status, fed_at
      from core.feeding_logs
      where notes = '${RUN_TAG} feeding'
    `);
    expect(rows).toHaveLength(1);
    const feeding = rows[0];
    expect(Number(feeding.animal_id)).toBe(ssl25AnimalId);
    expect(feeding.food_type).toBe("krill");
    expect(feeding.amount).toBe("2 krill");
    expect(feeding.consumption_status).toBeNull();
    expect(localDateOf(String(feeding.fed_at))).toBe(todayDateString());
  });

  test("PM check consumption follow-up updates the same feeding_logs row", async ({
    page,
  }) => {
    await login(page);
    await page.goto(
      `/protected/daily-operations?type=daily-check&system=${grahamSystemId}&check=PM`,
    );
    await expect(page.getByLabel("System", { exact: true })).toHaveValue(
      String(grahamSystemId),
    );
    await expect(page.getByText("Consumption follow-up")).toBeVisible();
    await expect(
      page.getByText("SSL25", { exact: true }).first().locator(".."),
    ).toBeVisible();

    await page.goto("/protected/daily-operations?type=daily-check&check=PM");
    await expect(page.getByLabel("System", { exact: true })).toHaveValue("");
    await page
      .getByLabel("System", { exact: true })
      .selectOption(String(grahamSystemId));
    await expect(page.getByText("Consumption follow-up")).toBeVisible();
    const newestSsl25PendingFeeding = page
      .getByText("SSL25", { exact: true })
      .first()
      .locator("..");
    await expect(newestSsl25PendingFeeding).toBeVisible();

    const feedingBefore = dbQuery(`
      select id
      from core.feeding_logs
      where notes = '${RUN_TAG} feeding'
    `);
    expect(feedingBefore).toHaveLength(1);
    await newestSsl25PendingFeeding
      .getByRole("button", { name: "Full", exact: true })
      .click();
    await page.getByLabel("Notes").fill(`${RUN_TAG} PM check`);
    await page.getByRole("button", { name: "Save check" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const checkRows = dbQuery(`
      select system_id, check_type
      from core.daily_checks
      where notes = '${RUN_TAG} PM check'
    `);
    expect(checkRows).toHaveLength(1);
    expect(Number(checkRows[0].system_id)).toBe(grahamSystemId);
    expect(checkRows[0].check_type).toBe("PM");

    const feedingAfter = dbQuery(`
      select id, consumption_status, consumption_checked_at
      from core.feeding_logs
      where notes = '${RUN_TAG} feeding'
    `);
    expect(feedingAfter).toHaveLength(1);
    expect(feedingAfter[0].id).toBe(feedingBefore[0].id);
    expect(feedingAfter[0].consumption_status).toBe("full");
    expect(feedingAfter[0].consumption_checked_at).not.toBeNull();
  });

  test("water quality reading for Graham lands in water_quality_readings", async ({
    page,
  }) => {
    const systemRows = dbQuery(`select id from core.systems where name = 'Graham'`);
    const waterQualitySystemId = Number(systemRows[0]?.id);
    expect(waterQualitySystemId).toBeGreaterThan(0);

    await login(page);
    await page.goto(
      `/protected/daily-operations?type=water-quality&system=${waterQualitySystemId}`,
    );
    await expect(page.getByLabel("Nitrate")).toBeVisible();
    await expect(page.getByLabel("Nitrite")).toBeVisible();
    await page.getByRole("button", { name: "Apex probe" }).click();
    await page.getByLabel("pH", { exact: true }).fill("8.1");
    await page.getByLabel("Magnesium").fill("1300");
    await page.getByLabel("Ammonia").fill("0");
    await page.getByLabel("Alkalinity").fill("9");
    await page.getByLabel("Calcium").fill("420");
    await page.getByLabel("Phosphate").fill("0.02");
    await page.getByLabel("Salinity").fill("32");
    await page.getByLabel("Nitrate").fill("7.13");
    await page.getByLabel("Nitrite").fill("41");
    await page.getByLabel("Notes").fill(`${RUN_TAG} water quality`);
    await page.getByRole("button", { name: "Save reading" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const rows = dbQuery(`
      select system_id, ph_source, ph, salinity, nitrate, nitrite, tested_at
      from core.water_quality_readings
      where notes = '${RUN_TAG} water quality'
    `);
    expect(rows).toHaveLength(1);
    const reading = rows[0];
    expect(Number(reading.system_id)).toBe(waterQualitySystemId);
    expect(reading.ph_source).toBe("apex_probe");
    expect(Number(reading.ph)).toBe(8.1);
    expect(Number(reading.salinity)).toBe(32);
    expect(Number(reading.nitrate)).toBe(7.13);
    expect(Number(reading.nitrite)).toBe(41);
    expect(localDateOf(String(reading.tested_at))).toBe(todayDateString());
  });

  test("chemical addition for Graham lands in chemical_additions", async ({
    page,
  }) => {
    const systemRows = dbQuery(`select id from core.systems where name = 'Graham'`);
    const chemicalSystemId = Number(systemRows[0]?.id);
    expect(chemicalSystemId).toBeGreaterThan(0);

    await login(page);
    await page.goto("/protected/daily-operations?type=chemical-addition");
    await expect(page.getByRole("heading", { name: "Daily Operations" })).toBeVisible();

    const form = page.locator("form");
    const chemicalChoices = form
      .getByRole("group", { name: "Chemical/product added to system water" })
      .getByRole("radio");
    await expect(chemicalChoices).toHaveCount(4);
    for (const choice of ["C-Balance", "DI-Trace", "Mg", "Other"]) {
      await expect(form.getByRole("radio", { name: choice, exact: true })).toBeVisible();
    }
    await expect(
      form.getByRole("link", { name: /star treatment/i }),
    ).toHaveCount(0);

    await form.getByRole("radio", { name: "Other", exact: true }).click();
    await expect(form.getByLabel("Chemical/product name")).toBeVisible();
    await form.getByLabel("Chemical/product name").fill("   ");
    await form.getByRole("button", { name: "Save system addition" }).click();
    await expect(form.getByText("Enter a chemical/product name")).toBeVisible();
    await expect(page).toHaveURL(/\/protected\/daily-operations\?type=chemical-addition$/);

    await form.getByLabel("System").selectOption(String(chemicalSystemId));
    await form.getByRole("radio", { name: "DI-Trace", exact: true }).click();
    await expect(form.getByLabel("Chemical/product name")).toHaveCount(0);
    await page.getByLabel("Amount").fill("50");
    await page.getByLabel("Unit").fill("mL");
    await page.getByLabel("Reason").fill(`${RUN_TAG} chemical addition`);
    await page.getByRole("button", { name: "Save system addition" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const rows = dbQuery(`
      select system_id, chemical_name, amount, unit, reason, added_at
      from core.chemical_additions
      where reason = '${RUN_TAG} chemical addition'
    `);
    expect(rows).toHaveLength(1);
    const addition = rows[0];
    expect(Number(addition.system_id)).toBe(chemicalSystemId);
    expect(addition.chemical_name).toBe("DI-Trace");
    expect(Number(addition.amount)).toBe(50);
    expect(addition.unit).toBe("mL");
    expect(addition.reason).toBe(`${RUN_TAG} chemical addition`);
    expect(localDateOf(String(addition.added_at))).toBe(todayDateString());
  });

  test("health observation blocks submit without a photo for lesion", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/daily-operations?type=health-observation");
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Medium" }).click();
    await page.getByLabel("Lesion").check();
    await page.getByLabel("Notes").fill(`${RUN_TAG} health obs blocked`);
    await page.getByRole("button", { name: "Save observation" }).click();
    // Client-side zod validation should block the insert and keep us on the form.
    await expect(page.getByText(/photo is required/i)).toBeVisible();
    await expect(page).toHaveURL(
      /\/protected\/daily-operations\?type=health-observation/,
    );

    if (db) {
      const { data } = await db
        .from("health_observations")
        .select("id")
        .eq("notes", `${RUN_TAG} health obs blocked`)
        .maybeSingle();
      expect(data).toBeNull();
    }
  });

  test("health observation with photo for lesion succeeds and uploads to Storage", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/daily-operations?type=health-observation");
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Medium" }).click();
    await page.getByLabel("Lesion").check();
    await page
      .locator("#photoFile")
      .setInputFiles(path.join(__dirname, "fixtures/test-photo.png"));
    await page.getByLabel("Notes").fill(`${RUN_TAG} health obs with photo`);
    await page.getByRole("button", { name: "Save observation" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    if (db) {
      const { data: observation, error } = await db
        .from("health_observations")
        .select("id, animal_id, severity, has_photo, observed_at")
        .eq("notes", `${RUN_TAG} health obs with photo`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(observation?.animal_id).toBe(ssl25AnimalId);
      expect(observation?.severity).toBe("medium");
      expect(observation?.has_photo).toBe(true);
      expect(localDateOf(observation?.observed_at)).toBe(todayDateString());

      const { data: issues } = await db
        .from("health_observation_issues")
        .select("issue")
        .eq("health_observation_id", observation!.id);
      expect(issues?.map((i) => i.issue)).toContain("lesion");

      const { data: attachment } = await db
        .from("attachments")
        .select("storage_path, parent_table, parent_id")
        .eq("parent_table", "health_observations")
        .eq("parent_id", observation!.id)
        .maybeSingle();
      expect(attachment?.storage_path).toContain(
        `health_observations/${observation!.id}/`,
      );

      const { data: storageFiles } = await db.storage
        .from("attachments")
        .list(`health_observations/${observation!.id}`);
      expect(storageFiles?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test("maintenance log for Graham (default date) lands in maintenance_logs", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/daily-operations?type=maintenance-log");
    await expect(page.getByLabel("Date")).toHaveValue(todayDateString());
    await page.getByLabel("System").selectOption(String(grahamSystemId));
    await page.getByLabel("Notes").fill(`${RUN_TAG} maintenance default date`);
    await page.getByRole("button", { name: "Save maintenance log" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const rows = dbQuery(`
      select system_id, performed_at
      from core.maintenance_logs
      where notes = '${RUN_TAG} maintenance default date'
    `);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].system_id)).toBe(grahamSystemId);
    expect(localDateOf(String(rows[0].performed_at))).toBe(todayDateString());
  });

  test("maintenance log with a backdated date stores the picked date, not today, in performed_at", async ({
    page,
  }) => {
    const pickedDate = daysAgoDateString(3);
    await login(page);
    await page.goto("/protected/daily-operations?type=maintenance-log");
    await page.getByLabel("Date").fill(pickedDate);
    await page.getByLabel("System").selectOption(String(grahamSystemId));
    await page.getByLabel("Notes").fill(`${RUN_TAG} maintenance backdated`);
    await page.getByRole("button", { name: "Save maintenance log" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    if (db) {
      const { data, error } = await db
        .from("maintenance_logs")
        .select("system_id, performed_at")
        .eq("notes", `${RUN_TAG} maintenance backdated`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.system_id).toBe(grahamSystemId);
      expect(localDateOf(data?.performed_at)).toBe(pickedDate);
      expect(localDateOf(data?.performed_at)).not.toBe(todayDateString());
    }
  });

  test("Today dashboard reflects everything logged for Graham", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/today");
    await expect(page.getByText("AM done").first()).toBeVisible();
    await expect(page.getByText("PM done").first()).toBeVisible();
    await expect(page.getByText("Fed", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Tested this week").first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Log chemical addition" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Log health observation" }).first(),
    ).toBeVisible();
  });

  // Covers the date+time box added to all six daily-logging forms: default value
  // (today / now) and that a deliberately-picked time (not "now" at submit) lands
  // correctly combined into the row's event timestamp.
  test("AM check date/time box defaults correctly and a picked time is saved to daily_checks.checked_at", async ({
    page,
  }) => {
    await login(page);
    await page.goto(
      `/protected/daily-operations?type=daily-check&system=${grahamSystemId}&check=AM`,
    );
    await expectDefaultDateAndTime(page);
    await page.getByLabel("Time").fill(PICKED_TIME);
    await page.getByLabel("Notes").fill(`${RUN_TAG} AM check picked time`);
    await page.getByLabel("Temperature (°C)").fill("12.5");
    await page.getByRole("button", { name: "Save check" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    if (db) {
      const { data, error } = await db
        .from("daily_checks")
        .select("checked_at")
        .eq("notes", `${RUN_TAG} AM check picked time`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(localDateOf(data?.checked_at)).toBe(todayDateString());
      expect(localTimeOf(data?.checked_at)).toBe(PICKED_TIME);
    }
  });

  test("feeding log date/time box defaults correctly and a picked time is saved to feeding_logs.fed_at", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/daily-operations?type=feeding");
    await expectDefaultDateAndTime(page);
    await page.getByLabel("Time").fill(PICKED_TIME);
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Krill" }).click();
    await page.getByLabel("Amount").fill("2 krill");
    await page.getByLabel("Notes").fill(`${RUN_TAG} feeding picked time`);
    await page.getByRole("button", { name: "Save feeding" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    if (db) {
      const { data, error } = await db
        .from("feeding_logs")
        .select("fed_at")
        .eq("notes", `${RUN_TAG} feeding picked time`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(localDateOf(data?.fed_at)).toBe(todayDateString());
      expect(localTimeOf(data?.fed_at)).toBe(PICKED_TIME);
    }
  });

  test("water quality date/time box defaults correctly and a picked time is saved to water_quality_readings.tested_at", async ({
    page,
  }) => {
    await login(page);
    await page.goto(
      `/protected/daily-operations?type=water-quality&system=${grahamSystemId}`,
    );
    await expectDefaultDateAndTime(page);
    await page.getByLabel("Time").fill(PICKED_TIME);
    await page.getByRole("button", { name: "Apex probe" }).click();
    await page.getByLabel("pH", { exact: true }).fill("8.1");
    await page.getByLabel("Salinity").fill("32");
    await page.getByLabel("Notes").fill(`${RUN_TAG} water quality picked time`);
    await page.getByRole("button", { name: "Save reading" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    if (db) {
      const { data, error } = await db
        .from("water_quality_readings")
        .select("tested_at")
        .eq("notes", `${RUN_TAG} water quality picked time`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(localDateOf(data?.tested_at)).toBe(todayDateString());
      expect(localTimeOf(data?.tested_at)).toBe(PICKED_TIME);
    }
  });

  test("chemical addition date/time box defaults correctly and a picked time is saved to chemical_additions.added_at", async ({
    page,
  }) => {
    const systemRows = dbQuery(`select id from core.systems where name = 'Graham'`);
    const chemicalSystemId = Number(systemRows[0]?.id);
    expect(chemicalSystemId).toBeGreaterThan(0);

    await login(page);
    await page.goto("/protected/daily-operations?type=chemical-addition");
    await expectDefaultDateAndTime(page);
    await page.getByLabel("Time").fill(PICKED_TIME);
    await page.getByLabel("System", { exact: true }).selectOption(String(chemicalSystemId));
    await page.getByRole("radio", { name: "C-Balance", exact: true }).click();
    await page.getByLabel("Amount").fill("50");
    await page.getByLabel("Unit").fill("mL");
    await page.getByLabel("Reason").fill(`${RUN_TAG} chemical addition picked time`);
    await page.getByRole("button", { name: "Save system addition" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const rows = dbQuery(`
      select added_at
      from core.chemical_additions
      where reason = '${RUN_TAG} chemical addition picked time'
    `);
    expect(rows).toHaveLength(1);
    expect(localDateOf(String(rows[0].added_at))).toBe(todayDateString());
    expect(localTimeOf(String(rows[0].added_at))).toBe(PICKED_TIME);
  });

  test("health observation date/time box defaults correctly and a picked time is saved to health_observations.observed_at", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/daily-operations?type=health-observation");
    await expectDefaultDateAndTime(page);
    await page.getByLabel("Time").fill(PICKED_TIME);
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Low" }).click();
    await page.getByLabel("Notes").fill(`${RUN_TAG} health obs picked time`);
    await page.getByRole("button", { name: "Save observation" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const rows = dbQuery(`
      select animal_id, severity, observed_at
      from core.health_observations
      where notes = '${RUN_TAG} health obs picked time'
    `);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].animal_id)).toBe(ssl25AnimalId);
    expect(rows[0].severity).toBe("low");
    expect(localDateOf(String(rows[0].observed_at))).toBe(todayDateString());
    expect(localTimeOf(String(rows[0].observed_at))).toBe(PICKED_TIME);
  });

  test("maintenance log date/time box defaults correctly and a picked time is saved to maintenance_logs.performed_at", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/daily-operations?type=maintenance-log");
    await expectDefaultDateAndTime(page);
    await page.getByLabel("Time").fill(PICKED_TIME);
    await page.getByLabel("System").selectOption(String(grahamSystemId));
    await page.getByLabel("Notes").fill(`${RUN_TAG} maintenance picked time`);
    await page.getByRole("button", { name: "Save maintenance log" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    if (db) {
      const { data, error } = await db
        .from("maintenance_logs")
        .select("performed_at")
        .eq("notes", `${RUN_TAG} maintenance picked time`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(localDateOf(data?.performed_at)).toBe(todayDateString());
      expect(localTimeOf(data?.performed_at)).toBe(PICKED_TIME);
    }
  });
});

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
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  db,
  dbQuery,
  login,
  loginAs,
  signInRoleClient,
  TECH_EMAIL,
  TECH_PASSWORD,
  RUN_TAG,
  todayDateString,
  daysAgoDateString,
  localDateOf,
  localTimeOf,
  PICKED_TIME,
  expectDefaultDateAndTime,
} from "./helpers";

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

test.describe("e2e smoke", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");

  let grahamSystemId: number;
  let ssl25AnimalId: number;
  let diTraceCatalogId: number;

  test.beforeAll(async () => {
    // Must use dbQuery (not db.from) here — schema `core` 403s "permission denied for
    // schema core" against the service-role client, see the gotcha in ../SKILL.md.
    const systemRows = dbQuery(`select id from core.systems where name = 'Graham'`);
    grahamSystemId = Number(systemRows[0]?.id);
    const animalRows = dbQuery(`select id from core.animals where name = 'SSL25'`);
    ssl25AnimalId = Number(animalRows[0]?.id);
    const catalogRows = dbQuery(
      `select id from core.chemical_addition_catalog where name = 'DI-Trace'`,
    );
    diTraceCatalogId = Number(catalogRows[0]?.id);
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
    await page.getByLabel("pH (unitless)", { exact: true }).fill("8.1");
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
    const chemicalChoices = form.getByRole("group", { name: "Quick pick" }).getByRole("radio");
    await expect(chemicalChoices).toHaveCount(4);
    for (const choice of ["C-Balance", "DI-Trace", "Mg", "Enter manually"]) {
      await expect(form.getByRole("radio", { name: choice, exact: true })).toBeVisible();
    }
    await expect(
      form.getByRole("link", { name: /star treatment/i }),
    ).toHaveCount(0);

    await form.getByRole("radio", { name: "Enter manually", exact: true }).click();
    await form.getByLabel("Chemical/product name").fill("   ");
    await form.getByRole("button", { name: "Save system addition" }).click();
    await expect(form.getByText("Enter a chemical/product name")).toBeVisible();
    await expect(page).toHaveURL(/\/protected\/daily-operations\?type=chemical-addition$/);

    await form.getByLabel("System").selectOption(String(chemicalSystemId));
    await form.getByRole("radio", { name: "DI-Trace", exact: true }).click();
    await expect(form.getByLabel("Chemical/product name")).toHaveValue("DI-Trace");
    await expect(form.getByLabel("Unit")).toHaveValue("mL");
    await page.getByLabel("Amount").fill("50");
    await page.getByLabel("Reason").fill(`${RUN_TAG} chemical addition`);
    await page.getByRole("button", { name: "Save system addition" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const rows = dbQuery(`
      select system_id, catalog_id, chemical_name, amount, unit, reason, added_at
      from core.chemical_additions
      where reason = '${RUN_TAG} chemical addition'
    `);
    expect(rows).toHaveLength(1);
    const addition = rows[0];
    expect(Number(addition.system_id)).toBe(chemicalSystemId);
    expect(Number(addition.catalog_id)).toBe(diTraceCatalogId);
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

  test("health observation with photo stores multiple issues on the parent row and uploads to Storage", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/daily-operations?type=health-observation");
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Medium" }).click();
    await page.getByLabel("Lesion").check();
    await page.getByLabel("Arm curling").check();
    await page
      .locator("#photoFile")
      .setInputFiles(path.join(__dirname, "fixtures/test-photo.png"));
    await page.getByLabel("Notes").fill(`${RUN_TAG} health obs with photo`);
    await page.getByRole("button", { name: "Save observation" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const observations = dbQuery(`
      select id, animal_id, severity, has_photo, observed_at, to_json(issues) as issues
      from core.health_observations
      where notes = '${RUN_TAG} health obs with photo'
    `);
    expect(observations).toHaveLength(1);
    const observation = observations[0];
    expect(Number(observation.animal_id)).toBe(ssl25AnimalId);
    expect(observation.severity).toBe("medium");
    expect(observation.has_photo).toBe(true);
    expect(observation.issues).toEqual(["lesion", "arm_curling"]);
    expect(localDateOf(String(observation.observed_at))).toBe(todayDateString());

    const attachments = dbQuery(`
      select storage_path, parent_table, parent_id
      from core.attachments
      where parent_table = 'health_observations'
        and parent_id = ${Number(observation.id)}
    `);
    expect(attachments).toHaveLength(1);
    expect(attachments[0].storage_path).toContain(
      `health_observations/${observation.id}/`,
    );

    if (db) {
      const { data: storageFiles } = await db.storage
        .from("attachments")
        .list(`health_observations/${observation.id}`);
      expect(storageFiles?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test("one maintenance submission creates one row with the selected task_type", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/daily-operations?type=maintenance-log");
    await expect(page.getByLabel("Date")).toHaveValue(todayDateString());
    await page
      .getByLabel("System", { exact: true })
      .selectOption(String(grahamSystemId));
    await page.getByLabel("Sump flush").check();
    await page.getByLabel("Notes").fill(`${RUN_TAG} maintenance default date`);
    await page.getByRole("button", { name: "Save maintenance log" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const rows = dbQuery(`
      select system_id, task_type, performed_at
      from core.maintenance_logs
      where notes = '${RUN_TAG} maintenance default date'
    `);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].system_id)).toBe(grahamSystemId);
    expect(rows[0].task_type).toBe("sump_flush");
    expect(localDateOf(String(rows[0].performed_at))).toBe(todayDateString());
  });

  test("maintenance log with a backdated date stores the picked date, not today, in performed_at", async ({
    page,
  }) => {
    const pickedDate = daysAgoDateString(3);
    await login(page);
    await page.goto("/protected/daily-operations?type=maintenance-log");
    await page.getByLabel("Date").fill(pickedDate);
    await page
      .getByLabel("System", { exact: true })
      .selectOption(String(grahamSystemId));
    await page.getByLabel("Other").check();
    await page.getByLabel("Notes").fill(`${RUN_TAG} maintenance backdated`);
    await page.getByRole("button", { name: "Save maintenance log" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const rows = dbQuery(`
      select system_id, task_type, performed_at
      from core.maintenance_logs
      where notes = '${RUN_TAG} maintenance backdated'
    `);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].system_id)).toBe(grahamSystemId);
    expect(rows[0].task_type).toBe("other");
    expect(localDateOf(String(rows[0].performed_at))).toBe(pickedDate);
    expect(localDateOf(String(rows[0].performed_at))).not.toBe(todayDateString());
  });

  test("Today dashboard reflects everything logged for Graham", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/home");
    await expect(page.getByRole("heading", { name: "Home", level: 1 })).toBeVisible();
    await expect(page.getByText("All clear: Graham", { exact: true })).toBeVisible();
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
    await page.getByLabel("pH (unitless)", { exact: true }).fill("8.1");
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
      select animal_id, severity, observed_at, to_json(issues) as issues
      from core.health_observations
      where notes = '${RUN_TAG} health obs picked time'
    `);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].animal_id)).toBe(ssl25AnimalId);
    expect(rows[0].severity).toBe("low");
    expect(rows[0].issues).toEqual([]);
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
    await page.getByLabel("Filter change").check();
    await page.getByLabel("Notes").fill(`${RUN_TAG} maintenance picked time`);
    await page.getByRole("button", { name: "Save maintenance log" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const rows = dbQuery(`
      select task_type, performed_at
      from core.maintenance_logs
      where notes = '${RUN_TAG} maintenance picked time'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].task_type).toBe("filter_change");
    expect(localDateOf(String(rows[0].performed_at))).toBe(todayDateString());
    expect(localTimeOf(String(rows[0].performed_at))).toBe(PICKED_TIME);
  });
});

test.describe("P1 database-owned systems and Chemical addition quick picks", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");
  test.skip(!ADMIN_PASSWORD, "E2E_TEST_ADMIN_PASSWORD not set");

  const tag = `${RUN_TAG} P1 chemical`;
  let systems: { id: number; name: string }[] = [];
  let grahamSystemId: number;
  let cBalanceCatalogId: number;
  let referencedAdditionId: number;

  test.beforeAll(() => {
    systems = dbQuery(`select id, name from core.systems order by name, id`).map(
      (row) => ({ id: Number(row.id), name: String(row.name) }),
    );
    grahamSystemId = systems.find((system) => system.name === "Graham")?.id ?? 0;
    cBalanceCatalogId = Number(
      dbQuery(`select id from core.chemical_addition_catalog where name = 'C-Balance'`)[0]
        ?.id,
    );
    expect(systems.length).toBeGreaterThan(0);
    expect(grahamSystemId).toBeGreaterThan(0);
    expect(cBalanceCatalogId).toBeGreaterThan(0);
  });

  test.afterAll(() => {
    dbQuery(`delete from core.chemical_additions where reason like ${sqlLiteral(`${tag}%`)}`);
    dbQuery(`update core.chemical_addition_catalog
      set name = 'C-Balance', default_unit = 'mL'
      where id = ${cBalanceCatalogId}`);
  });

  test("authenticated System selectors match database name/ID order with no display_order column", async ({
    page,
  }) => {
    expect(
      dbQuery(`select column_name
        from information_schema.columns
        where table_schema = 'core'
          and table_name = 'systems'
          and column_name = 'display_order'`),
    ).toHaveLength(0);

    await login(page);
    for (const type of [
      "daily-check",
      "water-quality",
      "chemical-addition",
      "maintenance-log",
    ]) {
      await page.goto(`/protected/daily-operations?type=${type}`);
      const options = await page
        .getByLabel("System", { exact: true })
        .locator("option:not([value=''])")
        .evaluateAll((items) =>
          items.map((item) => ({
            id: Number((item as HTMLOptionElement).value),
            name: item.textContent?.trim() ?? "",
          })),
        );
      expect(options).toEqual(systems);
    }
  });

  test("daily forms reject a nonexistent Pacific spring-forward time before writing", async ({
    page,
  }) => {
    const notes = `${tag} spring gap`;
    await login(page);
    await page.goto(
      `/protected/daily-operations?type=daily-check&system=${grahamSystemId}&check=AM`,
    );
    await page.getByLabel("Date").fill("2026-03-08");
    await page.getByLabel("Time").fill("02:30");
    await page.getByLabel("Temperature (°C)").fill("12.5");
    await page.getByLabel("Notes").fill(notes);
    await page.getByRole("button", { name: "Save check" }).click();

    await expect(page.getByText(/does not exist in Pacific time/)).toBeVisible();
    expect(
      dbQuery(`select id from core.daily_checks where notes = ${sqlLiteral(notes)}`),
    ).toHaveLength(0);
  });

  test("exact Chemical seeds provide defaults and persist catalog plus snapshots", async ({
    page,
  }) => {
    const catalog = dbQuery(`select id, name, default_unit
      from core.chemical_addition_catalog
      order by id`);
    expect(catalog.map(({ name, default_unit }) => ({ name, default_unit }))).toEqual([
      { name: "C-Balance", default_unit: "mL" },
      { name: "Mg", default_unit: "mL" },
      { name: "DI-Trace", default_unit: "mL" },
    ]);

    await login(page);
    await page.goto(
      `/protected/daily-operations?type=chemical-addition&system=${grahamSystemId}`,
    );
    await expect(page.getByRole("radio", { name: "C-Balance", exact: true })).toBeChecked();
    await expect(page.getByLabel("Chemical/product name")).toHaveValue("C-Balance");
    await expect(page.getByLabel("Unit")).toHaveValue("mL");
    await page.getByLabel("Amount").fill("2.5");
    await page.getByLabel("Unit").fill("drops");
    await page.getByLabel("Reason").fill(`${tag} referenced`);
    await page.getByRole("button", { name: "Save system addition" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const row = dbQuery(`select id, catalog_id, chemical_name, amount, unit
      from core.chemical_additions
      where reason = ${sqlLiteral(`${tag} referenced`)}`)[0];
    referencedAdditionId = Number(row?.id);
    expect(referencedAdditionId).toBeGreaterThan(0);
    expect(Number(row.catalog_id)).toBe(cBalanceCatalogId);
    expect(row.chemical_name).toBe("C-Balance");
    expect(Number(row.amount)).toBe(2.5);
    expect(row.unit).toBe("drops");
  });

  test("free-text Chemical addition persists a null catalog reference", async ({ page }) => {
    await login(page);
    await page.goto(
      `/protected/daily-operations?type=chemical-addition&system=${grahamSystemId}`,
    );
    await page.getByRole("radio", { name: "Enter manually", exact: true }).click();
    await page.getByLabel("Chemical/product name").fill("  Custom   Buffer  ");
    await page.getByLabel("Amount").fill("3");
    await page.getByLabel("Unit").fill(" g ");
    await page.getByLabel("Reason").fill(`${tag} free text`);
    await page.getByRole("button", { name: "Save system addition" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const row = dbQuery(`select catalog_id, chemical_name, unit
      from core.chemical_additions
      where reason = ${sqlLiteral(`${tag} free text`)}`)[0];
    expect(row.catalog_id).toBeNull();
    expect(row.chemical_name).toBe("Custom Buffer");
    expect(row.unit).toBe("g");
  });

  test("renaming a referenced Chemical quick pick preserves history and deletion is blocked", async () => {
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const renamed = `${RUN_TAG} C-Balance renamed`;

    try {
      const { data: updated, error: updateError } = await adminClient
        .from("chemical_addition_catalog")
        .update({ name: renamed, default_unit: "L" })
        .eq("id", cBalanceCatalogId)
        .select("id, name, default_unit")
        .single();
      expect(updateError).toBeNull();
      expect(updated).toMatchObject({
        id: cBalanceCatalogId,
        name: renamed,
        default_unit: "L",
      });

      const historical = dbQuery(`select catalog_id, chemical_name, unit
        from core.chemical_additions where id = ${referencedAdditionId}`)[0];
      expect(Number(historical.catalog_id)).toBe(cBalanceCatalogId);
      expect(historical.chemical_name).toBe("C-Balance");
      expect(historical.unit).toBe("drops");

      const { data: deleted, error: deleteError } = await adminClient
        .from("chemical_addition_catalog")
        .delete()
        .eq("id", cBalanceCatalogId)
        .select("id")
        .maybeSingle();
      expect(deleteError).not.toBeNull();
      expect(deleted).toBeNull();
      expect(
        dbQuery(`select id from core.chemical_addition_catalog where id = ${cBalanceCatalogId}`),
      ).toHaveLength(1);
    } finally {
      dbQuery(`update core.chemical_addition_catalog
        set name = 'C-Balance', default_unit = 'mL'
        where id = ${cBalanceCatalogId}`);
    }
  });
});

test.describe("P1 water-quality targets", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");

  const tag = `${RUN_TAG} P1 water target`;
  let grahamSystemId: number;
  let fallbackSystemId: number;
  let labPhTargetId: number;
  let systemPhTargetId: number;
  let labSalinityTargetId: number;
  const readingIds: number[] = [];

  test.beforeAll(() => {
    const systems = dbQuery(`select id, name from core.systems order by name, id`);
    grahamSystemId = Number(systems.find((system) => system.name === "Graham")?.id);
    fallbackSystemId = Number(
      systems.find((system) => Number(system.id) !== grahamSystemId)?.id,
    );
    expect(grahamSystemId).toBeGreaterThan(0);
    expect(fallbackSystemId).toBeGreaterThan(0);
  });

  test.afterAll(() => {
    dbQuery(`delete from core.water_quality_readings
      where notes like ${sqlLiteral(`${tag}%`)}
        or id in (${readingIds.length > 0 ? readingIds.join(", ") : "0"})`);
    const targetIds = [labPhTargetId, systemPhTargetId, labSalinityTargetId].filter(
      (id) => Number.isInteger(id) && id > 0,
    );
    if (targetIds.length > 0) {
      dbQuery(`delete from core.water_quality_target_ranges
        where id in (${targetIds.join(", ")})`);
    }
  });

  test("ships with no seeded target ranges", () => {
    expect(dbQuery(`select id from core.water_quality_target_ranges`)).toHaveLength(0);
  });

  test("Technician creates lab-wide, system override, and one-sided targets in the UI", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/settings/water-quality-targets");
    await expect(page.getByRole("heading", { name: "Target ranges" })).toBeVisible();

    const labPh = page.getByRole("form", { name: "pH target for Lab-wide" });
    await labPh.getByLabel("Minimum (unitless)").fill("7.8");
    await labPh.getByLabel("Maximum (unitless)").fill("8.4");
    await labPh.getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("status")).toContainText("pH target saved for Lab-wide.");
    labPhTargetId = Number(
      dbQuery(`select id from core.water_quality_target_ranges
        where system_id is null and parameter_key = 'ph'`)[0]?.id,
    );

    await page.getByLabel("Range scope").selectOption(String(grahamSystemId));
    const systemPh = page.getByRole("form", { name: "pH target for Graham" });
    await expect(systemPh).toContainText("Lab-wide fallback");
    await systemPh.getByLabel("Minimum (unitless)").fill("8");
    await systemPh.getByLabel("Maximum (unitless)").fill("8.2");
    await systemPh.getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("status")).toContainText("pH target saved for Graham.");
    systemPhTargetId = Number(
      dbQuery(`select id from core.water_quality_target_ranges
        where system_id = ${grahamSystemId} and parameter_key = 'ph'`)[0]?.id,
    );

    await page.getByLabel("Range scope").selectOption("lab");
    const labSalinity = page.getByRole("form", {
      name: "Salinity target for Lab-wide",
    });
    await labSalinity.getByLabel("Minimum (ppt)").fill("30");
    await labSalinity.getByRole("button", { name: "Add" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Salinity target saved for Lab-wide.",
    );
    labSalinityTargetId = Number(
      dbQuery(`select id from core.water_quality_target_ranges
        where system_id is null and parameter_key = 'salinity'`)[0]?.id,
    );

    expect([labPhTargetId, systemPhTargetId, labSalinityTargetId]).toEqual(
      expect.arrayContaining([expect.any(Number), expect.any(Number), expect.any(Number)]),
    );
  });

  test("system override warns in the UI and both UI and DB require notes", async ({
    page,
  }) => {
    await login(page);
    await page.goto(
      `/protected/daily-operations?type=water-quality&system=${grahamSystemId}`,
    );
    await page.getByLabel("pH (unitless)", { exact: true }).fill("8.3");
    await expect(page.getByRole("status")).toContainText("Outside target");
    await page.getByRole("button", { name: "Save reading" }).click();
    await expect(
      page.getByText("Add notes for readings outside their target range"),
    ).toBeVisible();
    expect(
      dbQuery(`select id from core.water_quality_readings
        where system_id = ${grahamSystemId} and ph = 8.3
          and notes = ${sqlLiteral(`${tag} override`)}`),
    ).toHaveLength(0);

    const technicianClient = await signInRoleClient(
      TECH_EMAIL,
      TECH_PASSWORD,
    );
    const { error: serverError } = await technicianClient
      .from("water_quality_readings")
      .insert({ system_id: grahamSystemId, ph_source: "manual", ph: 8.3 });
    expect(serverError?.message).toContain("Notes are required when ph");

    await page.getByLabel("Notes").fill(`${tag} override`);
    await page.getByRole("button", { name: "Save reading" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);
    const row = dbQuery(`select id, system_id, ph, notes
      from core.water_quality_readings
      where notes = ${sqlLiteral(`${tag} override`)}`)[0];
    expect(Number(row.system_id)).toBe(grahamSystemId);
    expect(Number(row.ph)).toBe(8.3);
    readingIds.push(Number(row.id));
  });

  test("fallback, inclusive and one-sided bounds work while an untargeted value needs no notes", async () => {
    const technicianClient = await signInRoleClient(TECH_EMAIL, TECH_PASSWORD);
    const acceptedPayloads = [
      { system_id: fallbackSystemId, ph_source: "manual", ph: 8.3 },
      { system_id: grahamSystemId, ph_source: "manual", ph: 8 },
      { system_id: grahamSystemId, ph_source: "manual", salinity: 30 },
      { system_id: grahamSystemId, ph_source: "manual", phosphate: 999 },
    ];

    for (const payload of acceptedPayloads) {
      const { data, error } = await technicianClient
        .from("water_quality_readings")
        .insert(payload)
        .select("id")
        .single();
      expect(error).toBeNull();
      readingIds.push(Number(data?.id));
    }

    const { data: rejected, error: oneSidedError } = await technicianClient
      .from("water_quality_readings")
      .insert({ system_id: grahamSystemId, ph_source: "manual", salinity: 29 })
      .select("id")
      .maybeSingle();
    expect(oneSidedError?.message).toContain("Notes are required when salinity");
    expect(rejected).toBeNull();
  });

  test("editing a target leaves the historical reading unchanged", async ({ page }) => {
    const before = dbQuery(`select ph, notes, tested_at
      from core.water_quality_readings
      where id = ${readingIds[0]}`)[0];

    await loginAs(page, TECH_EMAIL, TECH_PASSWORD);
    await page.goto("/protected/settings/water-quality-targets");
    await page.getByLabel("Range scope").selectOption(String(grahamSystemId));
    const systemPh = page.getByRole("form", { name: "pH target for Graham" });
    await systemPh.getByLabel("Minimum (unitless)").fill("8.1");
    await systemPh.getByLabel("Maximum (unitless)").fill("8.4");
    await systemPh.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText("pH target saved for Graham.");

    const target = dbQuery(`select min_value, max_value
      from core.water_quality_target_ranges where id = ${systemPhTargetId}`)[0];
    expect(Number(target.min_value)).toBe(8.1);
    expect(Number(target.max_value)).toBe(8.4);
    expect(
      dbQuery(`select ph, notes, tested_at
        from core.water_quality_readings where id = ${readingIds[0]}`)[0],
    ).toEqual(before);
  });
});

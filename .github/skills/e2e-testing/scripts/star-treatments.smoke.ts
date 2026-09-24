/**
 * Star treatment verification: role visibility, RPC-only writes, current-row lifecycle,
 * correction/deletion permissions, list filters, and the Probiotics boundary.
 * Hosted writes are gated by a read-only schema probe and tagged for RPC cleanup.
 */
import { expect, test, type Page } from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TECH_EMAIL,
  TECH_PASSWORD,
  VIEWER_EMAIL,
  VIEWER_PASSWORD,
  VOLUNTEER_EMAIL,
  VOLUNTEER_PASSWORD,
  dbQuery,
  loginAs,
  signInRoleClient,
} from "./helpers";

const TAG = `e2e-star-treatment-${Date.now()}`;
const LAB_TIME_ZONE = "America/Los_Angeles";
const PICKED_TIME = "05:37";

type EligibleStar = {
  id: number;
  name: string;
  tankId: number;
  tankName: string;
  systemId: number;
  systemName: string;
};

type SchemaStatus = {
  available: boolean;
  missing: string[];
};

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function labDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LAB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`;
}

function labDateTime(timestamp: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LAB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

function probeStarSchema(): SchemaStatus {
  let row: Record<string, unknown> | undefined;
  try {
    row = dbQuery(`select
      to_regclass('core.star_treatments')::text as star_treatments,
      to_regprocedure('core.create_star_treatment(integer,integer,numeric,text,numeric,text,text,text,timestamp with time zone)')::text as create_rpc,
      to_regprocedure('core.update_star_treatment(integer,text,numeric,text,numeric,text,text)')::text as update_rpc,
      to_regprocedure('core.hard_delete_star_treatment(integer)')::text as delete_rpc,
      exists (
        select 1 from pg_trigger
        where tgname = 'chemical_additions_validate_mutation' and not tgisinternal
      ) as chemical_guard`)[0];
  } catch {
    return { available: false, missing: ["schema_probe_unavailable"] };
  }
  const required = {
    star_treatments: row?.star_treatments,
    create_rpc: row?.create_rpc,
    update_rpc: row?.update_rpc,
    delete_rpc: row?.delete_rpc,
    chemical_guard: row?.chemical_guard,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  return { available: missing.length === 0, missing };
}

async function blockRestMutations(page: Page) {
  const attempts: string[] = [];
  await page.route("**/rest/v1/**", async (route) => {
    const method = route.request().method();
    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
      attempts.push(`${method} ${new URL(route.request().url()).pathname}`);
      await route.abort();
      return;
    }
    await route.continue();
  });
  return attempts;
}

async function openStarTreatmentForm(
  page: Page,
  email: string,
  password: string,
  star: EligibleStar,
) {
  await loginAs(page, email, password);
  await page.goto("/protected/daily-operations");
  await page.getByRole("link", { name: "Star treatment" }).click();
  await expect(page).toHaveURL(/type=star-treatment/);
  await page.getByLabel("System", { exact: true }).selectOption(String(star.systemId));
  await page.getByLabel("Tank", { exact: true }).selectOption(String(star.tankId));
  await page.getByLabel("Treated star").selectOption(String(star.id));
}

function treatmentArticle(page: Page, treatmentId: number) {
  return page.locator("article").filter({
    has: page.locator(`#treatment-${treatmentId}-notes`),
  });
}

test.describe("Star treatments: role visibility and no-access behavior", () => {
  const visibleRoles = [
    ["Admin", ADMIN_EMAIL, ADMIN_PASSWORD],
    ["Technician", TECH_EMAIL, TECH_PASSWORD],
    ["Volunteer", VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD],
  ] as const;

  for (const [role, email, password] of visibleRoles) {
    test(`${role} sees Star treatment and can open its list`, async ({ page }) => {
      test.skip(!password, `E2E_TEST_${role.toUpperCase()}_PASSWORD not set`);
      await loginAs(page, email, password);
      await page.goto("/protected/daily-operations");
      await expect(page.getByRole("link", { name: "Star treatment" })).toBeVisible();
      const response = await page.goto("/protected/star-treatments");
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: "Star treatments" })).toBeVisible();
    });
  }

  test("Viewer has no Star treatment control and receives not-found on direct access", async ({
    page,
  }) => {
    test.skip(!VIEWER_PASSWORD, "E2E_TEST_VIEWER_PASSWORD not set");
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD);
    await page.goto("/protected/daily-operations");
    await expect(page.getByRole("link", { name: "Star treatment" })).toHaveCount(0);
    await page.goto("/protected/star-treatments");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "This page could not be found." }),
    ).toBeVisible();
  });

  test("signed-out access redirects to login", async ({ page }) => {
    await page.goto("/protected/star-treatments");
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe("Star treatments: URL controls and client validation", () => {
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");

  test("form filters persist in the URL and invalid input never attempts a write", async ({
    page,
  }) => {
    const mutationAttempts = await blockRestMutations(page);
    const today = labDateString();

    await loginAs(page, TECH_EMAIL, TECH_PASSWORD);
    await page.goto("/protected/daily-operations?type=star-treatment");
    await expect(page.getByRole("heading", { name: "Star treatment" })).toBeVisible();
    await expect(page.getByLabel("Administered date")).toHaveValue(today);
    await expect(page.getByLabel("Administered date")).toHaveAttribute("min", today);
    await expect(page.getByLabel("Administered date")).toHaveAttribute("max", today);
    await expect(page.getByLabel("Time")).toHaveValue(/^\d{2}:\d{2}$/);
    await expect(page.getByLabel("Probiotics", { exact: true })).toBeChecked();

    const system = page.getByLabel("System", { exact: true });
    const systemId = await system.locator("option:not([value=''])").first().getAttribute("value");
    expect(systemId).toBeTruthy();
    await system.selectOption(systemId ?? "");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("system"))
      .toBe(systemId);
    const tank = page.getByLabel("Tank", { exact: true });
    const tankId = await tank.locator("option:not([value=''])").first().getAttribute("value");
    expect(tankId).toBeTruthy();
    await tank.selectOption(tankId ?? "");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("tank"))
      .toBe(tankId);
    const treatedStar = page.getByLabel("Treated star");
    const animalId = await treatedStar
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value");
    expect(animalId).toBeTruthy();
    await treatedStar.selectOption(animalId ?? "");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("animal"))
      .toBe(animalId);

    await page.getByLabel("Other", { exact: true }).check();
    await expect(page.getByLabel("Treatment name")).toBeVisible();
    await page.getByRole("button", { name: "Save star treatment" }).click();
    await expect(page.getByText("Enter the treatment name")).toBeVisible();
    await expect(page.getByText("Enter an amount or concentration")).toBeVisible();

    await page.getByLabel("Administered date").fill(addDays(today, -1));
    await page.locator("#star-treatment-amount").fill("-1");
    await page.getByRole("button", { name: "Save star treatment" }).click();
    await expect(page.getByText("Date must be today in the lab")).toBeVisible();
    await expect(page.getByText("Enter a positive number")).toBeVisible();

    await page.locator("#star-treatment-amount").fill("2.5");
    await expect(page.locator("#star-treatment-unit")).toHaveValue("mL");
    await page.locator("#star-treatment-amount").fill("");
    await page.locator("#star-treatment-concentration").fill("10");
    await expect(page.locator("#star-treatment-concentration-unit")).toHaveValue("ppm");
    expect(mutationAttempts).toEqual([]);
  });
});

test.describe("Star treatments: Probiotics stays out of system chemical additions", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");

  test("chemical addition form rejects Probiotics without creating a row", async ({ page }) => {
    const reason = `${TAG} prohibited chemical`;
    const mutationAttempts = await blockRestMutations(page);

    await loginAs(page, TECH_EMAIL, TECH_PASSWORD);
    await page.goto("/protected/daily-operations?type=chemical-addition");
    const system = page.getByLabel("System", { exact: true });
    const systemId = await system.locator("option:not([value=''])").first().getAttribute("value");
    expect(systemId).toBeTruthy();
    await system.selectOption(systemId ?? "");
    await page.getByLabel("Other", { exact: true }).check();
    await page.getByLabel("Chemical/product name").fill("Probiotics");
    await page.getByLabel("Amount", { exact: true }).fill("10");
    await page.getByLabel("Unit", { exact: true }).fill("ppm");
    await page.getByLabel("Reason", { exact: true }).fill(reason);
    await system.selectOption(systemId ?? "");
    await expect(system).toHaveValue(systemId ?? "");
    await page.getByRole("button", { name: "Save system addition" }).click();

    await expect(
      page.getByText("Record Probiotics as an individual Star treatment"),
    ).toBeVisible();
    await expect(page).toHaveURL(/type=chemical-addition/);
    expect(mutationAttempts).toEqual([]);
  });
});

test.describe("Star treatments: hosted schema, RPC, and lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!ADMIN_PASSWORD, "E2E_TEST_ADMIN_PASSWORD not set");
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");
  test.skip(!VOLUNTEER_PASSWORD, "E2E_TEST_VOLUNTEER_PASSWORD not set");
  test.skip(!VIEWER_PASSWORD, "E2E_TEST_VIEWER_PASSWORD not set");

  let schemaStatus: SchemaStatus = { available: false, missing: [] };
  let star: EligibleStar;
  let technicianProfileId: number;
  let adminProfileId: number;
  let probioticsId: number;
  let customTreatmentId: number;

  test.beforeAll(() => {
    schemaStatus = probeStarSchema();
    if (!schemaStatus.available) return;

    const starRow = dbQuery(`select
      animal.id,
      animal.name,
      animal.tank_id,
      tank.name as tank_name,
      system.id as system_id,
      system.name as system_name
    from core.animals as animal
    join core.species as species on species.id = animal.species_id
    join core.tanks as tank on tank.id = animal.tank_id
    join core.systems as system on system.id = tank.system_id
    where animal.status = 'active'
      and animal.tracking_type = 'individual'
      and species.category = 'star'
    order by animal.name
    limit 1`)[0];
    expect(starRow).toBeTruthy();
    star = {
      id: Number(starRow.id),
      name: String(starRow.name),
      tankId: Number(starRow.tank_id),
      tankName: String(starRow.tank_name),
      systemId: Number(starRow.system_id),
      systemName: String(starRow.system_name),
    };
    technicianProfileId = Number(
      dbQuery(
        `select id from core.profiles where email = ${sqlLiteral(TECH_EMAIL)}`,
      )[0]?.id,
    );
    adminProfileId = Number(
      dbQuery(
        `select id from core.profiles where email = ${sqlLiteral(ADMIN_EMAIL)}`,
      )[0]?.id,
    );
    expect(technicianProfileId).toBeGreaterThan(0);
    expect(adminProfileId).toBeGreaterThan(0);
  });

  test.beforeEach(() => {
    test.skip(
      !schemaStatus.available,
      `Hosted Star treatment schema is unavailable: ${schemaStatus.missing.join(", ")}`,
    );
  });

  test.afterAll(async () => {
    if (!schemaStatus.available || !ADMIN_PASSWORD) return;
    const remaining = dbQuery(
      `select id from core.star_treatments where notes like ${sqlLiteral(`${TAG}%`)}`,
    );
    if (remaining.length === 0) return;

    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    for (const row of remaining) {
      const { error } = await adminClient.rpc("hard_delete_star_treatment", {
        p_treatment_id: Number(row.id),
      });
      if (error) throw error;
    }
  });

  test("Technician creates concentration-only Probiotics with provenance", async ({
    page,
  }) => {
    const notes = `${TAG} probiotics concentration-only`;
    await openStarTreatmentForm(page, TECH_EMAIL, TECH_PASSWORD, star);
    const today = labDateString();
    await expect(page.getByLabel("Administered date")).toHaveValue(today);
    await page.getByLabel("Time").fill(PICKED_TIME);
    await page.locator("#star-treatment-concentration").fill("10");
    await expect(page.locator("#star-treatment-concentration-unit")).toHaveValue("ppm");
    await page.getByLabel("Notes").fill(notes);

    await page.getByLabel("Administered date").fill(addDays(today, -1));
    await page.getByRole("button", { name: "Save star treatment" }).click();
    await expect(page.getByText("Date must be today in the lab")).toBeVisible();
    expect(
      dbQuery(`select id from core.star_treatments where notes = ${sqlLiteral(notes)}`),
    ).toHaveLength(0);

    await page.getByLabel("Administered date").fill(today);
    const submittedAfter = Date.now();
    await page.getByRole("button", { name: "Save star treatment" }).click();
    await expect(page.getByRole("heading", { name: "Star treatment saved" })).toBeVisible();

    const row = dbQuery(`select
      id, animal_id, tank_id, treatment_type, amount, unit, concentration,
      concentration_unit, notes, administered_at, recorded_by, data_source, entered_at
    from core.star_treatments
    where notes = ${sqlLiteral(notes)}`)[0];
    expect(row).toBeTruthy();
    probioticsId = Number(row.id);
    expect(Number(row.animal_id)).toBe(star.id);
    expect(Number(row.tank_id)).toBe(star.tankId);
    expect(row.treatment_type).toBe("probiotics");
    expect(row.amount).toBeNull();
    expect(row.unit).toBeNull();
    expect(Number(row.concentration)).toBe(10);
    expect(row.concentration_unit).toBe("ppm");
    expect(Number(row.recorded_by)).toBe(technicianProfileId);
    expect(row.data_source).toBe("live");
    expect(labDateTime(String(row.administered_at))).toEqual({
      date: today,
      time: PICKED_TIME,
    });
    const enteredAt = Date.parse(String(row.entered_at));
    expect(enteredAt).toBeGreaterThanOrEqual(submittedAfter - 5_000);
    expect(enteredAt).toBeLessThanOrEqual(Date.now() + 5_000);
  });

  test("Technician creates an amount-only custom treatment with normalized type", async ({
    page,
  }) => {
    const notes = `${TAG} custom amount-only`;
    await openStarTreatmentForm(page, TECH_EMAIL, TECH_PASSWORD, star);
    await page.getByLabel("Time").fill("05:38");
    await page.getByLabel("Other").check();
    await page.getByLabel("Treatment name").fill("  E2E   Recovery   Bath  ");
    await page.locator("#star-treatment-amount").fill("2.5");
    await expect(page.locator("#star-treatment-unit")).toHaveValue("mL");
    await page.getByLabel("Notes").fill(notes);
    await page.getByRole("button", { name: "Save star treatment" }).click();
    await expect(page.getByRole("heading", { name: "Star treatment saved" })).toBeVisible();

    const row = dbQuery(`select
      id, animal_id, tank_id, treatment_type, amount, unit, concentration,
      concentration_unit, recorded_by, data_source, entered_at
    from core.star_treatments
    where notes = ${sqlLiteral(notes)}`)[0];
    customTreatmentId = Number(row.id);
    expect(Number(row.animal_id)).toBe(star.id);
    expect(Number(row.tank_id)).toBe(star.tankId);
    expect(row.treatment_type).toBe("E2E Recovery Bath");
    expect(Number(row.amount)).toBe(2.5);
    expect(row.unit).toBe("mL");
    expect(row.concentration).toBeNull();
    expect(row.concentration_unit).toBeNull();
    expect(Number(row.recorded_by)).toBe(technicianProfileId);
    expect(row.data_source).toBe("live");
    expect(Date.parse(String(row.entered_at))).not.toBeNaN();
  });

  test("list display and filters isolate Probiotics, Other, and the selected star", async ({
    page,
  }) => {
    await loginAs(page, TECH_EMAIL, TECH_PASSWORD);
    await page.goto(
      `/protected/star-treatments?from=${labDateString()}&to=${labDateString()}&animal=${star.id}&treatment=other`,
    );
    const customArticle = treatmentArticle(page, customTreatmentId);
    await expect(customArticle).toBeVisible();
    await expect(customArticle).toContainText(`${star.name}: E2E Recovery Bath`);
    await expect(customArticle).toContainText("2.5 mL");
    await expect(treatmentArticle(page, probioticsId)).toHaveCount(0);
    await expect(page.getByLabel("Star")).toHaveValue(String(star.id));
    await expect(page.getByLabel("Treatment type")).toHaveValue("other");

    await page.getByLabel("Treatment type").selectOption("probiotics");
    await page.getByRole("button", { name: "Apply filters" }).click();
    const probioticsArticle = treatmentArticle(page, probioticsId);
    await expect(probioticsArticle).toBeVisible();
    await expect(probioticsArticle).toContainText(`${star.name}: Probiotics`);
    await expect(probioticsArticle).toContainText("No amount · 10 ppm");
    await expect(treatmentArticle(page, customTreatmentId)).toHaveCount(0);
  });

  test("Volunteer corrects mutable fields without changing provenance and cannot delete", async ({
    page,
  }) => {
    const correctedNotes = `${TAG} probiotics corrected by volunteer`;
    const beforeUpdate = dbQuery(`select
      animal_id, tank_id, administered_at, recorded_by, data_source, entered_at
      from core.star_treatments where id = ${probioticsId}`)[0];
    await loginAs(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
    await page.goto(
      `/protected/star-treatments?from=${labDateString()}&to=${labDateString()}&animal=${star.id}&treatment=probiotics`,
    );
    const article = treatmentArticle(page, probioticsId);
    await article.getByText("View details and correct").click();
    await article.locator(`#treatment-${probioticsId}-concentration`).fill("12");
    await article.locator(`#treatment-${probioticsId}-notes`).fill(correctedNotes);
    await article.getByRole("button", { name: "Save correction" }).click();
    await expect(article.getByText("Correction saved.")).toBeVisible();
    await expect(article.getByText("Delete treatment", { exact: true })).toHaveCount(0);

    const row = dbQuery(`select
      animal_id, tank_id, concentration, notes, administered_at, recorded_by, data_source, entered_at
      from core.star_treatments where id = ${probioticsId}`)[0];
    expect(Number(row.concentration)).toBe(12);
    expect(row.notes).toBe(correctedNotes);
    expect(Number(row.animal_id)).toBe(Number(beforeUpdate.animal_id));
    expect(Number(row.tank_id)).toBe(Number(beforeUpdate.tank_id));
    expect(row.administered_at).toBe(beforeUpdate.administered_at);
    expect(Number(row.recorded_by)).toBe(Number(beforeUpdate.recorded_by));
    expect(row.data_source).toBe(beforeUpdate.data_source);
    expect(row.entered_at).toBe(beforeUpdate.entered_at);

    const volunteerClient = await signInRoleClient(VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
    const { error: deleteError } = await volunteerClient.rpc("hard_delete_star_treatment", {
      p_treatment_id: probioticsId,
    });
    expect(deleteError).not.toBeNull();
    expect(
      dbQuery(`select id from core.star_treatments where id = ${probioticsId}`),
    ).toHaveLength(1);
  });

  test("Admin hard-deletes through the UI", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(
      `/protected/star-treatments?from=${labDateString()}&to=${labDateString()}&animal=${star.id}&treatment=other`,
    );
    const article = treatmentArticle(page, customTreatmentId);
    await article.getByText("View details and correct").click();
    await article.getByText("Delete treatment", { exact: true }).click();
    await article.getByRole("button", { name: "Permanently delete treatment" }).click();
    await expect(article).toHaveCount(0);

    expect(
      dbQuery(`select id from core.star_treatments where id = ${customTreatmentId}`),
    ).toHaveLength(0);
  });

  test("direct table insert and Viewer SELECT are denied", async () => {
    const directNotes = `${TAG} forbidden direct insert`;
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const { error: insertError } = await adminClient.from("star_treatments").insert({
      animal_id: star.id,
      tank_id: star.tankId,
      treatment_type: "probiotics",
      concentration: 10,
      concentration_unit: "ppm",
      notes: directNotes,
      administered_at: new Date().toISOString(),
      recorded_by: adminProfileId,
      data_source: "live",
    });
    expect(insertError).not.toBeNull();
    expect(
      dbQuery(`select id from core.star_treatments where notes = ${sqlLiteral(directNotes)}`),
    ).toHaveLength(0);

    const viewerClient = await signInRoleClient(VIEWER_EMAIL, VIEWER_PASSWORD);
    const { data, error: selectError } = await viewerClient
      .from("star_treatments")
      .select("id")
      .eq("id", probioticsId)
      .maybeSingle();
    expect(selectError).not.toBeNull();
    expect(data).toBeNull();
  });

  test("RPC role matrix permits only the designed roles", async () => {
    const roleClients = {
      admin: await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD),
      technician: await signInRoleClient(TECH_EMAIL, TECH_PASSWORD),
      volunteer: await signInRoleClient(VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD),
      viewer: await signInRoleClient(VIEWER_EMAIL, VIEWER_PASSWORD),
    };

    for (const [role, client] of Object.entries(roleClients)) {
      const { error: createError } = await client.rpc("create_star_treatment", {
        p_animal_id: star.id,
        p_tank_id: 0,
        p_amount: 1,
        p_unit: "mL",
        p_treatment_type: "reef_dip",
        p_notes: `${TAG} ${role} create matrix probe`,
      });
      expect(createError).not.toBeNull();
      if (role !== "viewer") {
        expect(createError?.message).toContain(
          "The selected tank does not match the star's current tank.",
        );
      }

      const { error: updateError } = await client.rpc("update_star_treatment", {
        p_treatment_id: 2_147_483_647,
        p_treatment_type: "reef_dip",
        p_amount: 1,
        p_unit: "mL",
        p_concentration: null,
        p_concentration_unit: null,
        p_notes: `${TAG} ${role} update matrix probe`,
      });
      expect(updateError).not.toBeNull();
      if (role !== "viewer") {
        expect(updateError?.message).toContain("does not exist");
      }

      const { error: deleteError } = await client.rpc("hard_delete_star_treatment", {
        p_treatment_id: 2_147_483_647,
      });
      expect(deleteError).not.toBeNull();
      if (role === "admin" || role === "technician") {
        expect(deleteError?.message).toContain("does not exist");
      } else {
        expect(deleteError?.message).not.toContain("does not exist");
      }
    }

    expect(
      dbQuery(`select id from core.star_treatments where notes like ${sqlLiteral(`${TAG}%matrix probe`)}`),
    ).toHaveLength(0);
  });
});
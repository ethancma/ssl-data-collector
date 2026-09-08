/**
 * E2E smoke test for the SSL Data Collection app.
 * Extend per-feature rather than rewriting; see ../SKILL.md for the full procedure
 * and ../references/test-accounts.md for which accounts to use.
 *
 * Assumes: dev server already running on http://localhost:3000 (never started/stopped
 * by this script — see AGENTS.md).
 *
 * DB verification uses a service-role Supabase client (bypasses RLS) rather than
 * trusting the UI alone. Provide creds via env — never hardcode them here:
 *   SUPABASE_URL                  (defaults to the app's hosted project URL)
 *   SUPABASE_SERVICE_ROLE_KEY     (required for DB assertions; assertions are
 *                                  skipped with a warning if it's absent)
 *   E2E_TEST_TECH_EMAIL / E2E_TEST_TECH_PASSWORD — seeded technician test account
 *   (see ../references/test-accounts.md)
 */
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://bqylxmsifagnztxhixyl.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TECH_EMAIL = process.env.E2E_TEST_TECH_EMAIL ?? "test-tech@ssl.dev";
const TECH_PASSWORD = process.env.E2E_TEST_TECH_PASSWORD ?? "";

if (!SERVICE_ROLE_KEY) {
  console.warn(
    "SUPABASE_SERVICE_ROLE_KEY not set — DB-row assertions will be skipped; " +
      "only UI navigation will be checked.",
  );
}

// Unique tag stamped into every row this run creates, so DB assertions can find
// exactly the row just written instead of guessing "most recent".
const RUN_TAG = `e2e-${Date.now()}`;

const db = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      db: { schema: "core" },
      auth: { persistSession: false },
    })
  : null;

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(TECH_EMAIL);
  await page.getByLabel("Password").fill(TECH_PASSWORD);
  await page.getByRole("button", { name: /login/i }).click();
  await expect(page).toHaveURL(/\/protected/);
}

test.describe("e2e smoke", () => {
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");

  let grahamSystemId: number;
  let ssl25AnimalId: number;

  test.beforeAll(async () => {
    if (!db) return;
    const { data: system } = await db
      .from("systems")
      .select("id")
      .eq("name", "Graham")
      .single();
    grahamSystemId = system?.id;
    const { data: animal } = await db
      .from("animals")
      .select("id")
      .eq("name", "SSL25")
      .single();
    ssl25AnimalId = animal?.id;
  });

  test("technician can sign in", async ({ page }) => {
    await login(page);
  });

  test("AM check for Graham lands in daily_checks", async ({ page }) => {
    await login(page);
    await page.goto(`/protected/checks/new?system=${grahamSystemId}&type=AM`);
    await page.getByLabel("Notes").fill(`${RUN_TAG} AM check`);
    await page.getByLabel("Temperature (°C)").fill("12.5");
    await page.getByRole("button", { name: "Save check" }).click();
    await expect(page).toHaveURL(/\/protected\/today/);

    if (db) {
      const { data, error } = await db
        .from("daily_checks")
        .select("system_id, check_type, water_running, temperature, notes")
        .eq("notes", `${RUN_TAG} AM check`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.system_id).toBe(grahamSystemId);
      expect(data?.check_type).toBe("AM");
      expect(data?.water_running).toBe(true);
      expect(Number(data?.temperature)).toBe(12.5);
    }
  });

  test("feeding log for SSL25 lands in feeding_logs", async ({ page }) => {
    await login(page);
    await page.goto("/protected/feeding/new");
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Krill" }).click();
    await page.getByLabel("Amount").fill("2 krill");
    await page.getByLabel("Notes").fill(`${RUN_TAG} feeding`);
    await page.getByRole("button", { name: "Save feeding" }).click();
    await expect(page).toHaveURL(/\/protected\/today/);

    if (db) {
      const { data, error } = await db
        .from("feeding_logs")
        .select("animal_id, food_type, amount, consumption_status")
        .eq("notes", `${RUN_TAG} feeding`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.animal_id).toBe(ssl25AnimalId);
      expect(data?.food_type).toBe("krill");
      expect(data?.amount).toBe("2 krill");
      expect(data?.consumption_status).toBeNull();
    }
  });

  test("PM check consumption follow-up updates the same feeding_logs row", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/protected/checks/new?system=${grahamSystemId}&type=PM`);
    await expect(page.getByText("Consumption follow-up")).toBeVisible();
    await expect(page.getByText("SSL25")).toBeVisible();
    await page.getByRole("button", { name: "Full", exact: true }).click();
    await page.getByLabel("Notes").fill(`${RUN_TAG} PM check`);
    await page.getByRole("button", { name: "Save check" }).click();
    await expect(page).toHaveURL(/\/protected\/today/);

    if (db) {
      const { data: check } = await db
        .from("daily_checks")
        .select("system_id, check_type")
        .eq("notes", `${RUN_TAG} PM check`)
        .maybeSingle();
      expect(check?.system_id).toBe(grahamSystemId);
      expect(check?.check_type).toBe("PM");

      const { data: feeding } = await db
        .from("feeding_logs")
        .select("consumption_status, consumption_checked_at")
        .eq("notes", `${RUN_TAG} feeding`)
        .maybeSingle();
      expect(feeding?.consumption_status).toBe("full");
      expect(feeding?.consumption_checked_at).not.toBeNull();
    }
  });

  test("water quality reading for Graham lands in water_quality_readings", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/protected/water-quality/new?system=${grahamSystemId}`);
    await page.getByRole("button", { name: "Apex probe" }).click();
    await page.getByLabel("pH").fill("8.1");
    await page.getByLabel("Magnesium").fill("1300");
    await page.getByLabel("Ammonia").fill("0");
    await page.getByLabel("Alkalinity").fill("9");
    await page.getByLabel("Calcium").fill("420");
    await page.getByLabel("Phosphate").fill("0.02");
    await page.getByLabel("Salinity").fill("32");
    await page.getByLabel("Notes").fill(`${RUN_TAG} water quality`);
    await page.getByRole("button", { name: "Save reading" }).click();
    await expect(page).toHaveURL(/\/protected\/today/);

    if (db) {
      const { data, error } = await db
        .from("water_quality_readings")
        .select("system_id, ph_source, ph, salinity")
        .eq("notes", `${RUN_TAG} water quality`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.system_id).toBe(grahamSystemId);
      expect(data?.ph_source).toBe("apex_probe");
      expect(Number(data?.ph)).toBe(8.1);
      expect(Number(data?.salinity)).toBe(32);
    }
  });

  test("chemical addition for Graham lands in chemical_additions", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/protected/chemical-additions/new?system=${grahamSystemId}`);
    await page.getByLabel("Chemical").fill(`${RUN_TAG} baking soda`);
    await page.getByLabel("Amount").fill("50");
    await page.getByLabel("Unit").fill("mL");
    await page.getByLabel("Reason").fill(`${RUN_TAG} chemical addition`);
    await page.getByRole("button", { name: "Save addition" }).click();
    await expect(page).toHaveURL(/\/protected\/today/);

    if (db) {
      const { data, error } = await db
        .from("chemical_additions")
        .select("system_id, chemical_name, amount, unit")
        .eq("reason", `${RUN_TAG} chemical addition`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.system_id).toBe(grahamSystemId);
      expect(data?.chemical_name).toBe(`${RUN_TAG} baking soda`);
      expect(Number(data?.amount)).toBe(50);
      expect(data?.unit).toBe("mL");
    }
  });

  test("health observation blocks submit without a photo for lesion", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/health-observations/new");
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Medium" }).click();
    await page.getByLabel("Lesion").check();
    await page.getByLabel("Notes").fill(`${RUN_TAG} health obs blocked`);
    await page.getByRole("button", { name: "Save observation" }).click();
    // Client-side zod validation should block the insert and keep us on the form.
    await expect(page.getByText(/photo is required/i)).toBeVisible();
    await expect(page).toHaveURL(/\/protected\/health-observations\/new/);

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
    await page.goto("/protected/health-observations/new");
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Medium" }).click();
    await page.getByLabel("Lesion").check();
    await page
      .locator("#photoFile")
      .setInputFiles(path.join(__dirname, "fixtures/test-photo.png"));
    await page.getByLabel("Notes").fill(`${RUN_TAG} health obs with photo`);
    await page.getByRole("button", { name: "Save observation" }).click();
    await expect(page).toHaveURL(/\/protected\/today/);

    if (db) {
      const { data: observation, error } = await db
        .from("health_observations")
        .select("id, animal_id, severity, has_photo")
        .eq("notes", `${RUN_TAG} health obs with photo`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(observation?.animal_id).toBe(ssl25AnimalId);
      expect(observation?.severity).toBe("medium");
      expect(observation?.has_photo).toBe(true);

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
});

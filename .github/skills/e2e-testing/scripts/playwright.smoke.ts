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
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://bqylxmsifagnztxhixyl.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TECH_EMAIL = process.env.E2E_TEST_TECH_EMAIL ?? "test-tech@ssl.dev";
const TECH_PASSWORD = process.env.E2E_TEST_TECH_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.E2E_TEST_ADMIN_EMAIL ?? "test-admin@ssl.dev";
const ADMIN_PASSWORD = process.env.E2E_TEST_ADMIN_PASSWORD ?? "";
// Seeded volunteer test account (core.profiles.role = 'volunteer').
const VOLUNTEER_EMAIL = process.env.E2E_TEST_VOLUNTEER_EMAIL ?? "test-volunteer@ssl.dev";
const VOLUNTEER_PASSWORD = process.env.E2E_TEST_VOLUNTEER_PASSWORD ?? "";
// Seeded viewer test account. No dedicated "test-viewer@ssl.dev" account exists yet
// (unlike admin/technician/volunteer) — this is the one pre-existing active viewer
// profile in the shared dev project. Consider seeding a proper test-viewer@ssl.dev
// account for consistency with test-accounts.md.
const VIEWER_EMAIL = process.env.E2E_TEST_VIEWER_EMAIL ?? "m@sample.com";
const VIEWER_PASSWORD = process.env.E2E_TEST_VIEWER_PASSWORD ?? "";
// Public anon/publishable key — safe to default here the same way SUPABASE_URL is above.
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_KTInkuFFvOLUgENAzAul1w_o0MfJmX3";

if (!SERVICE_ROLE_KEY) {
  console.warn(
    "SUPABASE_SERVICE_ROLE_KEY not set — DB-row assertions will be skipped; " +
      "only UI navigation will be checked.",
  );
}

// Unique tag stamped into every row this run creates, so DB assertions can find
// exactly the row just written instead of guessing "most recent".
const RUN_TAG = `e2e-${Date.now()}`;

// Mirrors the forms' own getTodayDateString()/date-input format (local YYYY-MM-DD),
// so the event-timestamp assertions below compare like for like.
function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayDateString(): string {
  return localDateString(new Date());
}

// Same offset used by the picked-date-in-the-past test below.
function daysAgoDateString(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localDateString(d);
}

// Converts a timestamptz value read back from the DB to the local YYYY-MM-DD it
// represents, so it can be compared against the date string typed into the form.
function localDateOf(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  return localDateString(new Date(timestamp));
}

// Converts a timestamptz value read back from the DB to the local HH:mm it
// represents, so it can be compared against the time string typed into the form.
function localTimeOf(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const db = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      db: { schema: "core" },
      auth: { persistSession: false },
    })
  : null;

async function login(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(TECH_EMAIL);
  await page.getByLabel("Password").fill(TECH_PASSWORD);
  await page.getByRole("button", { name: /login/i }).click();
  // Generous timeout: the first sign-in of a run can hit Next dev's cold-compile
  // latency for the /protected route, well past the default 5s expect timeout.
  await expect(page).toHaveURL(/\/protected/, { timeout: 15_000 });
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /login/i }).click();
  await expect(page).toHaveURL(/\/protected/, { timeout: 15_000 });
}

// Authenticated (RLS-respecting, NOT service-role) client for a given role, used to
// verify UPDATE/DELETE/SELECT permissions directly — the app currently has no edit/delete
// UI for any operational log (only */new create routes exist), so those tiers can only be
// exercised this way rather than by clicking through the app. See the
// "operational log RBAC tiers" describe block below.
async function signInRoleClient(email: string, password: string) {
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    db: { schema: "core" },
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

// No session at all — mirrors a signed-out visitor hitting PostgREST directly.
function anonRoleClient() {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    db: { schema: "core" },
    auth: { persistSession: false },
  });
}

// A fixed clock time, chosen to be unambiguously different from "now" whenever this
// runs, for the picked-time (not just default-to-now) assertions below.
const PICKED_TIME = "05:37";

// Every form's date/time box defaults to today + "now" (see each component's
// getTodayDateString()/getCurrentTimeString()). Allow a couple minutes of slack for
// page-load time rather than asserting an exact clock match.
async function expectDefaultDateAndTime(page: Page) {
  await expect(page.getByLabel("Date")).toHaveValue(todayDateString());
  const timeValue = await page.getByLabel("Time").inputValue();
  expect(timeValue).toMatch(/^\d{2}:\d{2}$/);
  const [h, m] = timeValue.split(":").map(Number);
  const now = new Date();
  const valueMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  expect(Math.abs(valueMinutes - nowMinutes)).toBeLessThanOrEqual(5);
}

// Runs verification SQL directly against the linked hosted project via the Supabase CLI
// (connects as the `postgres` role). Required for any query against schema `core` — the
// service-role supabase-js client above has no USAGE grant on schema `core` on the hosted
// project (only `authenticated` does — see
// supabase/migrations/20260907200000_core_foundation.sql) and 403s with "permission denied
// for schema core". Always use this helper for core-schema assertions, never `db.from(...)`.
function dbQuery(sql: string): Record<string, unknown>[] {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "e2e-sql-")), "query.sql");
  writeFileSync(file, sql);
  const out = execFileSync(
    "supabase",
    ["db", "query", "-f", file, "--linked", "-o", "json"],
    { encoding: "utf8" },
  );
  return (JSON.parse(out).rows as Record<string, unknown>[]) ?? [];
}

test.describe("e2e smoke", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");

  let grahamSystemId: number;
  let ssl25AnimalId: number;

  test.beforeAll(async () => {
    if (!db) return;
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
        .select("system_id, check_type, water_running, temperature, notes, checked_at")
        .eq("notes", `${RUN_TAG} AM check`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.system_id).toBe(grahamSystemId);
      expect(data?.check_type).toBe("AM");
      expect(data?.water_running).toBe(true);
      expect(Number(data?.temperature)).toBe(12.5);
      expect(localDateOf(data?.checked_at)).toBe(todayDateString());
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
        .select("animal_id, food_type, amount, consumption_status, fed_at")
        .eq("notes", `${RUN_TAG} feeding`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.animal_id).toBe(ssl25AnimalId);
      expect(data?.food_type).toBe("krill");
      expect(data?.amount).toBe("2 krill");
      expect(data?.consumption_status).toBeNull();
      expect(localDateOf(data?.fed_at)).toBe(todayDateString());
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
    await page.getByLabel("pH", { exact: true }).fill("8.1");
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
        .select("system_id, ph_source, ph, salinity, tested_at")
        .eq("notes", `${RUN_TAG} water quality`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.system_id).toBe(grahamSystemId);
      expect(data?.ph_source).toBe("apex_probe");
      expect(Number(data?.ph)).toBe(8.1);
      expect(Number(data?.salinity)).toBe(32);
      expect(localDateOf(data?.tested_at)).toBe(todayDateString());
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
        .select("system_id, chemical_name, amount, unit, added_at")
        .eq("reason", `${RUN_TAG} chemical addition`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.system_id).toBe(grahamSystemId);
      expect(data?.chemical_name).toBe(`${RUN_TAG} baking soda`);
      expect(Number(data?.amount)).toBe(50);
      expect(data?.unit).toBe("mL");
      expect(localDateOf(data?.added_at)).toBe(todayDateString());
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
    await page.goto("/protected/daily-operations");
    await page.getByRole("button", { name: "Maintenance" }).click();
    await expect(page.getByLabel("Date")).toHaveValue(todayDateString());
    await page.getByLabel("System").selectOption(String(grahamSystemId));
    await page.getByLabel("Notes").fill(`${RUN_TAG} maintenance default date`);
    await page.getByRole("button", { name: "Save maintenance log" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    if (db) {
      const { data, error } = await db
        .from("maintenance_logs")
        .select("system_id, performed_at")
        .eq("notes", `${RUN_TAG} maintenance default date`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data?.system_id).toBe(grahamSystemId);
      expect(localDateOf(data?.performed_at)).toBe(todayDateString());
    }
  });

  test("maintenance log with a backdated date stores the picked date, not today, in performed_at", async ({
    page,
  }) => {
    const pickedDate = daysAgoDateString(3);
    await login(page);
    await page.goto("/protected/daily-operations");
    await page.getByRole("button", { name: "Maintenance" }).click();
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
    await page.goto(`/protected/checks/new?system=${grahamSystemId}&type=AM`);
    await expectDefaultDateAndTime(page);
    await page.getByLabel("Time").fill(PICKED_TIME);
    await page.getByLabel("Notes").fill(`${RUN_TAG} AM check picked time`);
    await page.getByLabel("Temperature (°C)").fill("12.5");
    await page.getByRole("button", { name: "Save check" }).click();
    await expect(page).toHaveURL(/\/protected\/today/);

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
    await page.goto("/protected/feeding/new");
    await expectDefaultDateAndTime(page);
    await page.getByLabel("Time").fill(PICKED_TIME);
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Krill" }).click();
    await page.getByLabel("Amount").fill("2 krill");
    await page.getByLabel("Notes").fill(`${RUN_TAG} feeding picked time`);
    await page.getByRole("button", { name: "Save feeding" }).click();
    await expect(page).toHaveURL(/\/protected\/today/);

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
    await page.goto(`/protected/water-quality/new?system=${grahamSystemId}`);
    await expectDefaultDateAndTime(page);
    await page.getByLabel("Time").fill(PICKED_TIME);
    await page.getByRole("button", { name: "Apex probe" }).click();
    await page.getByLabel("pH", { exact: true }).fill("8.1");
    await page.getByLabel("Salinity").fill("32");
    await page.getByLabel("Notes").fill(`${RUN_TAG} water quality picked time`);
    await page.getByRole("button", { name: "Save reading" }).click();
    await expect(page).toHaveURL(/\/protected\/today/);

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
    await login(page);
    await page.goto(`/protected/chemical-additions/new?system=${grahamSystemId}`);
    await expectDefaultDateAndTime(page);
    await page.getByLabel("Time").fill(PICKED_TIME);
    await page.getByLabel("Chemical").fill(`${RUN_TAG} baking soda picked time`);
    await page.getByLabel("Amount").fill("50");
    await page.getByLabel("Unit").fill("mL");
    await page.getByLabel("Reason").fill(`${RUN_TAG} chemical addition picked time`);
    await page.getByRole("button", { name: "Save addition" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    if (db) {
      const { data, error } = await db
        .from("chemical_additions")
        .select("added_at")
        .eq("reason", `${RUN_TAG} chemical addition picked time`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(localDateOf(data?.added_at)).toBe(todayDateString());
      expect(localTimeOf(data?.added_at)).toBe(PICKED_TIME);
    }
  });

  test("health observation date/time box defaults correctly and a picked time is saved to health_observations.observed_at", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/health-observations/new");
    await expectDefaultDateAndTime(page);
    await page.getByLabel("Time").fill(PICKED_TIME);
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Low" }).click();
    await page.getByLabel("Notes").fill(`${RUN_TAG} health obs picked time`);
    await page.getByRole("button", { name: "Save observation" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    if (db) {
      const { data, error } = await db
        .from("health_observations")
        .select("observed_at")
        .eq("notes", `${RUN_TAG} health obs picked time`)
        .maybeSingle();
      expect(error).toBeNull();
      expect(localDateOf(data?.observed_at)).toBe(todayDateString());
      expect(localTimeOf(data?.observed_at)).toBe(PICKED_TIME);
    }
  });

  test("maintenance log date/time box defaults correctly and a picked time is saved to maintenance_logs.performed_at", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/daily-operations");
    await page.getByRole("button", { name: "Maintenance" }).click();
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

// Covers app/protected/layout.tsx's ApprovalGate: a brand-new sign-up should be blocked
// behind an info message until an admin sets profiles.status = 'active', instead of the
// previous behavior of silently rendering a blank page (RLS blocked everything).
test.describe("pending approval gate", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!db, "SUPABASE_SERVICE_ROLE_KEY not set");

  const PENDING_EMAIL = `e2e-pending-${RUN_TAG}@ssl.dev`;
  const PENDING_PASSWORD = "Test-password-123!";
  let pendingUserId: string;

  async function loginPending(page: Page) {
    await page.goto("/auth/login");
    await page.getByLabel("Email").fill(PENDING_EMAIL);
    await page.getByLabel("Password").fill(PENDING_PASSWORD);
    await page.getByRole("button", { name: /login/i }).click();
    await expect(page).toHaveURL(/\/protected/);
  }

  test.afterAll(async () => {
    // Don't leave a stray approved test account in shared dev data.
    if (db && pendingUserId) {
      await db.auth.admin.deleteUser(pendingUserId);
    }
  });

  test("sign-up lands as a pending profile with no role", async ({ page }) => {
    await page.goto("/auth/sign-up");
    await page.getByLabel("Email").fill(PENDING_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(PENDING_PASSWORD);
    await page.getByLabel("Repeat Password").fill(PENDING_PASSWORD);
    await page.getByRole("button", { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/auth\/sign-up-success/);

    // Stand-in for clicking the emailed confirmation link, so the account can log in headlessly.
    const {
      data: { users },
    } = await db!.auth.admin.listUsers({ perPage: 1000 });
    const user = users.find((u) => u.email === PENDING_EMAIL);
    expect(user).toBeTruthy();
    pendingUserId = user!.id;
    await db!.auth.admin.updateUserById(pendingUserId, { email_confirm: true });

    const rows = dbQuery(
      `select status, role, email from core.profiles where auth_user_id = '${pendingUserId}'`,
    );
    expect(rows[0]?.status).toBe("pending");
    expect(rows[0]?.role).toBeNull();
    expect(rows[0]?.email).toBe(PENDING_EMAIL);
  });

  test("pending user sees the approval-gate message, not the dashboard, at /protected and /protected/today", async ({
    page,
  }) => {
    await loginPending(page);
    await expect(page.getByText(/pending admin approval/i)).toBeVisible();
    await expect(
      page.getByText(`Your account (${PENDING_EMAIL})`),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Log chemical addition" }),
    ).toHaveCount(0);

    await page.goto("/protected/today");
    await expect(page.getByText(/pending admin approval/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Log chemical addition" }),
    ).toHaveCount(0);
  });

  test("nav still renders normally for a pending user and Logout works", async ({
    page,
  }) => {
    await loginPending(page);
    await expect(page.getByText("SSL Data Collection")).toBeVisible();
    await expect(page.getByText(`Hey, ${PENDING_EMAIL}!`)).toBeVisible();
    await page.getByRole("button", { name: "Logout" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("after admin approval, the same user sees the normal Today dashboard", async ({
    page,
  }) => {
    dbQuery(
      `update core.profiles set status = 'active', role = 'technician' where auth_user_id = '${pendingUserId}'`,
    );

    await loginPending(page);
    await expect(page.getByText(/pending admin approval/i)).toHaveCount(0);
    await page.goto("/protected/today");
    await expect(page.getByText(/pending admin approval/i)).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Log chemical addition" }).first(),
    ).toBeVisible();
  });
});

// Covers the new /protected/admin user-management page: the sidebar's hamburger
// toggle + Admin link, AdminGate authorization, and the approve/deny flow against real
// disposable sign-ups (per test-accounts.md — never reuse the three seeded role accounts
// for this).
test.describe("admin user management", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!ADMIN_PASSWORD, "E2E_TEST_ADMIN_PASSWORD not set");
  test.skip(!db, "SUPABASE_SERVICE_ROLE_KEY not set");

  const APPROVE_EMAIL = `e2e-admin-approve-${RUN_TAG}@ssl.dev`;
  const DENY_EMAIL = `e2e-admin-deny-${RUN_TAG}@ssl.dev`;
  const DISPOSABLE_PASSWORD = "Test-password-123!";
  let approveUserId: string;
  let denyUserId: string;

  test.afterAll(async () => {
    // Never leave stray approved/denied test profiles in shared dev data.
    if (db && approveUserId) await db.auth.admin.deleteUser(approveUserId);
    if (db && denyUserId) await db.auth.admin.deleteUser(denyUserId);
  });

  test("admin sees the sidebar hamburger toggle, Admin link, and the admin table", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    const collapseBtn = page.getByRole("button", { name: /collapse sidebar/i });
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    await expect(
      page.getByRole("button", { name: /expand sidebar/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /expand sidebar/i }).click();
    await expect(collapseBtn).toBeVisible();

    const adminLink = page.getByRole("link", { name: "Admin" });
    await expect(adminLink).toBeVisible();
    await adminLink.click();
    await expect(page).toHaveURL(/\/protected\/admin/);
    await expect(page.getByText(/not authorized/i)).toHaveCount(0);
    await expect(page.getByText("Users", { exact: true })).toBeVisible();
  });

  test("sign-up lands pending, admin approves it as viewer, and the DB row matches", async ({
    page,
  }) => {
    await page.goto("/auth/sign-up");
    await page.getByLabel("Email").fill(APPROVE_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(DISPOSABLE_PASSWORD);
    await page.getByLabel("Repeat Password").fill(DISPOSABLE_PASSWORD);
    await page.getByRole("button", { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/auth\/sign-up-success/);

    // Stand-in for clicking the emailed confirmation link, so it can log in headlessly.
    const {
      data: { users },
    } = await db!.auth.admin.listUsers({ perPage: 1000 });
    const user = users.find((u) => u.email === APPROVE_EMAIL);
    expect(user).toBeTruthy();
    approveUserId = user!.id;
    await db!.auth.admin.updateUserById(approveUserId, { email_confirm: true });

    const pendingRows = dbQuery(
      `select role, status from core.profiles where email = '${APPROVE_EMAIL}'`,
    );
    expect(pendingRows[0]?.status).toBe("pending");
    expect(pendingRows[0]?.role).toBeNull();

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/protected/admin");
    const row = page.locator("div.divide-y > div").filter({ hasText: APPROVE_EMAIL });
    await expect(row).toBeVisible();
    await row.locator("select").nth(0).selectOption("viewer");
    await row.getByRole("button", { name: "Approve" }).click();
    await expect(row.locator("select").nth(1)).toHaveValue("active");

    const approvedRows = dbQuery(
      `select role, status from core.profiles where email = '${APPROVE_EMAIL}'`,
    );
    expect(approvedRows[0]?.role).toBe("viewer");
    expect(approvedRows[0]?.status).toBe("active");
  });

  test("the newly-approved viewer can access /protected normally, without the Admin link", async ({
    page,
  }) => {
    await loginAs(page, APPROVE_EMAIL, DISPOSABLE_PASSWORD);
    await expect(page.getByText(/pending admin approval/i)).toHaveCount(0);
    await expect(page.getByText(/account request was denied/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  });

  test("that same non-admin viewer hitting /protected/admin gets AdminGate's Not authorized", async ({
    page,
  }) => {
    await loginAs(page, APPROVE_EMAIL, DISPOSABLE_PASSWORD);
    await page.goto("/protected/admin");
    await expect(page.getByText(/not authorized/i)).toBeVisible();
  });

  test("sign-up lands pending, admin denies it, and it sees the distinct denied message", async ({
    page,
  }) => {
    await page.goto("/auth/sign-up");
    await page.getByLabel("Email").fill(DENY_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(DISPOSABLE_PASSWORD);
    await page.getByLabel("Repeat Password").fill(DISPOSABLE_PASSWORD);
    await page.getByRole("button", { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/auth\/sign-up-success/);

    const {
      data: { users },
    } = await db!.auth.admin.listUsers({ perPage: 1000 });
    const user = users.find((u) => u.email === DENY_EMAIL);
    expect(user).toBeTruthy();
    denyUserId = user!.id;
    await db!.auth.admin.updateUserById(denyUserId, { email_confirm: true });

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/protected/admin");
    const row = page.locator("div.divide-y > div").filter({ hasText: DENY_EMAIL });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Deny" }).click();
    await expect(row.locator("select").nth(1)).toHaveValue("denied");

    const deniedRows = dbQuery(
      `select status from core.profiles where email = '${DENY_EMAIL}'`,
    );
    expect(deniedRows[0]?.status).toBe("denied");

    await loginAs(page, DENY_EMAIL, DISPOSABLE_PASSWORD);
    await expect(page.getByText(/account request was denied/i)).toBeVisible();
    await expect(page.getByText(/pending admin approval/i)).toHaveCount(0);
  });
});

// Covers the sidebar's new Home icon-button + theme-toggle row (components/protected-sidebar.tsx).
// UI-only (Tier 1 per docs/testing-strategy.md) — no Supabase row assertions needed.
test.describe("sidebar Home button and theme toggle", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");

  test("Home button and theme toggle render in a row under the logo, and theme cycles correctly", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    // Capture Cache-Control on any CSS response, to rule out a stale-CSS-chunk theory.
    const cssResponses: { url: string; cacheControl: string | null }[] = [];
    page.on("response", (res) => {
      const url = res.url();
      const contentType = res.headers()["content-type"] ?? "";
      if (url.endsWith(".css") || contentType.includes("text/css")) {
        cssResponses.push({ url, cacheControl: res.headers()["cache-control"] ?? null });
      }
    });

    // Pulls every value the human asked for in one shot, evaluated in-page.
    async function captureThemeState(label: string) {
      const state = await page.evaluate(() => {
        const html = document.documentElement;
        const bodyStyle = getComputedStyle(document.body);
        const rootStyle = getComputedStyle(document.documentElement);
        return {
          htmlClassName: html.className,
          isDarkClassPresent: html.classList.contains("dark"),
          localStorageTheme: window.localStorage.getItem("theme"),
          bodyBackgroundColor: bodyStyle.backgroundColor,
          bodyColor: bodyStyle.color,
          cssVarBackground: rootStyle.getPropertyValue("--background").trim(),
        };
      });
      console.log(`[theme-state] ${label}:`, JSON.stringify(state));
      return state;
    }

    await login(page);
    await page.goto("/protected/daily-operations");

    const homeButton = page.getByRole("link", { name: "Home" });
    const themeButton = page.getByRole("button", { name: /switch to \w+ mode/i });
    await expect(homeButton).toBeVisible();
    await expect(themeButton).toBeVisible();

    await page.screenshot({ path: "test-results/sidebar-theme-initial.png" });

    // Click through the full cycle and confirm html class + icon match at each step,
    // rather than assuming a fixed light->dark->system order (starting state depends
    // on ThemeProvider's defaultTheme="system" vs. whatever's in localStorage).
    const seen: string[] = [];
    const capturedStates: Record<string, unknown>[] = [];
    for (let i = 0; i < 3; i++) {
      const title = await themeButton.getAttribute("title");
      const state = await captureThemeState(`step ${i} (before click, title="${title}")`);
      capturedStates.push({ step: i, title, ...state });
      seen.push(`${state.isDarkClassPresent ? "dark" : "light"}-bg via "${title}"`);
      await page.screenshot({ path: `test-results/sidebar-theme-step-${i}.png` });
      await themeButton.click();
      await page.waitForTimeout(200); // theme change is a synchronous class toggle, but be safe
    }
    console.log("Theme cycle observed:", seen.join(" -> "));
    console.log("Captured theme states per click:", JSON.stringify(capturedStates, null, 2));

    const finalClass = await page.locator("html").getAttribute("class");
    console.log("Final <html> class:", finalClass);

    // Force explicitly to "dark" (rather than trusting wherever the 3-step cycle landed)
    // and verify the state, then hard-reload and re-verify — this is the exact scenario
    // reported as "stuck on light mode" even after clicking to dark. The cycle is
    // light -> dark -> system -> light (max 3 clicks to reach every state at least once).
    let onDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    for (let i = 0; i < 3 && !onDark; i++) {
      await themeButton.click();
      await page.waitForTimeout(200);
      onDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
    }
    expect(onDark).toBe(true);

    const preReloadDarkState = await captureThemeState("forced to dark, before reload");
    await page.screenshot({ path: "test-results/sidebar-theme-dark-pre-reload.png" });

    await page.reload();
    await page.waitForLoadState("networkidle");

    const postReloadDarkState = await captureThemeState("forced to dark, AFTER hard reload");
    await page.screenshot({ path: "test-results/sidebar-theme-dark-post-reload.png" });

    const serviceWorkerRegistrations = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return "unsupported";
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length;
    });
    console.log("navigator.serviceWorker.getRegistrations() count:", serviceWorkerRegistrations);
    console.log("CSS responses observed (url + Cache-Control):", JSON.stringify(cssResponses, null, 2));

    console.log("Console/page errors during theme cycling:", consoleErrors);

    // Assertions pinning down the actual bug report, not just "no console errors".
    expect(preReloadDarkState.isDarkClassPresent).toBe(true);
    expect(preReloadDarkState.localStorageTheme).toBe("dark");
    expect(postReloadDarkState.isDarkClassPresent).toBe(true);
    expect(postReloadDarkState.localStorageTheme).toBe("dark");
    expect(postReloadDarkState.cssVarBackground).toBe(preReloadDarkState.cssVarBackground);
    expect(postReloadDarkState.bodyBackgroundColor).toBe(preReloadDarkState.bodyBackgroundColor);
    expect(serviceWorkerRegistrations === 0 || serviceWorkerRegistrations === "unsupported").toBe(true);
    expect(consoleErrors).toEqual([]);
  });

  test("Home button navigates directly to /protected/home with no intermediate redirect", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/daily-operations");

    const urlsVisited: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) urlsVisited.push(frame.url());
    });

    await page.getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(/\/protected\/home$/);

    const intermediateHits = urlsVisited.filter(
      (u) => /\/protected\/?$/.test(new URL(u).pathname) && !u.includes("/protected/home"),
    );
    expect(intermediateHits).toEqual([]);
    console.log("Frame navigations during Home click:", urlsVisited);
  });

  test("collapsed sidebar still shows Home button and theme toggle", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/protected/daily-operations");

    await page.getByRole("button", { name: /collapse sidebar/i }).click();
    const homeButton = page.getByRole("link", { name: "Home" });
    const themeButton = page.getByRole("button", { name: /switch to \w+ mode/i });
    await expect(homeButton).toBeVisible();
    await expect(themeButton).toBeVisible();
    await expect(homeButton).toBeEnabled();
    await expect(themeButton).toBeEnabled();
    await page.screenshot({ path: "test-results/sidebar-theme-collapsed.png" });

    // Restore expanded state so later serial tests in this file aren't affected.
    await page.getByRole("button", { name: /expand sidebar/i }).click();
  });
});

// Covers supabase/migrations/20260910120000_operational_log_rbac_tiers.sql: technician
// is promoted to full CRUD, volunteer moves from insert+read to read+update (no more
// insert, still no delete), admin/viewer/anon are unchanged. Admin's create path is
// unaffected by the migration but exercised here anyway since it wasn't covered above
// (the "e2e smoke" describe only signs in as TECH_EMAIL).
test.describe("admin can create logs in every form (operational log RBAC tiers)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!ADMIN_PASSWORD, "E2E_TEST_ADMIN_PASSWORD not set");

  const TAG = `e2e-rbac-admin-${Date.now()}`;
  let grahamSystemId: number;
  let ssl25AnimalId: number;

  test.beforeAll(async () => {
    if (!db) return;
    grahamSystemId = Number(
      dbQuery(`select id from core.systems where name = 'Graham'`)[0]?.id,
    );
    ssl25AnimalId = Number(
      dbQuery(`select id from core.animals where name = 'SSL25'`)[0]?.id,
    );
  });

  test("admin AM check lands in daily_checks", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/protected/checks/new?system=${grahamSystemId}&type=AM`);
    await page.getByLabel("Notes").fill(`${TAG} AM check`);
    await page.getByLabel("Temperature (°C)").fill("12.5");
    await page.getByRole("button", { name: "Save check" }).click();
    await expect(page).toHaveURL(/\/protected\/today/);
    if (db) {
      const rows = dbQuery(
        `select system_id from core.daily_checks where notes = '${TAG} AM check'`,
      );
      expect(Number(rows[0]?.system_id)).toBe(grahamSystemId);
    }
  });

  test("admin feeding log lands in feeding_logs", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/protected/feeding/new");
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Krill" }).click();
    await page.getByLabel("Amount").fill("2 krill");
    await page.getByLabel("Notes").fill(`${TAG} feeding`);
    await page.getByRole("button", { name: "Save feeding" }).click();
    await expect(page).toHaveURL(/\/protected\/today/);
    if (db) {
      const rows = dbQuery(
        `select animal_id from core.feeding_logs where notes = '${TAG} feeding'`,
      );
      expect(Number(rows[0]?.animal_id)).toBe(ssl25AnimalId);
    }
  });

  test("admin water quality reading lands in water_quality_readings", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/protected/water-quality/new?system=${grahamSystemId}`);
    await page.getByRole("button", { name: "Apex probe" }).click();
    await page.getByLabel("pH", { exact: true }).fill("8.1");
    await page.getByLabel("Salinity").fill("32");
    await page.getByLabel("Notes").fill(`${TAG} water quality`);
    await page.getByRole("button", { name: "Save reading" }).click();
    await expect(page).toHaveURL(/\/protected\/today/);
    if (db) {
      const rows = dbQuery(
        `select system_id from core.water_quality_readings where notes = '${TAG} water quality'`,
      );
      expect(Number(rows[0]?.system_id)).toBe(grahamSystemId);
    }
  });

  test("admin chemical addition lands in chemical_additions", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(`/protected/chemical-additions/new?system=${grahamSystemId}`);
    await page.getByLabel("Chemical").fill(`${TAG} baking soda`);
    await page.getByLabel("Amount").fill("50");
    await page.getByLabel("Unit").fill("mL");
    await page.getByLabel("Reason").fill(`${TAG} chemical addition`);
    await page.getByRole("button", { name: "Save addition" }).click();
    await expect(page).toHaveURL(/\/protected\/today/);
    if (db) {
      const rows = dbQuery(
        `select system_id from core.chemical_additions where reason = '${TAG} chemical addition'`,
      );
      expect(Number(rows[0]?.system_id)).toBe(grahamSystemId);
    }
  });

  test("admin health observation lands in health_observations", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/protected/health-observations/new");
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Low" }).click();
    await page.getByLabel("Notes").fill(`${TAG} health obs`);
    await page.getByRole("button", { name: "Save observation" }).click();
    await expect(page).toHaveURL(/\/protected\/(today|home)/);
    if (db) {
      const rows = dbQuery(
        `select animal_id from core.health_observations where notes = '${TAG} health obs'`,
      );
      expect(Number(rows[0]?.animal_id)).toBe(ssl25AnimalId);
    }
  });

  test("admin maintenance log lands in maintenance_logs", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/protected/daily-operations");
    await page.getByRole("button", { name: "Maintenance" }).click();
    await page.getByLabel("System").selectOption(String(grahamSystemId));
    await page.getByLabel("Notes").fill(`${TAG} maintenance`);
    await page.getByRole("button", { name: "Save maintenance log" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);
    if (db) {
      const rows = dbQuery(
        `select system_id from core.maintenance_logs where notes = '${TAG} maintenance'`,
      );
      expect(Number(rows[0]?.system_id)).toBe(grahamSystemId);
    }
  });
});

// The behavior change under test: volunteers lost INSERT (previously had it via
// core.is_contributor()). The app has no client-side role gating on any of these forms
// (Save button/route is identical for every active role — see components/*-form.tsx and
// components/protected-sidebar.tsx), so this is expected to fail at the DB/RLS layer:
// the form stays put and shows the raw PostgREST error, not a friendly "you don't have
// permission" message or a hidden Save button. Flagging that UX gap rather than fixing it
// — see the mode's constraints on this script.
test.describe("volunteer can no longer create logs (operational log RBAC tiers)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!VOLUNTEER_PASSWORD, "E2E_TEST_VOLUNTEER_PASSWORD not set");

  const TAG = `e2e-rbac-volunteer-blocked-${Date.now()}`;
  let grahamSystemId: number;
  let ssl25AnimalId: number;

  test.beforeAll(async () => {
    if (!db) return;
    grahamSystemId = Number(
      dbQuery(`select id from core.systems where name = 'Graham'`)[0]?.id,
    );
    ssl25AnimalId = Number(
      dbQuery(`select id from core.animals where name = 'SSL25'`)[0]?.id,
    );
  });

  test("volunteer AM check submit is rejected by RLS, no daily_checks row created", async ({
    page,
  }) => {
    await loginAs(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
    await page.goto(`/protected/checks/new?system=${grahamSystemId}&type=AM`);
    await page.getByLabel("Notes").fill(`${TAG} AM check`);
    await page.getByLabel("Temperature (°C)").fill("12.5");
    await page.getByRole("button", { name: "Save check" }).click();
    await expect(page.getByText(/row-level security|permission denied/i)).toBeVisible();
    await expect(page).toHaveURL(/\/protected\/checks\/new/);
    if (db) {
      const rows = dbQuery(
        `select id from core.daily_checks where notes = '${TAG} AM check'`,
      );
      expect(rows.length).toBe(0);
    }
  });

  test("volunteer feeding log submit is rejected by RLS, no feeding_logs row created", async ({
    page,
  }) => {
    await loginAs(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
    await page.goto("/protected/feeding/new");
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Krill" }).click();
    await page.getByLabel("Amount").fill("2 krill");
    await page.getByLabel("Notes").fill(`${TAG} feeding`);
    await page.getByRole("button", { name: "Save feeding" }).click();
    await expect(page.getByText(/row-level security|permission denied/i)).toBeVisible();
    await expect(page).toHaveURL(/\/protected\/feeding\/new/);
    if (db) {
      const rows = dbQuery(
        `select id from core.feeding_logs where notes = '${TAG} feeding'`,
      );
      expect(rows.length).toBe(0);
    }
  });

  test("volunteer water quality submit is rejected by RLS, no water_quality_readings row created", async ({
    page,
  }) => {
    await loginAs(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
    await page.goto(`/protected/water-quality/new?system=${grahamSystemId}`);
    await page.getByRole("button", { name: "Apex probe" }).click();
    await page.getByLabel("pH", { exact: true }).fill("8.1");
    await page.getByLabel("Salinity").fill("32");
    await page.getByLabel("Notes").fill(`${TAG} water quality`);
    await page.getByRole("button", { name: "Save reading" }).click();
    await expect(page.getByText(/row-level security|permission denied/i)).toBeVisible();
    await expect(page).toHaveURL(/\/protected\/water-quality\/new/);
    if (db) {
      const rows = dbQuery(
        `select id from core.water_quality_readings where notes = '${TAG} water quality'`,
      );
      expect(rows.length).toBe(0);
    }
  });

  test("volunteer chemical addition submit is rejected by RLS, no chemical_additions row created", async ({
    page,
  }) => {
    await loginAs(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
    await page.goto(`/protected/chemical-additions/new?system=${grahamSystemId}`);
    await page.getByLabel("Chemical").fill(`${TAG} baking soda`);
    await page.getByLabel("Amount").fill("50");
    await page.getByLabel("Unit").fill("mL");
    await page.getByLabel("Reason").fill(`${TAG} chemical addition`);
    await page.getByRole("button", { name: "Save addition" }).click();
    await expect(page.getByText(/row-level security|permission denied/i)).toBeVisible();
    await expect(page).toHaveURL(/\/protected\/chemical-additions\/new/);
    if (db) {
      const rows = dbQuery(
        `select id from core.chemical_additions where reason = '${TAG} chemical addition'`,
      );
      expect(rows.length).toBe(0);
    }
  });

  test("volunteer health observation submit is rejected by RLS, no health_observations row created", async ({
    page,
  }) => {
    await loginAs(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
    await page.goto("/protected/health-observations/new");
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Low" }).click();
    await page.getByLabel("Notes").fill(`${TAG} health obs`);
    await page.getByRole("button", { name: "Save observation" }).click();
    await expect(page.getByText(/row-level security|permission denied/i)).toBeVisible();
    await expect(page).toHaveURL(/\/protected\/health-observations\/new/);
    if (db) {
      const rows = dbQuery(
        `select id from core.health_observations where notes = '${TAG} health obs'`,
      );
      expect(rows.length).toBe(0);
    }
  });

  test("volunteer maintenance log submit is rejected by RLS, no maintenance_logs row created", async ({
    page,
  }) => {
    await loginAs(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
    await page.goto("/protected/daily-operations");
    await page.getByRole("button", { name: "Maintenance" }).click();
    await page.getByLabel("System").selectOption(String(grahamSystemId));
    await page.getByLabel("Notes").fill(`${TAG} maintenance`);
    await page.getByRole("button", { name: "Save maintenance log" }).click();
    await expect(page.getByText(/row-level security|permission denied/i)).toBeVisible();
    if (db) {
      const rows = dbQuery(
        `select id from core.maintenance_logs where notes = '${TAG} maintenance'`,
      );
      expect(rows.length).toBe(0);
    }
  });
});

// Viewer's tier is unchanged by this migration (select-only, before and after) — one
// representative form here, full coverage across all 9 tables in the DB-level matrix
// describe below.
test.describe("viewer remains read-only (operational log RBAC tiers, unchanged)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!VIEWER_PASSWORD, "E2E_TEST_VIEWER_PASSWORD not set");

  test("viewer AM check submit is rejected by RLS, no daily_checks row created", async ({
    page,
  }) => {
    const TAG = `e2e-rbac-viewer-blocked-${Date.now()}`;
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD);
    const systemRows = db
      ? dbQuery(`select id from core.systems where name = 'Graham'`)
      : [];
    const grahamSystemId = Number(systemRows[0]?.id) || "";
    await page.goto(`/protected/checks/new?system=${grahamSystemId}&type=AM`);
    await page.getByLabel("Notes").fill(`${TAG} AM check`);
    await page.getByLabel("Temperature (°C)").fill("12.5");
    await page.getByRole("button", { name: "Save check" }).click();
    await expect(page.getByText(/row-level security|permission denied/i)).toBeVisible();
    await expect(page).toHaveURL(/\/protected\/checks\/new/);
    if (db) {
      const rows = dbQuery(
        `select id from core.daily_checks where notes = '${TAG} AM check'`,
      );
      expect(rows.length).toBe(0);
    }
  });

  test("viewer sees the Today dashboard (read access intact) but no Admin link", async ({
    page,
  }) => {
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD);
    await page.goto("/protected/today");
    await expect(page.getByText(/pending admin approval/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  });
});

// DB-level matrix across every table touched by the migration. Necessary because the app
// has no edit/delete UI at all yet (only */new create routes exist for every log type —
// see app/protected/{checks,feeding,water-quality,chemical-additions,
// health-observations}/new and the daily-operations Maintenance tab), so UPDATE/DELETE
// permissions can't be exercised by clicking through the app; only by calling PostgREST
// directly as each authenticated role, same as the app's own createClient() would.
// Seeds one row per table as admin (unaffected by this migration, so a safe writer),
// then checks SELECT/UPDATE/DELETE for admin/technician/volunteer/viewer/anonymous
// against that row.
test.describe("operational log RBAC tiers: SELECT/UPDATE/DELETE matrix (DB-level)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!db, "SUPABASE_SERVICE_ROLE_KEY not set");
  test.skip(!ADMIN_PASSWORD, "E2E_TEST_ADMIN_PASSWORD not set");
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");
  test.skip(!VOLUNTEER_PASSWORD, "E2E_TEST_VOLUNTEER_PASSWORD not set");
  test.skip(!VIEWER_PASSWORD, "E2E_TEST_VIEWER_PASSWORD not set");

  const TAG = `e2e-rbac-matrix-${Date.now()}`;
  let grahamSystemId: number;
  let ssl25AnimalId: number;
  let ssl25TankId: number;

  test.beforeAll(async () => {
    grahamSystemId = Number(
      dbQuery(`select id from core.systems where name = 'Graham'`)[0]?.id,
    );
    const animalRow = dbQuery(
      `select id, tank_id from core.animals where name = 'SSL25'`,
    )[0];
    ssl25AnimalId = Number(animalRow?.id);
    ssl25TankId = Number(animalRow?.tank_id);
  });

  type TableCase = {
    table: string;
    seedSql: (tag: string) => string;
    updatePatch: Record<string, unknown>;
  };

  // seedSql takes a tag so each table can seed two independent rows: one for the
  // select/update matrix (never deleted until admin's final check) and one dedicated to
  // proving technician's new DELETE grant without touching the matrix row.
  const tableCases: TableCase[] = [
    {
      table: "daily_checks",
      seedSql: (tag) => `insert into core.daily_checks (system_id, check_type, water_running, notes)
        values (${grahamSystemId ?? "null"}, 'AM', true, '${tag}') returning id`,
      updatePatch: { notes: `${TAG} daily_checks updated` },
    },
    {
      table: "water_quality_readings",
      seedSql: (tag) => `insert into core.water_quality_readings (system_id, ph_source, ph, notes)
        values (${grahamSystemId ?? "null"}, 'manual', 8.1, '${tag}') returning id`,
      updatePatch: { notes: `${TAG} water_quality_readings updated` },
    },
    {
      table: "chemical_additions",
      seedSql: (tag) => `insert into core.chemical_additions (system_id, chemical_name, amount, unit, reason)
        values (${grahamSystemId ?? "null"}, '${TAG} chem', 1, 'mL', '${tag}') returning id`,
      updatePatch: { reason: `${TAG} chemical_additions updated` },
    },
    {
      table: "health_observations",
      seedSql: (tag) => `insert into core.health_observations (animal_id, tank_id, severity, notes)
        values (${ssl25AnimalId ?? "null"}, ${ssl25TankId ?? "null"}, 'low', '${tag}') returning id`,
      updatePatch: { notes: `${TAG} health_observations updated` },
    },
    {
      table: "feeding_logs",
      seedSql: (tag) => `insert into core.feeding_logs (tank_id, animal_id, food_type, amount, notes)
        values (${ssl25TankId ?? "null"}, ${ssl25AnimalId ?? "null"}, 'krill', '1 krill', '${tag}') returning id`,
      updatePatch: { notes: `${TAG} feeding_logs updated` },
    },
    {
      table: "maintenance_logs",
      seedSql: (tag) => `insert into core.maintenance_logs (system_id, notes)
        values (${grahamSystemId ?? "null"}, '${tag}') returning id`,
      updatePatch: { notes: `${TAG} maintenance_logs updated` },
    },
    {
      table: "attachments",
      seedSql: (tag) => `insert into core.attachments (parent_table, parent_id, storage_path)
        values ('health_observations', 0, '${tag}') returning id`,
      updatePatch: { storage_path: `${TAG} attachments updated` },
    },
  ];

  const roles = ["admin", "technician", "volunteer", "viewer", "anonymous"] as const;
  // Expected matrix per role, matching the migration's stated tiers.
  const expected: Record<
    (typeof roles)[number],
    { select: boolean; update: boolean; delete: boolean }
  > = {
    admin: { select: true, update: true, delete: true },
    technician: { select: true, update: true, delete: true }, // NEW: was insert+read only
    volunteer: { select: true, update: true, delete: false }, // NEW: was insert+read, no update
    viewer: { select: true, update: false, delete: false }, // unchanged
    anonymous: { select: false, update: false, delete: false }, // unchanged
  };

  const roleCreds: Record<(typeof roles)[number], { email: string; password: string }> = {
    admin: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    technician: { email: TECH_EMAIL, password: TECH_PASSWORD },
    volunteer: { email: VOLUNTEER_EMAIL, password: VOLUNTEER_PASSWORD },
    viewer: { email: VIEWER_EMAIL, password: VIEWER_PASSWORD },
    anonymous: { email: "", password: "" },
  };

  for (const tc of tableCases) {
    test.describe(`core.${tc.table}`, () => {
      test.describe.configure({ mode: "serial" });
      let rowId: number;
      let techDeleteRowId: number;

      test.beforeAll(async () => {
        rowId = Number(dbQuery(tc.seedSql(TAG))[0]?.id);
        expect(rowId).toBeGreaterThan(0);
        techDeleteRowId = Number(dbQuery(tc.seedSql(`${TAG}-tech-delete`))[0]?.id);
        expect(techDeleteRowId).toBeGreaterThan(0);
      });

      for (const role of roles) {
        test(`${role}: select=${expected[role].select}, update=${expected[role].update}, delete=${expected[role].delete}`, async () => {
          const client =
            role === "anonymous"
              ? anonRoleClient()
              : await signInRoleClient(roleCreds[role].email, roleCreds[role].password);

          const { data: selectData, error: selectError } = await client
            .from(tc.table)
            .select("id")
            .eq("id", rowId)
            .maybeSingle();
          if (expected[role].select) {
            expect(selectError).toBeNull();
            expect(selectData?.id).toBe(rowId);
          } else {
            // RLS with no matching policy returns an empty result set, not an error.
            expect(selectData).toBeNull();
          }

          const { data: updateData, error: updateError } = await client
            .from(tc.table)
            .update(tc.updatePatch)
            .eq("id", rowId)
            .select("id")
            .maybeSingle();
          if (expected[role].update) {
            expect(updateError).toBeNull();
            expect(updateData?.id).toBe(rowId);
          } else {
            expect(updateData).toBeNull();
          }

          // Only actually attempt DELETE for a role the matrix says should be denied —
          // deleting the row would break every subsequent role's checks in this table's
          // sub-describe. The two roles allowed to delete (technician, admin) are
          // exercised in their own dedicated tests below instead, against separate rows.
          if (!expected[role].delete) {
            const { data: deleteData } = await client
              .from(tc.table)
              .delete()
              .eq("id", rowId)
              .select("id")
              .maybeSingle();
            expect(deleteData).toBeNull();
          }
        });
      }

      test(`technician can delete a core.${tc.table} row (independent row, NEW grant)`, async () => {
        const client = await signInRoleClient(TECH_EMAIL, TECH_PASSWORD);
        const { data, error } = await client
          .from(tc.table)
          .delete()
          .eq("id", techDeleteRowId)
          .select("id")
          .maybeSingle();
        expect(error).toBeNull();
        expect(data?.id).toBe(techDeleteRowId);

        const remaining = dbQuery(
          `select id from core.${tc.table} where id = ${techDeleteRowId}`,
        );
        expect(remaining.length).toBe(0);
      });

      test(`admin can delete the core.${tc.table} matrix row (exercised last)`, async () => {
        const client = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
        const { data, error } = await client
          .from(tc.table)
          .delete()
          .eq("id", rowId)
          .select("id")
          .maybeSingle();
        expect(error).toBeNull();
        expect(data?.id).toBe(rowId);

        const remaining = dbQuery(
          `select id from core.${tc.table} where id = ${rowId}`,
        );
        expect(remaining.length).toBe(0);
      });
    });
  }
});

// RLS/GRANT rebuild verification (native-role model, supabase/migrations/
// 20260910130000_native_role_grants.sql). Re-enabling RLS on every core table plus
// re-granting the integer-PK sequences is exactly the kind of change that can silently
// break INSERTs ("permission denied for sequence <t>_id_seq" or "new row violates
// row-level security policy"). This suite drives all six daily-logging forms end to end
// as a full-access role and confirms each write both (a) redirected on success — proving
// the INSERT cleared RLS + the sequence grant, since the form otherwise stays put and
// surfaces the raw PostgREST error — and (b) actually landed in schema `core`, read back
// via the postgres-role dbQuery path (service_role can't read `core`; see ../SKILL.md).
// Unlike the existing suites above, ID lookup here does NOT require a service-role client,
// so it runs even when SUPABASE_SERVICE_ROLE_KEY is unset.
function rlsRebuildWriteSuite(
  label: string,
  signIn: (page: Page) => Promise<void>,
  tag: string,
) {
  test.describe(`RLS rebuild: ${label} writes land in core`, () => {
    test.describe.configure({ mode: "serial" });

    let grahamSystemId: number;
    let ssl25AnimalId: number;

    test.beforeAll(async () => {
      grahamSystemId = Number(
        dbQuery(`select id from core.systems where name = 'Graham'`)[0]?.id,
      );
      ssl25AnimalId = Number(
        dbQuery(`select id from core.animals where name = 'SSL25'`)[0]?.id,
      );
      expect(grahamSystemId).toBeGreaterThan(0);
      expect(ssl25AnimalId).toBeGreaterThan(0);
    });

    test(`${label} signs in and lands in the protected app`, async ({ page }) => {
      await signIn(page);
      await expect(page).toHaveURL(/\/protected/);
    });

    test(`${label} AM check INSERT lands in core.daily_checks`, async ({ page }) => {
      await signIn(page);
      await page.goto(`/protected/checks/new?system=${grahamSystemId}&type=AM`);
      await page.getByLabel("Notes").fill(`${tag} AM check`);
      await page.getByLabel("Temperature (°C)").fill("12.5");
      await page.getByRole("button", { name: "Save check" }).click();
      await expect(page).toHaveURL(/\/protected\/home/);

      const rows = dbQuery(
        `select system_id, check_type, water_running, temperature, checked_at
         from core.daily_checks where notes = '${tag} AM check'`,
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0]?.system_id)).toBe(grahamSystemId);
      expect(rows[0]?.check_type).toBe("AM");
      expect(rows[0]?.water_running).toBe(true);
      expect(Number(rows[0]?.temperature)).toBe(12.5);
      expect(localDateOf(rows[0]?.checked_at as string)).toBe(todayDateString());
    });

    test(`${label} feeding INSERT lands in core.feeding_logs`, async ({ page }) => {
      await signIn(page);
      await page.goto("/protected/feeding/new");
      await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
      await page.getByRole("button", { name: "Krill" }).click();
      await page.getByLabel("Amount").fill("2 krill");
      await page.getByLabel("Notes").fill(`${tag} feeding`);
      await page.getByRole("button", { name: "Save feeding" }).click();
      await expect(page).toHaveURL(/\/protected\/home/);

      const rows = dbQuery(
        `select animal_id, food_type, amount, consumption_status
         from core.feeding_logs where notes = '${tag} feeding'`,
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0]?.animal_id)).toBe(ssl25AnimalId);
      expect(rows[0]?.food_type).toBe("krill");
      expect(rows[0]?.amount).toBe("2 krill");
      expect(rows[0]?.consumption_status).toBeNull();
    });

    test(`${label} PM check consumption follow-up UPDATEs the same feeding_logs row`, async ({
      page,
    }) => {
      await signIn(page);
      await page.goto(`/protected/checks/new?system=${grahamSystemId}&type=PM`);
      await expect(page.getByText("Consumption follow-up")).toBeVisible();
      await page.getByRole("button", { name: "Full", exact: true }).click();
      await page.getByLabel("Notes").fill(`${tag} PM check`);
      await page.getByRole("button", { name: "Save check" }).click();
      await expect(page).toHaveURL(/\/protected\/home/);

      const check = dbQuery(
        `select check_type from core.daily_checks where notes = '${tag} PM check'`,
      );
      expect(check[0]?.check_type).toBe("PM");
      const feeding = dbQuery(
        `select consumption_status, consumption_checked_at
         from core.feeding_logs where notes = '${tag} feeding'`,
      );
      expect(feeding[0]?.consumption_status).toBe("full");
      expect(feeding[0]?.consumption_checked_at).not.toBeNull();
    });

    test(`${label} water quality INSERT lands in core.water_quality_readings`, async ({
      page,
    }) => {
      await signIn(page);
      await page.goto(`/protected/water-quality/new?system=${grahamSystemId}`);
      await page.getByRole("button", { name: "Apex probe" }).click();
      await page.getByLabel("pH", { exact: true }).fill("8.1");
      await page.getByLabel("Magnesium").fill("1300");
      await page.getByLabel("Ammonia").fill("0");
      await page.getByLabel("Alkalinity").fill("9");
      await page.getByLabel("Calcium").fill("420");
      await page.getByLabel("Phosphate").fill("0.02");
      await page.getByLabel("Salinity").fill("32");
      await page.getByLabel("Notes").fill(`${tag} water quality`);
      await page.getByRole("button", { name: "Save reading" }).click();
      await expect(page).toHaveURL(/\/protected\/home/);

      const rows = dbQuery(
        `select system_id, ph_source, ph, salinity
         from core.water_quality_readings where notes = '${tag} water quality'`,
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0]?.system_id)).toBe(grahamSystemId);
      expect(rows[0]?.ph_source).toBe("apex_probe");
      expect(Number(rows[0]?.ph)).toBe(8.1);
      expect(Number(rows[0]?.salinity)).toBe(32);
    });

    test(`${label} chemical addition INSERT lands in core.chemical_additions`, async ({
      page,
    }) => {
      await signIn(page);
      await page.goto(`/protected/chemical-additions/new?system=${grahamSystemId}`);
      await page.getByLabel("Chemical").fill(`${tag} baking soda`);
      await page.getByLabel("Amount").fill("50");
      await page.getByLabel("Unit").fill("mL");
      await page.getByLabel("Reason").fill(`${tag} chemical addition`);
      await page.getByRole("button", { name: "Save addition" }).click();
      await expect(page).toHaveURL(/\/protected\/(today|home)/);

      const rows = dbQuery(
        `select system_id, chemical_name, amount, unit
         from core.chemical_additions where reason = '${tag} chemical addition'`,
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0]?.system_id)).toBe(grahamSystemId);
      expect(rows[0]?.chemical_name).toBe(`${tag} baking soda`);
      expect(Number(rows[0]?.amount)).toBe(50);
      expect(rows[0]?.unit).toBe("mL");
    });

    test(`${label} health observation INSERT lands in core.health_observations`, async ({
      page,
    }) => {
      await signIn(page);
      await page.goto("/protected/health-observations/new");
      await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
      await page.getByRole("button", { name: "Low" }).click();
      await page.getByLabel("Notes").fill(`${tag} health obs`);
      await page.getByRole("button", { name: "Save observation" }).click();
      await expect(page).toHaveURL(/\/protected\/(today|home)/);

      const rows = dbQuery(
        `select animal_id, severity from core.health_observations
         where notes = '${tag} health obs'`,
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0]?.animal_id)).toBe(ssl25AnimalId);
      expect(rows[0]?.severity).toBe("low");
    });

    test(`${label} maintenance INSERT lands in core.maintenance_logs`, async ({
      page,
    }) => {
      await signIn(page);
      await page.goto("/protected/daily-operations");
      await page.getByRole("button", { name: "Maintenance" }).click();
      await page.getByLabel("System", { exact: true }).selectOption(String(grahamSystemId));
      await page.getByLabel("Notes").fill(`${tag} maintenance`);
      await page.getByRole("button", { name: "Save maintenance log" }).click();
      await expect(page).toHaveURL(/\/protected\/home/);

      const rows = dbQuery(
        `select system_id, performed_at from core.maintenance_logs
         where notes = '${tag} maintenance'`,
      );
      expect(rows.length).toBe(1);
      expect(Number(rows[0]?.system_id)).toBe(grahamSystemId);
      expect(localDateOf(rows[0]?.performed_at as string)).toBe(todayDateString());
    });

    test(`${label} reads: Home dashboard renders (agenda reads clear RLS)`, async ({
      page,
    }) => {
      await signIn(page);
      await page.goto("/protected/home");
      await expect(page).toHaveURL(/\/protected\/home/);
      await expect(page.getByRole("heading", { name: "Home", level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: "Agenda" })).toBeVisible();
      await expect(page.getByText(/pending admin approval/i)).toHaveCount(0);
    });

    test(`${label} reads: history page renders`, async ({ page }) => {
      await signIn(page);
      await page.goto("/protected/history");
      await expect(page).toHaveURL(/\/protected\/history/);
      await expect(page.getByText(/pending admin approval/i)).toHaveCount(0);
    });
  });
}

rlsRebuildWriteSuite(
  "technician",
  async (page) => {
    test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");
    await loginAs(page, TECH_EMAIL, TECH_PASSWORD);
  },
  `e2e-rls-tech-${Date.now()}`,
);

rlsRebuildWriteSuite(
  "admin",
  async (page) => {
    test.skip(!ADMIN_PASSWORD, "E2E_TEST_ADMIN_PASSWORD not set");
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  },
  `e2e-rls-admin-${Date.now()}`,
);

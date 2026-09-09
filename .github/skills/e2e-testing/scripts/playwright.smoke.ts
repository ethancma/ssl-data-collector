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

async function login(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(TECH_EMAIL);
  await page.getByLabel("Password").fill(TECH_PASSWORD);
  await page.getByRole("button", { name: /login/i }).click();
  await expect(page).toHaveURL(/\/protected/);
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /login/i }).click();
  await expect(page).toHaveURL(/\/protected/);
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

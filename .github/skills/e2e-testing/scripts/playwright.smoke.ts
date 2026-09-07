/**
 * E2E smoke test skeleton for the SSL Data Collection app.
 * Extend per-feature rather than rewriting; see ../SKILL.md for the full procedure
 * and ../references/test-accounts.md for which accounts to use.
 *
 * Assumes: dev server already running on http://localhost:3000 (never started/stopped
 * by this script — see AGENTS.md).
 */
import { test, expect } from "@playwright/test";
// TODO: once a Supabase server client helper exists in the app, import it here instead
// of hand-rolling a client, so this script authenticates the same way the app does.
// import { createServiceRoleClient } from "../../../../lib/supabase/service-role";

const BASE_URL = "http://localhost:3000";

test.describe("e2e smoke", () => {
  test("technician can log an AM/PM check end to end", async ({ page }) => {
    await page.goto(BASE_URL);

    // 1. Sign in as the seeded technician test account.
    // TODO: replace with the app's real sign-in flow once it exists.
    await page.getByRole("link", { name: /sign in/i }).click();
    await page.getByLabel(/email/i).fill("test-tech@ssl.dev");
    await page.getByLabel(/password/i).fill(process.env.E2E_TEST_TECH_PASSWORD ?? "");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/dashboard|today/i);

    // 2. Navigate to a system's AM/PM check form and submit one.
    await page.getByRole("link", { name: /graham/i }).click();
    await page.getByRole("button", { name: /am check|log check/i }).click();
    await page.getByLabel(/water running/i).check();
    await page.getByLabel(/temperature/i).fill("58");
    await page.getByRole("button", { name: /submit|save/i }).click();
    await expect(page.getByText(/saved|logged/i)).toBeVisible();

    // 3. Confirm the "Today" dashboard reflects it as done.
    await page.getByRole("link", { name: /today/i }).click();
    await expect(page.getByText(/graham.*am check.*done/i)).toBeVisible();

    // 4. Confirm the row actually exists in Supabase (not just the UI).
    // TODO: query `daily_checks` via a service-role Supabase client here and assert
    // system_id/check_type/water_running/temperature match what was submitted.
  });
});

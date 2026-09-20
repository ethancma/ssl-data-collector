/**
 * RLS/GRANT rebuild regression (supabase/migrations/20260910130000_native_role_grants.sql):
 * drives all six daily-logging forms end to end as technician and as admin, confirming
 * each write both redirects on success and lands in schema `core`. Extend this file (or
 * add another rlsRebuildWriteSuite(...) call) after any RLS/GRANT rebuild on core tables.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  dbQuery,
  loginAs,
  todayDateString,
  localDateOf,
  TECH_EMAIL,
  TECH_PASSWORD,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} from "./helpers";

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

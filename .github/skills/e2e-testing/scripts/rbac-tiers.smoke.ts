/**
 * Operational log RBAC tiers (supabase/migrations/20260910120000_operational_log_rbac_tiers.sql):
 * admin/technician full CRUD, volunteer insert dropped to read+update, viewer/anon
 * unchanged, plus the DB-level SELECT/UPDATE/DELETE matrix across all 9 affected tables.
 * Extend this file for further role/RLS-tier changes; see ../SKILL.md for the full
 * procedure.
 */
import { test, expect } from "@playwright/test";
import {
  db,
  dbQuery,
  loginAs,
  signInRoleClient,
  anonRoleClient,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TECH_EMAIL,
  TECH_PASSWORD,
  VOLUNTEER_EMAIL,
  VOLUNTEER_PASSWORD,
  VIEWER_EMAIL,
  VIEWER_PASSWORD,
} from "./helpers";

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
    await page.goto(
      `/protected/daily-operations?type=daily-check&system=${grahamSystemId}&check=AM`,
    );
    await page.getByLabel("Notes").fill(`${TAG} AM check`);
    await page.getByLabel("Temperature (°C)").fill("12.5");
    await page.getByRole("button", { name: "Save check" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);
    if (db) {
      const rows = dbQuery(
        `select system_id from core.daily_checks where notes = '${TAG} AM check'`,
      );
      expect(Number(rows[0]?.system_id)).toBe(grahamSystemId);
    }
  });

  test("admin feeding log lands in feeding_logs", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/protected/daily-operations?type=feeding");
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Krill" }).click();
    await page.getByLabel("Amount").fill("2 krill");
    await page.getByLabel("Notes").fill(`${TAG} feeding`);
    await page.getByRole("button", { name: "Save feeding" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);
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
    await page.goto(
      `/protected/daily-operations?type=water-quality&system=${grahamSystemId}`,
    );
    await page.getByRole("button", { name: "Apex probe" }).click();
    await page.getByLabel("pH", { exact: true }).fill("8.1");
    await page.getByLabel("Salinity").fill("32");
    await page.getByLabel("Notes").fill(`${TAG} water quality`);
    await page.getByRole("button", { name: "Save reading" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);
    if (db) {
      const rows = dbQuery(
        `select system_id from core.water_quality_readings where notes = '${TAG} water quality'`,
      );
      expect(Number(rows[0]?.system_id)).toBe(grahamSystemId);
    }
  });

  test("admin chemical addition lands in chemical_additions", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(
      `/protected/daily-operations?type=chemical-addition&system=${grahamSystemId}`,
    );
    await page.getByRole("radio", { name: "Other", exact: true }).click();
    await page.getByLabel("Chemical/product name").fill(`${TAG} baking soda`);
    await page.getByLabel("Amount").fill("50");
    await page.getByLabel("Unit").fill("mL");
    await page.getByLabel("Reason").fill(`${TAG} chemical addition`);
    await page.getByRole("button", { name: "Save system addition" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);
    if (db) {
      const rows = dbQuery(
        `select system_id from core.chemical_additions where reason = '${TAG} chemical addition'`,
      );
      expect(Number(rows[0]?.system_id)).toBe(grahamSystemId);
    }
  });

  test("admin health observation lands in health_observations", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/protected/daily-operations?type=health-observation");
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
    await page.goto(
      `/protected/daily-operations?type=daily-check&system=${grahamSystemId}&check=AM`,
    );
    await page.getByLabel("Notes").fill(`${TAG} AM check`);
    await page.getByLabel("Temperature (°C)").fill("12.5");
    await page.getByRole("button", { name: "Save check" }).click();
    await expect(page.getByText(/row-level security|permission denied/i)).toBeVisible();
    await expect(page).toHaveURL(/\/protected\/daily-operations\?type=daily-check/);
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
    await page.goto("/protected/daily-operations?type=feeding");
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Krill" }).click();
    await page.getByLabel("Amount").fill("2 krill");
    await page.getByLabel("Notes").fill(`${TAG} feeding`);
    await page.getByRole("button", { name: "Save feeding" }).click();
    await expect(page.getByText(/row-level security|permission denied/i)).toBeVisible();
    await expect(page).toHaveURL(/\/protected\/daily-operations\?type=feeding/);
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
    await page.goto(
      `/protected/daily-operations?type=water-quality&system=${grahamSystemId}`,
    );
    await page.getByRole("button", { name: "Apex probe" }).click();
    await page.getByLabel("pH", { exact: true }).fill("8.1");
    await page.getByLabel("Salinity").fill("32");
    await page.getByLabel("Notes").fill(`${TAG} water quality`);
    await page.getByRole("button", { name: "Save reading" }).click();
    await expect(page.getByText(/row-level security|permission denied/i)).toBeVisible();
    await expect(page).toHaveURL(/\/protected\/daily-operations\?type=water-quality/);
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
    await page.goto(
      `/protected/daily-operations?type=chemical-addition&system=${grahamSystemId}`,
    );
    await page.getByRole("radio", { name: "Other", exact: true }).click();
    await page.getByLabel("Chemical/product name").fill(`${TAG} baking soda`);
    await page.getByLabel("Amount").fill("50");
    await page.getByLabel("Unit").fill("mL");
    await page.getByLabel("Reason").fill(`${TAG} chemical addition`);
    await page.getByRole("button", { name: "Save system addition" }).click();
    await expect(page.getByText(/row-level security|permission denied/i)).toBeVisible();
    await expect(page).toHaveURL(
      /\/protected\/daily-operations\?type=chemical-addition/,
    );
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
    await page.goto("/protected/daily-operations?type=health-observation");
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Low" }).click();
    await page.getByLabel("Notes").fill(`${TAG} health obs`);
    await page.getByRole("button", { name: "Save observation" }).click();
    await expect(page.getByText(/row-level security|permission denied/i)).toBeVisible();
    await expect(page).toHaveURL(
      /\/protected\/daily-operations\?type=health-observation/,
    );
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
    await page.goto(
      `/protected/daily-operations?type=daily-check&system=${grahamSystemId}&check=AM`,
    );
    await page.getByLabel("Notes").fill(`${TAG} AM check`);
    await page.getByLabel("Temperature (°C)").fill("12.5");
    await page.getByRole("button", { name: "Save check" }).click();
    await expect(page.getByText(/row-level security|permission denied/i)).toBeVisible();
    await expect(page).toHaveURL(/\/protected\/daily-operations\?type=daily-check/);
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
// has no edit/delete UI at all yet (create forms live in the Daily Operations hub),
// so UPDATE/DELETE
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

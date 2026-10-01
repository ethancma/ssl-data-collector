/**
 * P0 operational security (supabase/migrations/20260927004309_p0_operational_security.sql):
 * role-based CRUD, server-owned provenance, immutable mutation audit, and protected
 * reference history across all ordinary operational tables.
 */
import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dbQuery,
  collectBrowserFailures,
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
  logSingleFeeding,
} from "./helpers";

type OperationalLogAuditDatabase = {
  core: {
    Tables: {
      operational_log_audit: {
        Row: {
          id: number;
          action: string;
          old_values: unknown;
          new_values: unknown;
          actor_profile_id: number | null;
          table_name: string;
        };
        Insert: Record<string, never>;
        Update: { table_name?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

function withOperationalLogAuditTypes(
  client: ReturnType<typeof anonRoleClient>,
): SupabaseClient<OperationalLogAuditDatabase, "core"> {
  return client as unknown as SupabaseClient<OperationalLogAuditDatabase, "core">;
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

let originalViewerRole: string | null;
let originalViewerStatus: string;

test.beforeAll(async () => {
  const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
  const { data: viewerProfile, error: viewerProfileError } = await adminClient
    .from("profiles")
    .select("role, status")
    .eq("email", VIEWER_EMAIL)
    .single();
  expect(viewerProfileError).toBeNull();
  expect(viewerProfile).toBeTruthy();
  originalViewerRole = viewerProfile?.role === null ? null : String(viewerProfile?.role);
  originalViewerStatus = String(viewerProfile?.status);
  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ role: "viewer", status: "active" })
    .eq("email", VIEWER_EMAIL);
  expect(updateError).toBeNull();
});

test.afterAll(async () => {
  const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
  const { error } = await adminClient
    .from("profiles")
    .update({ role: originalViewerRole, status: originalViewerStatus })
    .eq("email", VIEWER_EMAIL);
  expect(error).toBeNull();
});

test.describe("admin can create logs in every form (operational log RBAC tiers)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!ADMIN_PASSWORD, "E2E_TEST_ADMIN_PASSWORD not set");

  const TAG = `e2e-rbac-admin-${Date.now()}`;
  let grahamSystemId: number;
  let ssl25AnimalId: number;
  let ssl25TankId: number;
  let ssl25SystemId: number;

  test.beforeAll(async () => {
    grahamSystemId = Number(
      dbQuery(`select id from core.systems where name = 'Graham'`)[0]?.id,
    );
    const ssl25 = dbQuery(`select animal.id, animal.tank_id, tank.system_id
      from core.animals animal
      join core.tanks tank on tank.id = animal.tank_id
      where animal.name = 'SSL25'`)[0];
    ssl25AnimalId = Number(ssl25?.id);
    ssl25TankId = Number(ssl25?.tank_id);
    ssl25SystemId = Number(ssl25?.system_id);
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
    const rows = dbQuery(
      `select system_id from core.daily_checks where notes = '${TAG} AM check'`,
    );
    expect(Number(rows[0]?.system_id)).toBe(grahamSystemId);
  });

  test("admin feeding log lands in feeding_logs", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/protected/daily-operations?type=feeding");
    await logSingleFeeding(page, {
      systemId: ssl25SystemId,
      tankId: ssl25TankId,
      animalId: ssl25AnimalId,
      food: "Krill",
      amount: "2",
      unit: "pieces",
      notes: `${TAG} feeding`,
    });
    const rows = dbQuery(
      `select animal_id, food_catalog_id, food_name, amount, amount_value
       from core.feeding_logs where notes = '${TAG} feeding'`,
    );
    const catalogRows = dbQuery(
      `select id from core.food_catalog where name = 'Krill' and is_active`,
    );
    expect(rows).toHaveLength(1);
    expect(catalogRows).toHaveLength(1);
    expect(Number(rows[0]?.animal_id)).toBe(ssl25AnimalId);
    expect(Number(rows[0]?.food_catalog_id)).toBe(Number(catalogRows[0].id));
    expect(rows[0]?.food_name).toBe("Krill");
    expect(rows[0]?.amount).toBeNull();
    expect(Number(rows[0]?.amount_value)).toBe(2);
  });

  test("admin water quality reading lands in water_quality_readings", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(
      `/protected/daily-operations?type=water-quality&system=${grahamSystemId}`,
    );
    await page.getByRole("button", { name: "Apex probe" }).click();
    await page.getByLabel("pH (unitless)", { exact: true }).fill("8.1");
    await page.getByLabel("Salinity").fill("32");
    await page.getByLabel("Notes").fill(`${TAG} water quality`);
    await page.getByRole("button", { name: "Save reading" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);
    const rows = dbQuery(
      `select system_id from core.water_quality_readings where notes = '${TAG} water quality'`,
    );
    expect(Number(rows[0]?.system_id)).toBe(grahamSystemId);
  });

  test("admin chemical addition lands in chemical_additions", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(
      `/protected/daily-operations?type=chemical-addition&system=${grahamSystemId}`,
    );
    await page.getByRole("radio", { name: "Enter manually", exact: true }).click();
    await page.getByLabel("Chemical/product name").fill(`${TAG} baking soda`);
    await page.getByLabel("Amount").fill("50");
    await page.getByLabel("Unit", { exact: true }).selectOption("mL");
    await page.getByLabel("Reason").fill(`${TAG} chemical addition`);
    await page.getByRole("button", { name: "Save system addition" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);
    const rows = dbQuery(
      `select system_id from core.chemical_additions where reason = '${TAG} chemical addition'`,
    );
    expect(Number(rows[0]?.system_id)).toBe(grahamSystemId);
  });

  test("admin health observation lands in health_observations", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/protected/daily-operations?type=health-observation");
    await page.getByLabel("Animal").selectOption(String(ssl25AnimalId));
    await page.getByRole("button", { name: "Low" }).click();
    await page.getByLabel("Notes").fill(`${TAG} health obs`);
    await page.getByRole("button", { name: "Save observation" }).click();
    await expect(page).toHaveURL(/\/protected\/(today|home)/);
    const rows = dbQuery(
      `select animal_id, to_json(issues) as issues
       from core.health_observations where notes = '${TAG} health obs'`,
    );
    expect(Number(rows[0]?.animal_id)).toBe(ssl25AnimalId);
    expect(rows[0]?.issues).toEqual([]);
  });

  test("admin maintenance log lands in maintenance_logs", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/protected/daily-operations?type=maintenance-log");
    await page.getByLabel("System", { exact: true }).selectOption(String(grahamSystemId));
    await page.getByLabel("Sump flush").check();
    await page.getByLabel("Notes").fill(`${TAG} maintenance`);
    await page.getByRole("button", { name: "Save maintenance log" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);
    const rows = dbQuery(
      `select system_id, task_type
       from core.maintenance_logs where notes = '${TAG} maintenance'`,
    );
    expect(Number(rows[0]?.system_id)).toBe(grahamSystemId);
    expect(rows[0]?.task_type).toBe("sump_flush");
  });
});

// Create remains exposed in the current UI for Volunteers. One representative form is
// exercised here; the DB-level matrix below covers INSERT on all seven ordinary tables.
test.describe("volunteer can create ordinary operational logs", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!VOLUNTEER_PASSWORD, "E2E_TEST_VOLUNTEER_PASSWORD not set");

  const TAG = `e2e-rbac-volunteer-create-${Date.now()}`;
  let grahamSystemId: number;
  let volunteerProfileId: number;
  let technicianProfileId: number;
  let feedingAnimalId: number;
  let feedingTankId: number;
  let feedingSystemId: number;

  test.beforeAll(async () => {
    grahamSystemId = Number(
      dbQuery(`select id from core.systems where name = 'Graham'`)[0]?.id,
    );
    volunteerProfileId = Number(
      dbQuery(
        `select id from core.profiles where email = ${sqlLiteral(VOLUNTEER_EMAIL)}`,
      )[0]?.id,
    );
    technicianProfileId = Number(
      dbQuery(
        `select id from core.profiles where email = ${sqlLiteral(TECH_EMAIL)}`,
      )[0]?.id,
    );
    const feedingTarget = dbQuery(`select
      animal.id as animal_id,
      animal.tank_id,
      tank.system_id
      from core.animals as animal
      join core.tanks as tank on tank.id = animal.tank_id
      where animal.status = 'active'
      order by animal.id
      limit 1`)[0];
    feedingAnimalId = Number(feedingTarget?.animal_id);
    feedingTankId = Number(feedingTarget?.tank_id);
    feedingSystemId = Number(feedingTarget?.system_id);
  });

  test("volunteer AM check lands with Volunteer provenance", async ({
    page,
  }) => {
    await loginAs(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
    await page.goto(
      `/protected/daily-operations?type=daily-check&system=${grahamSystemId}&check=AM`,
    );
    await page.getByLabel("Notes").fill(`${TAG} AM check`);
    await page.getByLabel("Temperature (°C)").fill("12.5");
    await page.getByRole("button", { name: "Save check" }).click();
    await expect(page).toHaveURL(/\/protected\/home/);

    const row = dbQuery(`select recorded_by, data_source, entered_at
      from core.daily_checks where notes = ${sqlLiteral(`${TAG} AM check`)}`)[0];
    expect(Number(row?.recorded_by)).toBe(volunteerProfileId);
    expect(row?.data_source).toBe("live");
    expect(Date.parse(String(row?.entered_at))).not.toBeNaN();
  });

  test("volunteer PM follow-up shows only feeding rows they recorded", async ({ page }) => {
    const fixtureRows = dbQuery(`insert into core.feeding_logs
      (tank_id, animal_id, food_catalog_id, amount_value, amount_unit, fed_at, notes, recorded_by)
      values
        (${feedingTankId}, ${feedingAnimalId}, (select id from core.food_catalog where name = 'Krill' and is_active), 1, 'pieces', now(), ${sqlLiteral(`${TAG} own follow-up`)}, ${volunteerProfileId}),
        (${feedingTankId}, ${feedingAnimalId}, (select id from core.food_catalog where name = 'Krill' and is_active), 1, 'pieces', now(), ${sqlLiteral(`${TAG} other follow-up`)}, ${technicianProfileId})
      returning id`);
    const fixtureIds = fixtureRows.map((row) => Number(row.id));
    expect(fixtureIds).toHaveLength(2);
    expect(dbQuery(`select food_name from core.feeding_logs
      where id in (${fixtureIds.join(", ")}) order by id`)).toEqual([
      { food_name: "Krill" }, { food_name: "Krill" },
    ]);

    try {
      const pendingCounts = dbQuery(`select
        count(*) filter (where feeding.recorded_by = ${volunteerProfileId})::int as own_count,
        count(*)::int as total_count
        from core.feeding_logs as feeding
        join core.tanks as tank on tank.id = feeding.tank_id
        where feeding.consumption_status is null
          and feeding.fed_at >= now() - interval '36 hours'
          and (feeding.fed_at at time zone 'America/Los_Angeles')::date =
            (now() at time zone 'America/Los_Angeles')::date
          and tank.system_id = ${feedingSystemId}`)[0];
      const ownCount = Number(pendingCounts?.own_count);
      const totalCount = Number(pendingCounts?.total_count);
      expect(ownCount).toBeGreaterThan(0);
      expect(totalCount).toBeGreaterThan(ownCount);

      await loginAs(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
      await page.goto(
        `/protected/daily-operations?type=daily-check&system=${feedingSystemId}&check=PM`,
      );
      await expect(page.getByText("Consumption follow-up")).toBeVisible();
      await expect(page.getByRole("button", { name: "Full", exact: true })).toHaveCount(
        ownCount,
      );
    } finally {
      dbQuery(`delete from core.feeding_logs where id in (${fixtureIds.join(", ")})`);
    }
  });
});

// Viewer retains read access but is not offered operational write routes. The DB-level
// matrix below covers SELECT and rejected mutations across all seven ordinary tables.
test.describe("viewer remains read-only (operational log RBAC tiers, unchanged)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!VIEWER_PASSWORD, "E2E_TEST_VIEWER_PASSWORD not set");

  test("viewer is not offered Daily Operations and direct access returns not-found", async ({
    page,
  }) => {
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD);
    await page.goto("/protected/home");
    await expect(page.getByRole("link", { name: "Daily Operations" })).toHaveCount(0);

    await page.goto("/protected/daily-operations");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
  });

  test("viewer sees the Today dashboard (read access intact) but no Admin link", async ({
    page,
  }) => {
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD);
    await page.goto("/protected/home");
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await expect(page.getByText(/pending admin approval/i)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  });
});

test.describe("P0 operational security: ownership, provenance, audit, and retention (DB-level)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!ADMIN_PASSWORD, "E2E_TEST_ADMIN_PASSWORD not set");
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");
  test.skip(!VOLUNTEER_PASSWORD, "E2E_TEST_VOLUNTEER_PASSWORD not set");
  test.skip(!VIEWER_PASSWORD, "E2E_TEST_VIEWER_PASSWORD not set");

  const TAG = `e2e-p0-security-${Date.now()}`;
  let grahamSystemId: number;
  let adminProfileId: number;
  let volunteerProfileId: number;
  let volunteerRowId: number;
  let adminRowId: number;
  let updateAuditId: number;
  let deleteAuditId: number;

  test.beforeAll(() => {
    grahamSystemId = Number(
      dbQuery(`select id from core.systems where name = 'Graham'`)[0]?.id,
    );
    adminProfileId = Number(
      dbQuery(
        `select id from core.profiles where email = ${sqlLiteral(ADMIN_EMAIL)}`,
      )[0]?.id,
    );
    volunteerProfileId = Number(
      dbQuery(
        `select id from core.profiles where email = ${sqlLiteral(VOLUNTEER_EMAIL)}`,
      )[0]?.id,
    );
    expect(grahamSystemId).toBeGreaterThan(0);
    expect(adminProfileId).toBeGreaterThan(0);
    expect(volunteerProfileId).toBeGreaterThan(0);
  });

  test("live direct insert overrides spoofed provenance", async () => {
    const volunteerClient = await signInRoleClient(
      VOLUNTEER_EMAIL,
      VOLUNTEER_PASSWORD,
    );
    const submittedAfter = Date.now();
    const { data, error } = await volunteerClient
      .from("daily_checks")
      .insert({
        system_id: grahamSystemId,
        check_type: "AM",
        water_running: true,
        notes: `${TAG} volunteer owned`,
        recorded_by: adminProfileId,
        entered_at: "2000-01-01T00:00:00.000Z",
        data_source: "paper_backfill",
      })
      .select("id, recorded_by, entered_at, data_source")
      .single();

    expect(error).toBeNull();
    volunteerRowId = Number(data?.id);
    expect(volunteerRowId).toBeGreaterThan(0);
    expect(Number(data?.recorded_by)).toBe(volunteerProfileId);
    expect(data?.data_source).toBe("live");
    const enteredAt = Date.parse(String(data?.entered_at));
    expect(enteredAt).toBeGreaterThanOrEqual(submittedAfter - 5_000);
    expect(enteredAt).toBeLessThanOrEqual(Date.now() + 5_000);
  });

  test("Volunteer updates only their own row and cannot delete", async () => {
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const volunteerClient = await signInRoleClient(
      VOLUNTEER_EMAIL,
      VOLUNTEER_PASSWORD,
    );
    const { data: adminRow, error: adminInsertError } = await adminClient
      .from("daily_checks")
      .insert({
        system_id: grahamSystemId,
        check_type: "PM",
        water_running: true,
        notes: `${TAG} admin owned`,
      })
      .select("id")
      .single();
    expect(adminInsertError).toBeNull();
    adminRowId = Number(adminRow?.id);

    const { data: ownUpdate, error: ownUpdateError } = await volunteerClient
      .from("daily_checks")
      .update({ notes: `${TAG} volunteer updated own` })
      .eq("id", volunteerRowId)
      .select("id, notes")
      .single();
    expect(ownUpdateError).toBeNull();
    expect(ownUpdate).toMatchObject({
      id: volunteerRowId,
      notes: `${TAG} volunteer updated own`,
    });

    const { data: otherUpdate, error: otherUpdateError } = await volunteerClient
      .from("daily_checks")
      .update({ notes: `${TAG} forbidden volunteer update` })
      .eq("id", adminRowId)
      .select("id")
      .maybeSingle();
    expect(otherUpdateError).toBeNull();
    expect(otherUpdate).toBeNull();
    expect(
      dbQuery(`select notes from core.daily_checks where id = ${adminRowId}`)[0]
        ?.notes,
    ).toBe(`${TAG} admin owned`);

    const { data: deleted, error: deleteError } = await volunteerClient
      .from("daily_checks")
      .delete()
      .eq("id", volunteerRowId)
      .select("id")
      .maybeSingle();
    expect(deleteError).not.toBeNull();
    expect(deleted).toBeNull();
    expect(
      dbQuery(`select id from core.daily_checks where id = ${volunteerRowId}`),
    ).toHaveLength(1);
  });

  test("Volunteer ownership has no time or data_source restriction", async () => {
    const historicalRowId = Number(
      dbQuery(`insert into core.daily_checks
        (system_id, check_type, water_running, notes, recorded_by, entered_at, data_source)
        values (
          ${grahamSystemId},
          'AM',
          true,
          ${sqlLiteral(`${TAG} historical volunteer owned`)},
          ${volunteerProfileId},
          now() - interval '2 years',
          'paper_backfill'
        )
        returning id`)[0]?.id,
    );
    expect(historicalRowId).toBeGreaterThan(0);

    try {
      const volunteerClient = await signInRoleClient(
        VOLUNTEER_EMAIL,
        VOLUNTEER_PASSWORD,
      );
      const { data, error } = await volunteerClient
        .from("daily_checks")
        .update({ notes: `${TAG} historical volunteer updated` })
        .eq("id", historicalRowId)
        .select("id, notes, recorded_by, entered_at, data_source")
        .single();

      expect(error).toBeNull();
      expect(data).toMatchObject({
        id: historicalRowId,
        notes: `${TAG} historical volunteer updated`,
        recorded_by: volunteerProfileId,
        data_source: "paper_backfill",
      });
      expect(Date.parse(String(data?.entered_at))).toBeLessThan(
        Date.now() - 365 * 24 * 60 * 60 * 1_000,
      );
    } finally {
      dbQuery(`delete from core.daily_checks where id = ${historicalRowId}`);
    }
  });

  test("recorded_by, entered_at, and data_source are immutable", async () => {
    const volunteerClient = await signInRoleClient(
      VOLUNTEER_EMAIL,
      VOLUNTEER_PASSWORD,
    );
    const forbiddenPatches = [
      { recorded_by: adminProfileId },
      { entered_at: "2000-01-01T00:00:00.000Z" },
      { data_source: "paper_backfill" },
    ];

    for (const patch of forbiddenPatches) {
      const { error } = await volunteerClient
        .from("daily_checks")
        .update(patch)
        .eq("id", volunteerRowId)
        .select("id")
        .maybeSingle();
      expect(error).not.toBeNull();
    }

    const row = dbQuery(`select recorded_by, data_source, entered_at
      from core.daily_checks where id = ${volunteerRowId}`)[0];
    expect(Number(row?.recorded_by)).toBe(volunteerProfileId);
    expect(row?.data_source).toBe("live");
    expect(String(row?.entered_at)).not.toBe("2000-01-01T00:00:00+00:00");
  });

  test("update and delete audits preserve actor and snapshots", async () => {
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const { data: deleted, error: deleteError } = await adminClient
      .from("daily_checks")
      .delete()
      .eq("id", adminRowId)
      .select("id")
      .single();
    expect(deleteError).toBeNull();
    expect(Number(deleted?.id)).toBe(adminRowId);

    const auditRows = dbQuery(`select
        id, row_id, action, actor_profile_id, database_actor,
        old_values ->> 'notes' as old_notes,
        new_values ->> 'notes' as new_notes
      from core.operational_log_audit
      where table_name = 'daily_checks'
        and row_id in (${volunteerRowId}, ${adminRowId})
      order by id`);
    const updateAudit = auditRows.find(
      (row) => row.action === "UPDATE" && Number(row.row_id) === volunteerRowId,
    );
    const deleteAudit = auditRows.find(
      (row) => row.action === "DELETE" && Number(row.row_id) === adminRowId,
    );
    expect(updateAudit).toMatchObject({
      old_notes: `${TAG} volunteer owned`,
      new_notes: `${TAG} volunteer updated own`,
    });
    expect(Number(updateAudit?.actor_profile_id)).toBe(volunteerProfileId);
    expect(String(updateAudit?.database_actor)).not.toBe("");
    expect(deleteAudit).toMatchObject({
      old_notes: `${TAG} admin owned`,
      new_notes: null,
    });
    expect(Number(deleteAudit?.actor_profile_id)).toBe(adminProfileId);
    updateAuditId = Number(updateAudit?.id);
    deleteAuditId = Number(deleteAudit?.id);
  });

  test("Admin and Technician can read audit rows, which remain immutable", async () => {
    const auditReaders = [
      withOperationalLogAuditTypes(
        await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD),
      ),
      withOperationalLogAuditTypes(
        await signInRoleClient(TECH_EMAIL, TECH_PASSWORD),
      ),
    ];
    for (const client of auditReaders) {
      const { data, error } = await client
        .from("operational_log_audit")
        .select("id, action, old_values, new_values, actor_profile_id")
        .in("id", [updateAuditId, deleteAuditId]);
      expect(error).toBeNull();
      expect(data).toHaveLength(2);
    }

    const deniedAuditReaders = [
      withOperationalLogAuditTypes(
        await signInRoleClient(VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD),
      ),
      withOperationalLogAuditTypes(await signInRoleClient(VIEWER_EMAIL, VIEWER_PASSWORD)),
      withOperationalLogAuditTypes(anonRoleClient()),
    ];
    for (const client of deniedAuditReaders) {
      const { data, error } = await client
        .from("operational_log_audit")
        .select("id")
        .limit(1);
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    }

    const adminClient = auditReaders[0];
    const { error: updateError } = await adminClient
      .from("operational_log_audit")
      .update({ table_name: "feeding_logs" })
      .eq("id", updateAuditId);
    expect(updateError).not.toBeNull();
    const { error: deleteError } = await adminClient
      .from("operational_log_audit")
      .delete()
      .eq("id", deleteAuditId);
    expect(deleteError).not.toBeNull();
    expect(
      dbQuery(
        `select id from core.operational_log_audit where id in (${updateAuditId}, ${deleteAuditId})`,
      ),
    ).toHaveLength(2);
  });

  test("system deletion is blocked while operational history exists", () => {
    const rows = dbQuery(`do $block$
      begin
        begin
          delete from core.systems where id = ${grahamSystemId};
          raise exception 'protected parent delete unexpectedly succeeded';
        exception when foreign_key_violation then
          null;
        end;
      end
      $block$;
      select id from core.systems where id = ${grahamSystemId}`);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.id)).toBe(grahamSystemId);
  });
});

test.describe("P0 operational security: Storage object policies (DB-level)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!ADMIN_PASSWORD, "E2E_TEST_ADMIN_PASSWORD not set");
  test.skip(!VOLUNTEER_PASSWORD, "E2E_TEST_VOLUNTEER_PASSWORD not set");

  const TAG = `e2e-p0-storage-${Date.now()}`;
  const volunteerPath = `${TAG}/volunteer-owned.txt`;
  const adminPath = `${TAG}/admin-owned.txt`;
  const unrelatedBucket = `${TAG}-unrelated`;
  const unrelatedFixturePath = "admin-fixture.txt";
  const unrelatedVolunteerPath = "volunteer-denied.txt";

  test.beforeAll(() => {
    dbQuery(`insert into storage.buckets (id, name, public)
      values (${sqlLiteral(unrelatedBucket)}, ${sqlLiteral(unrelatedBucket)}, false)`);
    const fixtureRows = dbQuery(`insert into storage.objects (bucket_id, name, owner_id)
      select ${sqlLiteral(unrelatedBucket)}, ${sqlLiteral(unrelatedFixturePath)},
        profile.auth_user_id::text
      from core.profiles as profile
      where profile.email = ${sqlLiteral(ADMIN_EMAIL)}
      returning id`);
    expect(fixtureRows).toHaveLength(1);
  });

  test.afterAll(async () => {
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    await adminClient.storage.from("attachments").remove([volunteerPath, adminPath]);
    dbQuery(`begin;
      set local session_replication_role = replica;
      delete from storage.objects where bucket_id = ${sqlLiteral(unrelatedBucket)};
      delete from storage.buckets where id = ${sqlLiteral(unrelatedBucket)};
      commit`);
  });

  test("Volunteer can update an object they own in the attachments bucket", async () => {
    const volunteerClient = await signInRoleClient(
      VOLUNTEER_EMAIL,
      VOLUNTEER_PASSWORD,
    );
    const {
      data: { user },
      error: userError,
    } = await volunteerClient.auth.getUser();
    expect(userError).toBeNull();
    expect(user).toBeTruthy();

    const { error: uploadError } = await volunteerClient.storage
      .from("attachments")
      .upload(volunteerPath, new Blob(["before volunteer update"]), {
        contentType: "text/plain",
      });
    expect(uploadError).toBeNull();

    const { data: updated, error: updateError } = await volunteerClient.storage
      .from("attachments")
      .update(volunteerPath, new Blob(["after volunteer update"]), {
        contentType: "text/plain",
      });
    expect(updateError).toBeNull();
    expect(updated?.path).toBe(volunteerPath);

    const objectRows = dbQuery(`select owner_id
      from storage.objects
      where bucket_id = 'attachments' and name = ${sqlLiteral(volunteerPath)}`);
    expect(objectRows).toHaveLength(1);
    expect(objectRows[0]?.owner_id).toBe(user!.id);

    const { data: contents, error: downloadError } = await volunteerClient.storage
      .from("attachments")
      .download(volunteerPath);
    expect(downloadError).toBeNull();
    expect(await contents!.text()).toBe("after volunteer update");
  });

  test("Volunteer cannot update another owner's attachments object", async () => {
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const volunteerClient = await signInRoleClient(
      VOLUNTEER_EMAIL,
      VOLUNTEER_PASSWORD,
    );
    const {
      data: { user: adminUser },
      error: userError,
    } = await adminClient.auth.getUser();
    expect(userError).toBeNull();
    expect(adminUser).toBeTruthy();

    const { error: uploadError } = await adminClient.storage
      .from("attachments")
      .upload(adminPath, new Blob(["admin-owned contents"]), {
        contentType: "text/plain",
      });
    expect(uploadError).toBeNull();

    const { data: updated, error: updateError } = await volunteerClient.storage
      .from("attachments")
      .update(adminPath, new Blob(["forbidden volunteer update"]), {
        contentType: "text/plain",
      });
    expect(updateError).not.toBeNull();
    expect(updated).toBeNull();

    const objectRows = dbQuery(`select owner_id
      from storage.objects
      where bucket_id = 'attachments' and name = ${sqlLiteral(adminPath)}`);
    expect(objectRows).toHaveLength(1);
    expect(objectRows[0]?.owner_id).toBe(adminUser!.id);

    const { data: contents, error: downloadError } = await adminClient.storage
      .from("attachments")
      .download(adminPath);
    expect(downloadError).toBeNull();
    expect(await contents!.text()).toBe("admin-owned contents");
  });

  test("Volunteer receives no custom-policy access to an unrelated bucket", async () => {
    const volunteerClient = await signInRoleClient(
      VOLUNTEER_EMAIL,
      VOLUNTEER_PASSWORD,
    );

    const { data: listed } = await volunteerClient.storage
      .from(unrelatedBucket)
      .list();
    expect(listed?.some((item) => item.name === unrelatedFixturePath) ?? false).toBe(false);

    const { data: downloaded, error: downloadError } = await volunteerClient.storage
      .from(unrelatedBucket)
      .download(unrelatedFixturePath);
    expect(downloadError).not.toBeNull();
    expect(downloaded).toBeNull();

    const { data: uploaded, error: uploadError } = await volunteerClient.storage
      .from(unrelatedBucket)
      .upload(unrelatedVolunteerPath, new Blob(["forbidden upload"]), {
        contentType: "text/plain",
      });
    expect(uploadError).not.toBeNull();
    expect(uploaded).toBeNull();
    expect(
      dbQuery(`select id from storage.objects
        where bucket_id = ${sqlLiteral(unrelatedBucket)}
          and name = ${sqlLiteral(unrelatedVolunteerPath)}`),
    ).toHaveLength(0);
  });
});

// The app has no ordinary-log edit/delete UI, so this matrix calls PostgREST directly
// with the same authenticated clients the app uses.
test.describe("P0 operational security: ordinary-log CRUD matrix (DB-level)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!ADMIN_PASSWORD, "E2E_TEST_ADMIN_PASSWORD not set");
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");
  test.skip(!VOLUNTEER_PASSWORD, "E2E_TEST_VOLUNTEER_PASSWORD not set");
  test.skip(!VIEWER_PASSWORD, "E2E_TEST_VIEWER_PASSWORD not set");

  const TAG = `e2e-rbac-matrix-${Date.now()}`;
  let grahamSystemId: number;
  let ssl25AnimalId: number;
  let ssl25TankId: number;
  let krillCatalogId: number;
  let adminProfileId: number;
  let technicianProfileId: number;

  test.beforeAll(async () => {
    grahamSystemId = Number(
      dbQuery(`select id from core.systems where name = 'Graham'`)[0]?.id,
    );
    const animalRow = dbQuery(
      `select id, tank_id from core.animals where name = 'SSL25'`,
    )[0];
    ssl25AnimalId = Number(animalRow?.id);
    ssl25TankId = Number(animalRow?.tank_id);
    const krillRows = dbQuery(`select id from core.food_catalog
      where name = 'Krill' and is_active`);
    expect(krillRows).toHaveLength(1);
    krillCatalogId = Number(krillRows[0].id);
    adminProfileId = Number(
      dbQuery(
        `select id from core.profiles where email = ${sqlLiteral(ADMIN_EMAIL)}`,
      )[0]?.id,
    );
    technicianProfileId = Number(
      dbQuery(
        `select id from core.profiles where email = ${sqlLiteral(TECH_EMAIL)}`,
      )[0]?.id,
    );
  });

  type TableCase = {
    table: string;
    seedSql: (tag: string, recordedBy: number) => string;
    insertPayload: (tag: string) => Record<string, unknown>;
    updatePatch: Record<string, unknown>;
    selectColumns?: string;
    assertRead?: (row: Record<string, unknown>) => void;
  };

  const tableCases: TableCase[] = [
    {
      table: "daily_checks",
      seedSql: (tag, recordedBy) => `insert into core.daily_checks
        (system_id, check_type, water_running, notes, recorded_by)
        values (${grahamSystemId ?? "null"}, 'AM', true, ${sqlLiteral(tag)}, ${recordedBy}) returning id`,
      insertPayload: (tag) => ({
        system_id: grahamSystemId,
        check_type: "AM",
        water_running: true,
        notes: tag,
      }),
      updatePatch: { notes: `${TAG} daily_checks updated` },
    },
    {
      table: "water_quality_readings",
      seedSql: (tag, recordedBy) => `insert into core.water_quality_readings
        (system_id, ph_source, ph, notes, recorded_by)
        values (${grahamSystemId ?? "null"}, 'manual', 8.1, ${sqlLiteral(tag)}, ${recordedBy}) returning id`,
      insertPayload: (tag) => ({
        system_id: grahamSystemId,
        ph_source: "manual",
        ph: 8.1,
        notes: tag,
      }),
      updatePatch: { notes: `${TAG} water_quality_readings updated` },
    },
    {
      table: "chemical_additions",
      seedSql: (tag, recordedBy) => `insert into core.chemical_additions
        (system_id, chemical_name, amount, unit, reason, recorded_by)
        values (${grahamSystemId ?? "null"}, ${sqlLiteral(`${TAG} chem`)}, 1, 'mL', ${sqlLiteral(tag)}, ${recordedBy}) returning id`,
      insertPayload: (tag) => ({
        system_id: grahamSystemId,
        chemical_name: `${TAG} chem`,
        amount: 1,
        unit: "mL",
        reason: tag,
      }),
      updatePatch: { reason: `${TAG} chemical_additions updated` },
    },
    {
      table: "health_observations",
      seedSql: (tag, recordedBy) => `insert into core.health_observations
        (animal_id, tank_id, severity, issues, notes, recorded_by)
        values (${ssl25AnimalId ?? "null"}, ${ssl25TankId ?? "null"}, 'low', array['lesion', 'arm_curling']::text[], ${sqlLiteral(tag)}, ${recordedBy}) returning id`,
      insertPayload: (tag) => ({
        animal_id: ssl25AnimalId,
        tank_id: ssl25TankId,
        severity: "low",
        issues: ["lesion", "arm_curling"],
        notes: tag,
      }),
      updatePatch: { issues: ["arm_drop", "other"] },
      selectColumns: "id, issues",
      assertRead: (row) => {
        expect([
          ["lesion", "arm_curling"],
          ["arm_drop", "other"],
        ]).toContainEqual(row.issues);
      },
    },
    {
      table: "feeding_logs",
      seedSql: (tag, recordedBy) => `insert into core.feeding_logs
        (tank_id, animal_id, food_catalog_id, amount_value, amount_unit, notes, recorded_by)
        values (${ssl25TankId ?? "null"}, ${ssl25AnimalId ?? "null"}, ${krillCatalogId}, 1, 'pieces', ${sqlLiteral(tag)}, ${recordedBy}) returning id`,
      insertPayload: (tag) => ({
        tank_id: ssl25TankId,
        animal_id: ssl25AnimalId,
        food_catalog_id: krillCatalogId,
        amount_value: 1,
        amount_unit: "pieces",
        notes: tag,
      }),
      updatePatch: { notes: `${TAG} feeding_logs updated` },
      selectColumns: "id, food_catalog_id, food_name",
      assertRead: (row) => {
        expect(Number(row.food_catalog_id)).toBe(krillCatalogId);
        expect(row.food_name).toBe("Krill");
      },
    },
    {
      table: "maintenance_logs",
      seedSql: (tag, recordedBy) => `insert into core.maintenance_logs
        (system_id, task_type, notes, recorded_by)
        values (${grahamSystemId ?? "null"}, 'filter_change', ${sqlLiteral(tag)}, ${recordedBy}) returning id`,
      insertPayload: (tag) => ({
        system_id: grahamSystemId,
        task_type: "filter_change",
        notes: tag,
      }),
      updatePatch: { task_type: "sump_flush" },
      selectColumns: "id, task_type",
      assertRead: (row) => {
        expect(["filter_change", "sump_flush"]).toContain(row.task_type);
      },
    },
    {
      table: "attachments",
      seedSql: (tag, recordedBy) => `insert into core.attachments
        (parent_table, parent_id, storage_path, uploaded_by)
        values ('health_observations', 0, ${sqlLiteral(tag)}, ${recordedBy}) returning id`,
      insertPayload: (tag) => ({
        parent_table: "health_observations",
        parent_id: 0,
        storage_path: tag,
      }),
      updatePatch: { storage_path: `${TAG} attachments updated` },
    },
  ];

  const roles = ["admin", "technician", "volunteer", "viewer", "anonymous"] as const;
  // Expected matrix per role, matching the migration's stated tiers.
  const expected: Record<
    (typeof roles)[number],
    { insert: boolean; select: boolean; update: boolean; delete: boolean }
  > = {
    admin: { insert: true, select: true, update: true, delete: true },
    technician: { insert: true, select: true, update: true, delete: true },
    volunteer: { insert: true, select: true, update: false, delete: false },
    viewer: { insert: false, select: true, update: false, delete: false },
    anonymous: { insert: false, select: false, update: false, delete: false },
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
        rowId = Number(dbQuery(tc.seedSql(TAG, adminProfileId))[0]?.id);
        expect(rowId).toBeGreaterThan(0);
        techDeleteRowId = Number(
          dbQuery(tc.seedSql(`${TAG}-tech-delete`, adminProfileId))[0]?.id,
        );
        expect(techDeleteRowId).toBeGreaterThan(0);
      });

      for (const role of roles) {
        test(`${role}: insert=${expected[role].insert}, select=${expected[role].select}, update-other=${expected[role].update}, delete=${expected[role].delete}`, async () => {
          const client =
            role === "anonymous"
              ? anonRoleClient()
              : await signInRoleClient(roleCreds[role].email, roleCreds[role].password);

          const { data: insertData, error: insertError } = await client
            .from(tc.table)
            .insert(tc.insertPayload(`${TAG}-${tc.table}-${role}-insert`))
            .select("id")
            .maybeSingle();
          const insertedRow = insertData as unknown as Record<string, unknown> | null;
          if (expected[role].insert) {
            expect(insertError).toBeNull();
            expect(Number(insertedRow?.id)).toBeGreaterThan(0);
          } else {
            expect(insertError).not.toBeNull();
            expect(insertData).toBeNull();
          }

          const { data: selectData, error: selectError } = await client
            .from(tc.table)
            .select(tc.selectColumns ?? "id")
            .eq("id", rowId)
            .maybeSingle();
          const selectedRow = selectData as unknown as Record<string, unknown> | null;
          if (expected[role].select) {
            expect(selectError).toBeNull();
            expect(selectedRow?.id).toBe(rowId);
            if (selectedRow) tc.assertRead?.(selectedRow);
          } else {
            // RLS with no matching policy returns an empty result set, not an error.
            expect(selectData).toBeNull();
          }

          const { data: updateData, error: updateError } = await client
            .from(tc.table)
            .update(tc.updatePatch)
            .eq("id", rowId)
            .select(["id", ...Object.keys(tc.updatePatch)].join(","))
            .maybeSingle();
          const updatedRow = updateData as unknown as Record<string, unknown> | null;
          if (expected[role].update) {
            expect(updateError).toBeNull();
            expect(updatedRow?.id).toBe(rowId);
            expect(updatedRow).toMatchObject(tc.updatePatch);
          } else {
            expect(updateData).toBeNull();
          }

          if (!expected[role].delete) {
            const { data: deleteData, error: deleteError } = await client
              .from(tc.table)
              .delete()
              .eq("id", rowId)
              .select("id")
              .maybeSingle();
            expect(deleteData).toBeNull();
            if (role === "volunteer") {
              expect(deleteError).not.toBeNull();
            }
          }
        });
      }

      test(`technician can delete a core.${tc.table} row`, async () => {
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

      test(`core.${tc.table} successful mutations are audited with their actors`, () => {
        const audits = dbQuery(`select row_id, action, actor_profile_id
          from core.operational_log_audit
          where table_name = ${sqlLiteral(tc.table)}
            and row_id in (${rowId}, ${techDeleteRowId})`);
        expect(audits).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              row_id: rowId,
              action: "UPDATE",
              actor_profile_id: adminProfileId,
            }),
            expect.objectContaining({
              row_id: rowId,
              action: "UPDATE",
              actor_profile_id: technicianProfileId,
            }),
            expect.objectContaining({
              row_id: techDeleteRowId,
              action: "DELETE",
              actor_profile_id: technicianProfileId,
            }),
            expect.objectContaining({
              row_id: rowId,
              action: "DELETE",
              actor_profile_id: adminProfileId,
            }),
          ]),
        );
      });
    });
  }
});

test.describe("P1 target and quick-pick management UI by role", () => {
  const roles = [
    {
      name: "Admin",
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      targets: true,
      catalogs: true,
    },
    {
      name: "Technician",
      email: TECH_EMAIL,
      password: TECH_PASSWORD,
      targets: true,
      catalogs: true,
    },
    {
      name: "Volunteer",
      email: VOLUNTEER_EMAIL,
      password: VOLUNTEER_PASSWORD,
      targets: false,
      catalogs: false,
    },
    {
      name: "Viewer",
      email: VIEWER_EMAIL,
      password: VIEWER_PASSWORD,
      targets: false,
      catalogs: false,
    },
  ] as const;

  for (const role of roles) {
    test(`${role.name} sees only the permitted P1 management UI`, async ({ page }) => {
      test.skip(!role.password, `E2E_TEST_${role.name.toUpperCase()}_PASSWORD not set`);
      await loginAs(page, role.email, role.password);
      const browserFailures = role.name === "Admin" ? collectBrowserFailures(page) : null;
      await page.goto("/protected/home");
      await expect(page.getByRole("link", { name: "Water quality targets" })).toHaveCount(
        role.targets ? 1 : 0,
      );
      await expect(page.getByRole("link", { name: "Quick-pick catalogs" })).toHaveCount(
        role.catalogs ? 1 : 0,
      );

      await page.goto("/protected/settings/water-quality-targets");
      if (role.targets) {
        await expect(page.getByRole("heading", { name: "Target ranges" })).toBeVisible();
      } else {
        await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
      }

      if (role.catalogs) {
        await page.getByRole("link", { name: "Quick-pick catalogs" }).click();
        await expect(page).toHaveURL(/\/protected\/settings\/quick-picks$/);
        await expect(
          page.getByRole("heading", { name: "Quick-pick catalogs" }),
        ).toBeVisible();
      } else {
        await page.goto("/protected/settings/quick-picks");
        await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
        await expect(page.getByText(/not authorized/i)).toHaveCount(0);
      }

      if (browserFailures) {
        expect(browserFailures, browserFailures.join("\n")).toEqual([]);
      }
    });
  }
});

test.describe("P1 target-range RBAC matrix DB-level", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!ADMIN_PASSWORD, "E2E_TEST_ADMIN_PASSWORD not set");
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");
  test.skip(!VOLUNTEER_PASSWORD, "E2E_TEST_VOLUNTEER_PASSWORD not set");
  test.skip(!VIEWER_PASSWORD, "E2E_TEST_VIEWER_PASSWORD not set");

  let grahamSystemId: number;
  let wholeySystemId: number;
  const targetIds: number[] = [];
  const readingIds: number[] = [];

  test.beforeAll(async () => {
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const { data, error } = await adminClient
      .from("systems")
      .select("id, name")
      .in("name", ["Graham", "Wholey"]);
    expect(error).toBeNull();
    grahamSystemId = Number(data?.find((system) => system.name === "Graham")?.id);
    wholeySystemId = Number(data?.find((system) => system.name === "Wholey")?.id);
    expect(grahamSystemId).toBeGreaterThan(0);
    expect(wholeySystemId).toBeGreaterThan(0);
  });

  test.afterAll(async () => {
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    if (readingIds.length > 0) {
      const { error } = await adminClient
        .from("water_quality_readings")
        .delete()
        .in("id", readingIds);
      expect(error).toBeNull();
    }
    if (targetIds.length > 0) {
      const { error } = await adminClient
        .from("water_quality_target_ranges")
        .delete()
        .in("id", targetIds);
      expect(error).toBeNull();
    }
  });

  test("target ranges have no seeded values or display_order column", async () => {
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const { data, error } = await adminClient
      .from("water_quality_target_ranges")
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: displayOrder, error: displayOrderError } = await adminClient
      .from("water_quality_target_ranges")
      .select("display_order")
      .limit(1);
    expect(displayOrderError).not.toBeNull();
    expect(displayOrder).toBeNull();
  });

  test("Admin and Technician manage targets while Volunteer and Viewer only read", async () => {
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const technicianClient = await signInRoleClient(TECH_EMAIL, TECH_PASSWORD);
    const volunteerClient = await signInRoleClient(
      VOLUNTEER_EMAIL,
      VOLUNTEER_PASSWORD,
    );
    const viewerClient = await signInRoleClient(VIEWER_EMAIL, VIEWER_PASSWORD);
    const anonymousClient = anonRoleClient();

    const { data: created, error: createError } = await adminClient
      .from("water_quality_target_ranges")
      .insert({
        system_id: grahamSystemId,
        parameter_key: "nitrite",
        min_value: 0,
        max_value: null,
      })
      .select("id")
      .single();
    expect(createError).toBeNull();
    const adminTargetId = Number(created?.id);
    targetIds.push(adminTargetId);
    expect(adminTargetId).toBeGreaterThan(0);

    const { data: technicianCreated, error: technicianCreateError } =
      await technicianClient
        .from("water_quality_target_ranges")
        .insert({
          system_id: grahamSystemId,
          parameter_key: "alkalinity",
          min_value: 7,
          max_value: 12,
        })
        .select("id")
        .single();
    expect(technicianCreateError).toBeNull();
    const technicianTargetId = Number(technicianCreated?.id);
    targetIds.push(technicianTargetId);
    expect(technicianTargetId).toBeGreaterThan(0);

    for (const client of [adminClient, technicianClient, volunteerClient, viewerClient]) {
      const { data, error } = await client
        .from("water_quality_target_ranges")
        .select("id, min_value, max_value")
        .eq("id", adminTargetId)
        .single();
      expect(error).toBeNull();
      expect(Number(data?.id)).toBe(adminTargetId);
    }

    const { data: anonymousRead, error: anonymousReadError } = await anonymousClient
      .from("water_quality_target_ranges")
      .select("id")
      .eq("id", adminTargetId)
      .maybeSingle();
    expect(anonymousReadError).not.toBeNull();
    expect(anonymousRead).toBeNull();

    for (const [role, client] of [
      ["Volunteer", volunteerClient],
      ["Viewer", viewerClient],
      ["Anonymous", anonymousClient],
    ] as const) {
      const { data: inserted, error: insertError } = await client
        .from("water_quality_target_ranges")
        .insert({
          system_id: grahamSystemId,
          parameter_key: "nitrate",
          min_value: 0,
          max_value: 10,
        })
        .select("id")
        .maybeSingle();
      expect(insertError, `${role} insert should fail`).not.toBeNull();
      expect(inserted).toBeNull();

      const { data: updated, error: updateError } = await client
        .from("water_quality_target_ranges")
        .update({ max_value: 100 })
        .eq("id", adminTargetId)
        .select("id")
        .maybeSingle();
      expect(updateError, `${role} update should fail`).not.toBeNull();
      expect(updated).toBeNull();

      const { data: deleted, error: deleteError } = await client
        .from("water_quality_target_ranges")
        .delete()
        .eq("id", adminTargetId)
        .select("id")
        .maybeSingle();
      expect(deleteError, `${role} delete should fail`).not.toBeNull();
      expect(deleted).toBeNull();
    }

    const { data: adminUpdated, error: adminUpdateError } = await adminClient
      .from("water_quality_target_ranges")
      .update({ max_value: 25 })
      .eq("id", adminTargetId)
      .select("id, max_value")
      .single();
    expect(adminUpdateError).toBeNull();
    expect(Number(adminUpdated?.max_value)).toBe(25);

    const { data: technicianUpdated, error: technicianUpdateError } =
      await technicianClient
        .from("water_quality_target_ranges")
        .update({ max_value: 50 })
        .eq("id", adminTargetId)
        .select("id, max_value")
        .single();
    expect(technicianUpdateError).toBeNull();
    expect(Number(technicianUpdated?.max_value)).toBe(50);

    const { data: adminDeleted, error: adminDeleteError } = await adminClient
      .from("water_quality_target_ranges")
      .delete()
      .eq("id", technicianTargetId)
      .select("id")
      .single();
    expect(adminDeleteError).toBeNull();
    expect(Number(adminDeleted?.id)).toBe(technicianTargetId);

    const { data: technicianDeleted, error: technicianDeleteError } =
      await technicianClient
        .from("water_quality_target_ranges")
        .delete()
        .eq("id", adminTargetId)
        .select("id")
        .single();
    expect(technicianDeleteError).toBeNull();
    expect(Number(technicianDeleted?.id)).toBe(adminTargetId);
  });

  test("target range constraints reject invalid and duplicate definitions", async () => {
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const invalidTargets = [
      { parameter_key: "temperature", min_value: 1, max_value: 2 },
      { parameter_key: "phosphate", min_value: null, max_value: null },
      { parameter_key: "salinity", min_value: 35, max_value: 30 },
      { parameter_key: "magnesium", min_value: "NaN", max_value: null },
    ];

    for (const invalidTarget of invalidTargets) {
      const { data, error } = await adminClient
        .from("water_quality_target_ranges")
        .insert(invalidTarget)
        .select("id")
        .maybeSingle();
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    }

    const { data: labTarget, error: labTargetError } = await adminClient
      .from("water_quality_target_ranges")
      .insert({ parameter_key: "nitrate", min_value: 0, max_value: 10 })
      .select("id")
      .single();
    expect(labTargetError).toBeNull();
    const labTargetId = Number(labTarget?.id);
    targetIds.push(labTargetId);

    const { error: duplicateLabError } = await adminClient
      .from("water_quality_target_ranges")
      .insert({ parameter_key: "nitrate", min_value: 1, max_value: 9 });
    expect(duplicateLabError).not.toBeNull();

    const { data: systemTarget, error: systemTargetError } = await adminClient
      .from("water_quality_target_ranges")
      .insert({
        system_id: grahamSystemId,
        parameter_key: "nitrate",
        min_value: 0,
        max_value: 5,
      })
      .select("id")
      .single();
    expect(systemTargetError).toBeNull();
    const systemTargetId = Number(systemTarget?.id);
    targetIds.push(systemTargetId);

    const { error: duplicateSystemError } = await adminClient
      .from("water_quality_target_ranges")
      .insert({
        system_id: grahamSystemId,
        parameter_key: "nitrate",
        min_value: 1,
        max_value: 4,
      });
    expect(duplicateSystemError).not.toBeNull();
  });

  test("system targets take precedence and later changes preserve reading history", async () => {
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const { data: labTarget, error: labTargetError } = await adminClient
      .from("water_quality_target_ranges")
      .insert({ parameter_key: "ph", min_value: 7.5, max_value: 8.5 })
      .select("id")
      .single();
    expect(labTargetError).toBeNull();
    targetIds.push(Number(labTarget?.id));

    const { data: systemTarget, error: systemTargetError } = await adminClient
      .from("water_quality_target_ranges")
      .insert({
        system_id: grahamSystemId,
        parameter_key: "ph",
        min_value: 8,
        max_value: 8.2,
      })
      .select("id")
      .single();
    expect(systemTargetError).toBeNull();
    const systemTargetId = Number(systemTarget?.id);
    targetIds.push(systemTargetId);

    const { data: overridden, error: overriddenError } = await adminClient
      .from("water_quality_readings")
      .insert({ system_id: grahamSystemId, ph_source: "manual", ph: 7.8 })
      .select("id")
      .maybeSingle();
    expect(overriddenError).not.toBeNull();
    expect(overridden).toBeNull();

    const { data: labAccepted, error: labAcceptedError } = await adminClient
      .from("water_quality_readings")
      .insert({ system_id: wholeySystemId, ph_source: "manual", ph: 7.8 })
      .select("id")
      .single();
    expect(labAcceptedError).toBeNull();
    readingIds.push(Number(labAccepted?.id));

    const { data: historical, error: historicalError } = await adminClient
      .from("water_quality_readings")
      .insert({ system_id: grahamSystemId, ph_source: "manual", ph: 8.1 })
      .select("id, ph, notes")
      .single();
    expect(historicalError).toBeNull();
    const historicalId = Number(historical?.id);
    readingIds.push(historicalId);
    expect(historical?.notes).toBeNull();

    const { error: rangeUpdateError } = await adminClient
      .from("water_quality_target_ranges")
      .update({ min_value: 8.3, max_value: 8.4 })
      .eq("id", systemTargetId);
    expect(rangeUpdateError).toBeNull();

    const { data: preserved, error: preservedError } = await adminClient
      .from("water_quality_readings")
      .select("id, ph, notes")
      .eq("id", historicalId)
      .single();
    expect(preservedError).toBeNull();
    expect(preserved).toMatchObject({ id: historicalId, ph: 8.1, notes: null });

    const { data: newlyOutOfRange, error: newlyOutOfRangeError } = await adminClient
      .from("water_quality_readings")
      .insert({ system_id: grahamSystemId, ph_source: "manual", ph: 8.1 })
      .select("id")
      .maybeSingle();
    expect(newlyOutOfRangeError).not.toBeNull();
    expect(newlyOutOfRange).toBeNull();
  });
});

test.describe("P1 quick-pick catalog RBAC matrix (DB-level)", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!ADMIN_PASSWORD, "E2E_TEST_ADMIN_PASSWORD not set");
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");
  test.skip(!VOLUNTEER_PASSWORD, "E2E_TEST_VOLUNTEER_PASSWORD not set");
  test.skip(!VIEWER_PASSWORD, "E2E_TEST_VIEWER_PASSWORD not set");

  const tag = `e2e-p1-catalog-rbac-${Date.now()}`;
  const catalogCases = [
    {
      table: "chemical_addition_catalog",
      create: { name: `${tag} chemical`, default_unit: "mL" },
      update: { name: `${tag} chemical renamed` },
    },
    {
      table: "star_treatment_catalog",
      create: {
        name: `${tag} star`,
        default_amount_unit: null,
        default_concentration_unit: null,
      },
      update: { name: `${tag} star renamed` },
    },
    {
      table: "food_catalog",
      create: { name: `${tag} food`, default_unit: "pieces" },
      update: { name: `${tag} food renamed` },
    },
  ] as const;

  test.afterAll(async () => {
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const { data: starTreatments, error: starTreatmentsError } = await adminClient
      .from("star_treatments")
      .select("id")
      .like("notes", `${tag}%`);
    expect(starTreatmentsError).toBeNull();
    for (const treatment of starTreatments ?? []) {
      const { error } = await adminClient.rpc("hard_delete_star_treatment", {
        p_treatment_id: Number(treatment.id),
      });
      expect(error).toBeNull();
    }
    const { error: additionsCleanupError } = await adminClient
      .from("chemical_additions")
      .delete()
      .like("reason", `${tag}%`);
    expect(additionsCleanupError).toBeNull();
    const { error: chemicalCleanupError } = await adminClient
      .from("chemical_addition_catalog")
      .delete()
      .like("name", `${tag}%`);
    expect(chemicalCleanupError).toBeNull();
    const { error: starCleanupError } = await adminClient
      .from("star_treatment_catalog")
      .delete()
      .like("name", `${tag}%`);
    expect(starCleanupError).toBeNull();
    const { error: foodCleanupError } = await adminClient
      .from("food_catalog")
      .delete()
      .like("name", `${tag}%`);
    expect(foodCleanupError).toBeNull();
  });

  test("catalogs expose the exact seeds and omit display_order", async () => {
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const { data: chemicalSeeds, error: chemicalSeedsError } = await adminClient
      .from("chemical_addition_catalog")
      .select("name, default_unit")
      .in("name", ["C-Balance", "Mg", "DI-Trace"])
      .order("name");
    expect(chemicalSeedsError).toBeNull();
    expect(chemicalSeeds).toEqual([
      { name: "C-Balance", default_unit: "mL" },
      { name: "DI-Trace", default_unit: "mL" },
      { name: "Mg", default_unit: "mL" },
    ]);

    const { data: starSeeds, error: starSeedsError } = await adminClient
      .from("star_treatment_catalog")
      .select("name, default_amount_unit, default_concentration_unit")
      .in("name", ["Probiotics", "Reef Dip"])
      .order("name");
    expect(starSeedsError).toBeNull();
    expect(starSeeds).toEqual([
      {
        name: "Probiotics",
        default_amount_unit: "mL",
        default_concentration_unit: "ppm",
      },
      {
        name: "Reef Dip",
        default_amount_unit: null,
        default_concentration_unit: null,
      },
    ]);

    for (const table of [
      "chemical_addition_catalog",
      "star_treatment_catalog",
    ] as const) {
      const { data, error } = await adminClient.from(table).select("display_order").limit(1);
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    }
  });

  test("Admin creates, renames, and deletes both catalog types through the UI", async ({
    page,
  }) => {
    const chemicalName = `${tag} UI chemical`;
    const renamedChemical = `${tag} UI chemical renamed`;
    const starName = `${tag} UI star`;
    const renamedStar = `${tag} UI star renamed`;

    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/protected/settings/quick-picks");

    const addChemical = page
      .getByRole("heading", { name: "Add Chemical Addition quick pick" })
      .locator("..");
    await addChemical.getByLabel("Name").fill(chemicalName);
    await addChemical.getByLabel("Default unit", { exact: true }).selectOption("mL");
    await addChemical.getByRole("button", { name: "Add quick pick" }).click();
    await expect(page.getByText(`${chemicalName} added.`)).toBeVisible();
    const { data: createdChemical, error: createdChemicalError } = await adminClient
      .from("chemical_addition_catalog")
      .select("id")
      .eq("name", chemicalName)
      .single();
    expect(createdChemicalError).toBeNull();
    const chemicalId = Number(createdChemical?.id);
    expect(chemicalId).toBeGreaterThan(0);

    await page
      .getByText(chemicalName, { exact: true })
      .locator("../..")
      .getByRole("button", { name: "Edit" })
      .click();
    const chemicalEditor = page
      .locator(`#chemical-${chemicalId}-name`)
      .locator("xpath=ancestor::form");
    await chemicalEditor.getByLabel("Name").fill(renamedChemical);
    await chemicalEditor.getByLabel("Default unit", { exact: true }).selectOption("g");
    await chemicalEditor.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(`${renamedChemical} saved.`)).toBeVisible();
    const { data: updatedChemical, error: updatedChemicalError } = await adminClient
      .from("chemical_addition_catalog")
      .select("name, default_unit")
      .eq("id", chemicalId)
      .single();
    expect(updatedChemicalError).toBeNull();
    expect(updatedChemical).toEqual({ name: renamedChemical, default_unit: "g" });

    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByText(renamedChemical, { exact: true })
      .locator("../..")
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page.getByText(`${renamedChemical} deleted.`)).toBeVisible();
    const { data: deletedChemical, error: deletedChemicalError } = await adminClient
      .from("chemical_addition_catalog")
      .select("id")
      .eq("id", chemicalId)
      .maybeSingle();
    expect(deletedChemicalError).toBeNull();
    expect(deletedChemical).toBeNull();

    const addStar = page
      .getByRole("heading", { name: "Add Star Treatment quick pick" })
      .locator("..");
    await addStar.getByLabel("Name").fill(starName);
    await addStar.getByLabel("Amount unit", { exact: true }).selectOption("mL");
    await addStar.getByLabel("Concentration unit", { exact: true }).selectOption("ppm");
    await addStar.getByRole("button", { name: "Add quick pick" }).click();
    await expect(page.getByText(`${starName} added.`)).toBeVisible();
    const { data: createdStar, error: createdStarError } = await adminClient
      .from("star_treatment_catalog")
      .select("id")
      .eq("name", starName)
      .single();
    expect(createdStarError).toBeNull();
    const starId = Number(createdStar?.id);
    expect(starId).toBeGreaterThan(0);

    await page
      .getByText(starName, { exact: true })
      .locator("../..")
      .getByRole("button", { name: "Edit" })
      .click();
    const starEditor = page
      .locator(`#star-${starId}-name`)
      .locator("xpath=ancestor::form");
    await starEditor.getByLabel("Name").fill(renamedStar);
    await starEditor.getByLabel("Amount unit", { exact: true }).selectOption("");
    await starEditor.getByLabel("Concentration unit", { exact: true }).selectOption("");
    await starEditor.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(`${renamedStar} saved.`)).toBeVisible();
    const { data: updatedStar, error: updatedStarError } = await adminClient
      .from("star_treatment_catalog")
      .select("name, default_amount_unit, default_concentration_unit")
      .eq("id", starId)
      .single();
    expect(updatedStarError).toBeNull();
    expect(updatedStar).toEqual({
      name: renamedStar,
      default_amount_unit: null,
      default_concentration_unit: null,
    });

    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByText(renamedStar, { exact: true })
      .locator("../..")
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(page.getByText(`${renamedStar} deleted.`)).toBeVisible();
    const { data: deletedStar, error: deletedStarError } = await adminClient
      .from("star_treatment_catalog")
      .select("id")
      .eq("id", starId)
      .maybeSingle();
    expect(deletedStarError).toBeNull();
    expect(deletedStar).toBeNull();
  });

  for (const catalogCase of catalogCases) {
    test(`Admin and Technician own CRUD and other active roles read ${catalogCase.table}`, async () => {
      const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
      const technicianClient = await signInRoleClient(TECH_EMAIL, TECH_PASSWORD);
      const volunteerClient = await signInRoleClient(
        VOLUNTEER_EMAIL,
        VOLUNTEER_PASSWORD,
      );
      const viewerClient = await signInRoleClient(VIEWER_EMAIL, VIEWER_PASSWORD);
      const anonymousClient = anonRoleClient();

      const { data: created, error: createError } = await adminClient
        .from(catalogCase.table)
        .insert(catalogCase.create)
        .select("id, name")
        .single();
      expect(createError).toBeNull();
      const catalogId = Number(created?.id);
      expect(catalogId).toBeGreaterThan(0);

      for (const client of [adminClient, technicianClient, volunteerClient, viewerClient]) {
        const { data, error } = await client
          .from(catalogCase.table)
          .select("id, name")
          .eq("id", catalogId)
          .single();
        expect(error).toBeNull();
        expect(Number(data?.id)).toBe(catalogId);
      }

      const { data: anonymousRead, error: anonymousReadError } = await anonymousClient
        .from(catalogCase.table)
        .select("id")
        .eq("id", catalogId)
        .maybeSingle();
      expect(anonymousReadError).not.toBeNull();
      expect(anonymousRead).toBeNull();

      for (const [role, client] of [
        ["Volunteer", volunteerClient],
        ["Viewer", viewerClient],
        ["Anonymous", anonymousClient],
      ] as const) {
        const { data: inserted, error: insertError } = await client
          .from(catalogCase.table)
          .insert({ ...catalogCase.create, name: `${tag} denied ${role}` })
          .select("id")
          .maybeSingle();
        expect(insertError, `${role} insert should fail`).not.toBeNull();
        expect(inserted).toBeNull();

        const { data: updated, error: updateError } = await client
          .from(catalogCase.table)
          .update({ name: `${tag} forbidden ${role}` })
          .eq("id", catalogId)
          .select("id")
          .maybeSingle();
        expect(updateError, `${role} update should fail`).not.toBeNull();
        expect(updated).toBeNull();

        const { data: deleted, error: deleteError } = await client
          .from(catalogCase.table)
          .delete()
          .eq("id", catalogId)
          .select("id")
          .maybeSingle();
        expect(deleteError, `${role} delete should fail`).not.toBeNull();
        expect(deleted).toBeNull();
      }

      const { data: updated, error: updateError } = await adminClient
        .from(catalogCase.table)
        .update(catalogCase.update)
        .eq("id", catalogId)
        .select("id, name")
        .single();
      expect(updateError).toBeNull();
      expect(updated?.name).toBe(catalogCase.update.name);

      const { data: deleted, error: deleteError } = await adminClient
        .from(catalogCase.table)
        .delete()
        .eq("id", catalogId)
        .select("id")
        .single();
      expect(deleteError).toBeNull();
      expect(Number(deleted?.id)).toBe(catalogId);

      const techName = `${catalogCase.create.name} technician`;
      const { data: techCreated, error: techCreateError } = await technicianClient
        .from(catalogCase.table)
        .insert({ ...catalogCase.create, name: techName })
        .select("id, name, is_active")
        .single();
      expect(techCreateError).toBeNull();
      expect(techCreated).toMatchObject({ name: techName, is_active: true });
      const techId = Number(techCreated?.id);

      const { data: techUpdated, error: techUpdateError } = await technicianClient
        .from(catalogCase.table)
        .update({ name: `${techName} renamed`, is_active: false })
        .eq("id", techId)
        .select("id, name, is_active")
        .single();
      expect(techUpdateError).toBeNull();
      expect(techUpdated).toMatchObject({ name: `${techName} renamed`, is_active: false });

      const { data: techDeleted, error: techDeleteError } = await technicianClient
        .from(catalogCase.table)
        .delete()
        .eq("id", techId)
        .select("id")
        .single();
      expect(techDeleteError).toBeNull();
      expect(Number(techDeleted?.id)).toBe(techId);
      expect(
        dbQuery(`select id from core.${catalogCase.table} where id in (${catalogId}, ${techId})`),
      ).toHaveLength(0);
    });
  }

  test("catalog renames preserve event snapshots and referenced rows block deletion", async () => {
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    let chemicalCatalogId = 0;
    let chemicalAdditionId = 0;
    let starCatalogId = 0;
    let starTreatmentId = 0;

    try {
      const { data: system, error: systemError } = await adminClient
        .from("systems")
        .select("id")
        .eq("name", "Graham")
        .single();
      expect(systemError).toBeNull();
      const { data: star, error: starError } = await adminClient
        .from("animals")
        .select("id, tank_id")
        .eq("name", "SSL25")
        .single();
      expect(starError).toBeNull();

      const chemicalName = `${tag} snapshot chemical`;
      const { data: chemicalCatalog, error: chemicalCatalogError } = await adminClient
        .from("chemical_addition_catalog")
        .insert({ name: chemicalName, default_unit: "mL" })
        .select("id")
        .single();
      expect(chemicalCatalogError).toBeNull();
      chemicalCatalogId = Number(chemicalCatalog?.id);

      const chemicalReason = `${tag} chemical snapshot`;
      const { data: chemicalAddition, error: chemicalAdditionError } = await adminClient
        .from("chemical_additions")
        .insert({
          system_id: Number(system?.id),
          catalog_id: chemicalCatalogId,
          chemical_name: "ignored catalog snapshot",
          amount: 1,
          unit: "mL",
          reason: chemicalReason,
        })
        .select("id, chemical_name, unit")
        .single();
      expect(chemicalAdditionError).toBeNull();
      chemicalAdditionId = Number(chemicalAddition?.id);
      expect(chemicalAddition).toMatchObject({ chemical_name: chemicalName, unit: "mL" });

      const { error: chemicalRenameError } = await adminClient
        .from("chemical_addition_catalog")
        .update({ name: `${chemicalName} renamed`, default_unit: "g" })
        .eq("id", chemicalCatalogId);
      expect(chemicalRenameError).toBeNull();
      const { data: chemicalSnapshot, error: chemicalSnapshotError } = await adminClient
        .from("chemical_additions")
        .select("catalog_id, chemical_name, unit")
        .eq("id", chemicalAdditionId)
        .single();
      expect(chemicalSnapshotError).toBeNull();
      expect(chemicalSnapshot).toEqual({
        catalog_id: chemicalCatalogId,
        chemical_name: chemicalName,
        unit: "mL",
      });
      const { data: deletedChemicalCatalog, error: chemicalDeleteError } =
        await adminClient
          .from("chemical_addition_catalog")
          .delete()
          .eq("id", chemicalCatalogId)
          .select("id")
          .maybeSingle();
      expect(chemicalDeleteError).not.toBeNull();
      expect(deletedChemicalCatalog).toBeNull();

      const starName = `${tag} snapshot star`;
      const { data: starCatalog, error: starCatalogError } = await adminClient
        .from("star_treatment_catalog")
        .insert({
          name: starName,
          default_amount_unit: "mL",
          default_concentration_unit: null,
        })
        .select("id")
        .single();
      expect(starCatalogError).toBeNull();
      starCatalogId = Number(starCatalog?.id);

      const starNotes = `${tag} star snapshot`;
      const { error: treatmentCreateError } = await adminClient.rpc(
        "create_star_treatment",
        {
          p_animal_id: Number(star?.id),
          p_tank_id: Number(star?.tank_id),
          p_amount: 2,
          p_unit: "mL",
          p_concentration: null,
          p_concentration_unit: null,
          p_treatment_type: "ignored catalog snapshot",
          p_notes: starNotes,
          p_administered_at: new Date().toISOString(),
          p_catalog_id: starCatalogId,
        },
      );
      expect(treatmentCreateError).toBeNull();
      const { data: treatmentBefore, error: treatmentBeforeError } = await adminClient
        .from("star_treatments")
        .select("id, catalog_id, treatment_type, unit, concentration_unit")
        .eq("notes", starNotes)
        .single();
      expect(treatmentBeforeError).toBeNull();
      starTreatmentId = Number(treatmentBefore?.id);

      const { error: starRenameError } = await adminClient
        .from("star_treatment_catalog")
        .update({
          name: `${starName} renamed`,
          default_amount_unit: "g",
          default_concentration_unit: "ppm",
        })
        .eq("id", starCatalogId);
      expect(starRenameError).toBeNull();
      const { data: treatmentAfter, error: treatmentAfterError } = await adminClient
        .from("star_treatments")
        .select("id, catalog_id, treatment_type, unit, concentration_unit")
        .eq("id", starTreatmentId)
        .single();
      expect(treatmentAfterError).toBeNull();
      expect(treatmentAfter).toEqual(treatmentBefore);
      const { data: deletedStarCatalog, error: starDeleteError } = await adminClient
        .from("star_treatment_catalog")
        .delete()
        .eq("id", starCatalogId)
        .select("id")
        .maybeSingle();
      expect(starDeleteError).not.toBeNull();
      expect(deletedStarCatalog).toBeNull();
    } finally {
      if (starTreatmentId > 0) {
        const { error } = await adminClient.rpc("hard_delete_star_treatment", {
          p_treatment_id: starTreatmentId,
        });
        expect(error).toBeNull();
      }
      if (chemicalAdditionId > 0) {
        const { error } = await adminClient
          .from("chemical_additions")
          .delete()
          .eq("id", chemicalAdditionId);
        expect(error).toBeNull();
      }
      if (chemicalCatalogId > 0) {
        const { error } = await adminClient
          .from("chemical_addition_catalog")
          .delete()
          .eq("id", chemicalCatalogId);
        expect(error).toBeNull();
      }
      if (starCatalogId > 0) {
        const { error } = await adminClient
          .from("star_treatment_catalog")
          .delete()
          .eq("id", starCatalogId);
        expect(error).toBeNull();
      }
    }
  });
});

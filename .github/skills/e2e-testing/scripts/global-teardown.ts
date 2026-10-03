import { db, dbQuery, sqlLiteral } from "./helpers";

const summary: Record<string, number> = {
  "core.operational_batch_requests": 0,
  "core.attachments": 0,
  "core.feeding_logs": 0,
  "core.star_treatments": 0,
  "core.daily_checks": 0,
  "core.water_quality_readings": 0,
  "core.chemical_additions": 0,
  "core.health_observations": 0,
  "core.maintenance_logs": 0,
  "core.food_catalog": 0,
  "core.chemical_addition_catalog": 0,
  "core.star_treatment_catalog": 0,
  "core.animals": 0,
  "core.tanks": 0,
  "core.profiles": 0,
  "core.invitations": 0,
  "auth.users": 0,
  "storage.objects": 0,
  "storage.buckets": 0,
};

function tagged(column: string): string {
  return "((" + column + " LIKE " + sqlLiteral("e2e-%") +
    " AND " + column + " ~ '^e2e-([0-9]+|rbac-|rls-)') OR (" + column +
    " LIKE " + sqlLiteral("E2EBATCH%") + "))";
}

function testEmail(column: string): string {
  return "(" + column + " LIKE " + sqlLiteral("e2e-%@example.test") +
    " AND " + column + " ~ '^e2e-([0-9]+|invite-).*@example[.]test$')";
}

function deleteRows(table: string, sql: string): void {
  try {
    summary[table] = (summary[table] ?? 0) + dbQuery(sql).length;
  } catch (error) {
    console.warn(`E2E global cleanup failed (${table}); continuing:`, error);
  }
}

async function removeStorageObjects(
  bucket: string,
  whereSql: string,
  label: string,
): Promise<void> {
  let objects: Record<string, unknown>[];
  try {
    objects = dbQuery("select name from storage.objects where bucket_id = " +
      sqlLiteral(bucket) + " and (" + whereSql + ")");
  } catch (error) {
    console.warn(`E2E global cleanup could not list Storage objects (${label}); continuing:`, error);
    return;
  }
  if (objects.length === 0) return;
  if (!db) {
    console.warn(`E2E global cleanup skipped Storage removal (${label}): db client is null.`);
    return;
  }
  const names = objects.map((row) => String(row.name));
  try {
    const { error } = await db.storage.from(bucket).remove(names);
    if (error) throw error;
    summary["storage.objects"] = (summary["storage.objects"] ?? 0) + names.length;
  } catch (error) {
    console.warn(`E2E global cleanup failed (Storage objects: ${label}); continuing:`, error);
  }
}

async function cleanupAuthUsers(): Promise<void> {
  if (!db) {
    console.log("E2E global cleanup skipped Auth user removal: db client is null.");
  } else {
    try {
      let page = 1;
      while (true) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        const users = data.users.filter((user) =>
          /^e2e-[0-9]+.*@example\.test$/i.test(user.email ?? ""),
        );
        for (const user of users) {
          try {
            const { error: deleteError } = await db.auth.admin.deleteUser(user.id);
            if (deleteError) throw deleteError;
            summary["auth.users"] = (summary["auth.users"] ?? 0) + 1;
          } catch (error) {
            console.warn(`E2E global cleanup failed (auth user ${user.id}); continuing:`, error);
          }
        }
        if (data.users.length < 1000) break;
        page += 1;
      }
    } catch (error) {
      console.warn("E2E global cleanup could not enumerate Auth users; continuing:", error);
    }
  }
  deleteRows("core.profiles", "delete from core.profiles where " + testEmail("email") + " returning id");
  deleteRows("core.invitations", "delete from core.invitations where " + testEmail("email") + " returning id");
}

async function globalTeardown(): Promise<void> {
  try {
    dbQuery("select 1 as connected");
  } catch (error) {
    console.warn("E2E global cleanup could not connect through dbQuery; SQL sweeps were skipped:", error);
    await cleanupAuthUsers();
    const counts = Object.entries(summary).map(([table, count]) => table + "=" + count).join(", ");
    console.log("E2E cleanup summary: " + counts + ".");
    return;
  }

  deleteRows("core.operational_batch_requests", "delete from core.operational_batch_requests where " +
    tagged("payload->>'notes'") + " returning request_id");

  let taggedObservations: Record<string, unknown>[] = [];
  try {
    taggedObservations = dbQuery("select id from core.health_observations where " +
      tagged("notes"));
  } catch (error) {
    console.warn("E2E global cleanup could not list tagged health observations; continuing:", error);
  }
  for (const observation of taggedObservations) {
    const prefix = "health_observations/" + String(observation.id) + "/%";
    await removeStorageObjects(
      "attachments",
      "name LIKE " + sqlLiteral(prefix),
      "health observation " + String(observation.id),
    );
  }
  await removeStorageObjects(
    "attachments",
    tagged("name"),
    "tagged attachment paths",
  );
  deleteRows("core.attachments", "delete from core.attachments where " +
    tagged("storage_path") + " OR (parent_table = 'health_observations' AND parent_id IN " +
    "(select id from core.health_observations where " + tagged("notes") + ")) returning id");

  deleteRows("core.feeding_logs", "delete from core.feeding_logs where " + tagged("notes") + " returning id");
  deleteRows("core.star_treatments", "delete from core.star_treatments where " + tagged("notes") + " returning id");
  deleteRows("core.daily_checks", "delete from core.daily_checks where " + tagged("notes") + " returning id");
  deleteRows("core.water_quality_readings", "delete from core.water_quality_readings where " + tagged("notes") + " returning id");
  deleteRows("core.chemical_additions", "delete from core.chemical_additions where " + tagged("reason") + " returning id");
  deleteRows("core.health_observations", "delete from core.health_observations where " + tagged("notes") + " returning id");
  deleteRows("core.maintenance_logs", "delete from core.maintenance_logs where " + tagged("notes") + " returning id");

  deleteRows("core.food_catalog", "delete from core.food_catalog where " + tagged("name") + " returning id");
  deleteRows("core.chemical_addition_catalog", "delete from core.chemical_addition_catalog where " + tagged("name") + " returning id");
  deleteRows("core.star_treatment_catalog", "delete from core.star_treatment_catalog where " + tagged("name") + " returning id");
  deleteRows("core.animals", "delete from core.animals where " + tagged("name") +
    " OR " + tagged("notes") + " returning id");
  deleteRows("core.tanks", "delete from core.tanks where " + tagged("name") + " returning id");

  let testBuckets: Record<string, unknown>[] = [];
  try {
    testBuckets = dbQuery("select id from storage.buckets where " + tagged("id"));
  } catch (error) {
    console.warn("E2E global cleanup could not list tagged Storage buckets; continuing:", error);
  }
  for (const bucketRow of testBuckets) {
    const bucket = String(bucketRow.id);
    await removeStorageObjects(bucket, "true", "bucket " + bucket);
    if (!db) continue;
    try {
      const { error } = await db.storage.deleteBucket(bucket);
      if (error) throw error;
      summary["storage.buckets"] = (summary["storage.buckets"] ?? 0) + 1;
    } catch (error) {
      console.warn(`E2E global cleanup failed (Storage bucket ${bucket}); continuing:`, error);
    }
  }

  await cleanupAuthUsers();
  const counts = Object.entries(summary).map(([table, count]) => table + "=" + count).join(", ");
  console.log("E2E cleanup summary: " + (counts || "no matching rows") + ".");
}

export { globalTeardown as sweepE2eData };
export default globalTeardown;

if (process.argv[1]?.endsWith("global-teardown.ts")) {
  void globalTeardown().catch((error) => {
    console.error("E2E standalone cleanup failed unexpectedly:", error);
    process.exitCode = 1;
  });
}
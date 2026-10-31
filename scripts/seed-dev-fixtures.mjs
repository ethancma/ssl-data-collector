// Seeds the hosted Dev project with tanks and animals shaped like Production's: the same tank
// layout, Sunflower star individuals only, some retired. Animal names are synthetic.
// Idempotent; run with `npm run seed:dev`. Refuses any database other than Dev.
import pg from "pg";

const DEV_PROJECT_REF = "hcaopgzlvuyuyjcjxuvy";
const url = process.env.E2E_DB_URL;
if (!url || !url.includes(DEV_PROJECT_REF)) {
  throw new Error(`E2E_DB_URL must point at the Dev project (${DEV_PROJECT_REF}).`);
}

// [system slug, tank name, tank type, shelf position, size L, active, retired]
const TANKS = [
  ["graham", "2025 tubs (historical)", "shelf", null, null, 0, 3],
  ["graham", "Lower 140L", "shelf", "lower", 140, 3, 0],
  ["graham", "Lower 18.4L", "shelf", "lower", 18.4, 3, 2],
  ["graham", "Lower 3L", "shelf", "lower", 3, 3, 0],
  ["graham", "Upper 3L", "shelf", "upper", 3, 3, 0],
  ["graham", "Upper 9.4L", "shelf", "upper", 9.4, 3, 2],
  ["indoor-quarantine", "Main tank", "main", null, 139, 2, 1],
  ["outdoor-quarantine", "0.4L", "shelf", null, 0.4, 0, 0],
  ["outdoor-quarantine", "2.3L", "shelf", null, 2.3, 0, 0],
  ["outdoor-quarantine", "20L", "shelf", null, 20, 0, 0],
  ["wholey", "Lower 0.4L", "shelf", "lower", 0.4, 2, 0],
  ["wholey", "Lower 2.3L", "shelf", "lower", 2.3, 1, 0],
];

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("begin");
  const { rows: [species] } = await client.query(
    "select id from core.species where common_name = 'Sunflower star'",
  );
  let created = 0;
  let serial = 0;
  for (const [slug, name, type, position, size, active, retired] of TANKS) {
    const { rows: [tank] } = await client.query(
      `insert into core.tanks (system_id, name, tank_type, shelf_position, size_liters)
       select id, $2, $3, $4, $5 from core.systems where slug = $1
       on conflict (system_id, name) do update set name = excluded.name
       returning id`,
      [slug, name, type, position, size],
    );
    for (let i = 0; i < active + retired; i++) {
      serial += 1;
      const isRetired = i >= active;
      // Retired animals alternate between transferred and deceased, as in Production.
      const status = !isRetired ? "active" : serial % 2 ? "transferred" : "deceased";
      const result = await client.query(
        `insert into core.animals (tank_id, species_id, name, tracking_type, quantity, status, date_added, retired_on)
         values ($1, $2, $3, 'individual', 1, $4, current_date - 60,
           case when $4 = 'active' then null else current_date - 7 end)
         on conflict (name) do nothing`,
        [tank.id, species.id, `Dev star ${String(serial).padStart(2, "0")}`, status],
      );
      created += result.rowCount ?? 0;
    }
  }
  await client.query("commit");
  console.log(`Dev fixtures ready: ${TANKS.length} tanks, ${created} new animals.`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import {
  ADMIN_EMAIL, ADMIN_PASSWORD, TECH_EMAIL, TECH_PASSWORD,
  VIEWER_EMAIL, VIEWER_PASSWORD, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD,
  cleanupStep, dbQuery, loginAs, signInRoleClient,
} from "./helpers";

const TAG = `E2EBATCH${Date.now()}`;
const lit = (value: string) => `'${value.replaceAll("'", "''")}'`;
const notes = (label: string) => `${TAG} ${label}`;
const eventAt = new Date().toISOString();
const fixtureNames = {
  middleStar: `${TAG}_middle_star`, smallStar: `${TAG}_small_star`,
  excludedStar: `${TAG}_excluded_star`, inactiveStar: `${TAG}_inactive_star`,
  cohort: `${TAG}_cohort`, nonStar: `${TAG}_non_star`, otherSystem: `${TAG}_other_system`,
};

type Animal = { id: number; name: string; tank_id: number; status: string; tracking_type: string };
type Refs = {
  systemId: number; middleTankId: number; smallTankId: number; otherSystemId: number; otherTankId: number;
  starSpeciesId: number; nonStarSpeciesId: number; foodId: number; catalogId: number;
  adminProfileId: number;
};
let refs: Refs;
let animals: Record<string, Animal>;
const requestIds: string[] = [];
let cleanupStatus = "not run";

const newRequestId = () => {
  const id = randomUUID();
  requestIds.push(id);
  return id;
};
const requestIdsSql = () => requestIds.length
  ? `array[${requestIds.map(lit).join(",")}]::uuid[]` : "array[]::uuid[]";
const ids = () => Object.values(animals ?? {}).map((animal) => animal.id);

function eligible(operation: "feeding" | "star_treatment", scope: { systemId: number; tankId?: number; animalId?: number }) {
  return dbQuery(`select animal.id from core.animals animal
    join core.tanks tank on tank.id = animal.tank_id
    join core.species species on species.id = animal.species_id
    where tank.system_id = ${scope.systemId}
      ${scope.tankId === undefined ? "" : `and animal.tank_id = ${scope.tankId}`}
      ${scope.animalId === undefined ? "" : `and animal.id = ${scope.animalId}`}
      and animal.status = 'active'
      ${operation === "star_treatment" ? "and animal.tracking_type = 'individual' and species.category = 'star'" : ""}
    order by animal.id`).map((row) => Number(row.id));
}

function lists(all: number[], include: number[]) {
  const included = [...new Set(include)].sort((a, b) => a - b);
  return { included, excluded: all.filter((id) => !included.includes(id)).sort((a, b) => a - b) };
}

function feedingArgs(requestId: string, included: number[], excluded: number[], extra: Record<string, unknown> = {}) {
  return {
    p_request_id: requestId, p_system_id: refs.systemId,
    p_included_animal_ids: included, p_excluded_animal_ids: excluded,
    p_fed_at: eventAt, p_food_catalog_id: refs.foodId, p_food_name: null,
    p_amount_value: 2.5, p_amount_unit: "pieces", p_notes: notes("RPC feeding"), ...extra,
  };
}

function starArgs(requestId: string, included: number[], excluded: number[], extra: Record<string, unknown> = {}) {
  return {
    p_request_id: requestId, p_system_id: refs.systemId,
    p_included_animal_ids: included, p_excluded_animal_ids: excluded,
    p_administered_at: eventAt, p_amount: 2.5, p_unit: "mL",
    p_concentration: 10, p_concentration_unit: "ppm", p_treatment_type: "probiotics",
    p_notes: notes("RPC star"), p_catalog_id: refs.catalogId, ...extra,
  };
}

async function saveFeeding(client: Awaited<ReturnType<typeof signInRoleClient>>, requestId: string, included: number[], excluded: number[], extra: Record<string, unknown> = {}) {
  return client.rpc("create_feeding_batch", feedingArgs(requestId, included, excluded, extra));
}

async function saveStar(client: Awaited<ReturnType<typeof signInRoleClient>>, requestId: string, included: number[], excluded: number[], extra: Record<string, unknown> = {}) {
  return client.rpc("create_star_treatment_batch", starArgs(requestId, included, excluded, extra));
}

async function openPage(page: Page, email: string, password: string, type: string) {
  await loginAs(page, email, password);
  await page.goto(`/protected/daily-operations?type=${type}&system=${refs.systemId}`);
}

test.beforeAll(() => {
  const row = dbQuery(`select
    (select id from core.systems where name = 'Graham' order by id limit 1) system_id,
    (select id from core.tanks where system_id = (select id from core.systems where name = 'Graham' order by id limit 1) and lower(name) = 'middle' order by id limit 1) middle_id,
    (select id from core.tanks where system_id = (select id from core.systems where name = 'Graham' order by id limit 1) and lower(name) = 'small' order by id limit 1) small_id,
    (select id from core.systems where name = 'Indoor Quarantine' order by id limit 1) other_system_id,
    (select id from core.species where category = 'star' order by id limit 1) star_species_id,
    (select id from core.species where category <> 'star' order by id limit 1) other_species_id,
    (select id from core.food_catalog where is_active order by id limit 1) food_id,
    (select id from core.star_treatment_catalog where is_active order by id limit 1) catalog_id,
    (select id from core.profiles where email = ${lit(ADMIN_EMAIL)}) admin_profile_id`)[0];
  expect(row).toBeTruthy();
  refs = {
    systemId: Number(row.system_id), middleTankId: Number(row.middle_id), smallTankId: Number(row.small_id),
    otherSystemId: Number(row.other_system_id), otherTankId: 0, starSpeciesId: Number(row.star_species_id),
    nonStarSpeciesId: Number(row.other_species_id), foodId: Number(row.food_id),
    catalogId: Number(row.catalog_id), adminProfileId: Number(row.admin_profile_id),
  };
  for (const id of Object.values(refs).filter((value) => value !== 0)) expect(id).toBeGreaterThan(0);
  const controlTank = dbQuery(`insert into core.tanks (system_id, name, tank_type, shelf_position)
    values (${refs.otherSystemId}, ${lit(`${TAG}_control_tank`)}, 'shelf', 'upper') returning id`)[0];
  refs.otherTankId = Number(controlTank.id);
  expect(refs.otherTankId).toBeGreaterThan(0);
  const rows = dbQuery(`insert into core.animals
    (tank_id, species_id, name, tracking_type, quantity, status, date_added, notes) values
    (${refs.middleTankId}, ${refs.starSpeciesId}, ${lit(fixtureNames.middleStar)}, 'individual', 1, 'active', current_date, ${lit(TAG)}),
    (${refs.smallTankId}, ${refs.starSpeciesId}, ${lit(fixtureNames.smallStar)}, 'individual', 1, 'active', current_date, ${lit(TAG)}),
    (${refs.smallTankId}, ${refs.starSpeciesId}, ${lit(fixtureNames.excludedStar)}, 'individual', 1, 'active', current_date, ${lit(TAG)}),
    (${refs.middleTankId}, ${refs.starSpeciesId}, ${lit(fixtureNames.inactiveStar)}, 'individual', 1, 'deceased', current_date, ${lit(TAG)}),
    (${refs.middleTankId}, ${refs.starSpeciesId}, ${lit(fixtureNames.cohort)}, 'cohort', 2, 'active', current_date, ${lit(TAG)}),
    (${refs.middleTankId}, ${refs.nonStarSpeciesId}, ${lit(fixtureNames.nonStar)}, 'individual', 1, 'active', current_date, ${lit(TAG)}),
    (${refs.otherTankId}, ${refs.starSpeciesId}, ${lit(fixtureNames.otherSystem)}, 'individual', 1, 'active', current_date, ${lit(TAG)})
    returning id, name, tank_id, status, tracking_type`);
  animals = Object.fromEntries(rows.map((item) => [String(item.name).replace(`${TAG}_`, "").replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), {
    id: Number(item.id), name: String(item.name), tank_id: Number(item.tank_id),
    status: String(item.status), tracking_type: String(item.tracking_type),
  }]));
  expect(Object.keys(animals)).toHaveLength(7);
});

test.afterAll(async () => {
  const animalIds = ids();
  const animalArray = `array[${animalIds.join(",")}]::int[]`;
  await cleanupStep("delete batch request ledger rows", () => dbQuery(
    `delete from core.operational_batch_requests where request_id = any(${requestIdsSql()})
      or payload->>'notes' like ${lit(`${TAG}%`)}`,
  ));
  await cleanupStep("delete batch feeding rows", () => dbQuery(
    `delete from core.feeding_logs where notes like ${lit(`${TAG}%`)}` +
      (animalIds.length ? ` or animal_id = any(${animalArray})` : ""),
  ));
  await cleanupStep("delete batch star-treatment rows", () => dbQuery(
    `delete from core.star_treatments where notes like ${lit(`${TAG}%`)}` +
      (animalIds.length ? ` or animal_id = any(${animalArray})` : ""),
  ));
  if (animalIds.length) {
    await cleanupStep("delete batch fixture animals", () => dbQuery(
      `delete from core.animals where id = any(${animalArray})`,
    ));
  }
  if (refs?.otherTankId) {
    await cleanupStep("delete batch control tank", () => dbQuery(
      `delete from core.tanks where id = ${refs.otherTankId} and name = ${lit(`${TAG}_control_tank`)}`,
    ));
  }
  await cleanupStep("check for leftover batch fixtures", () => {
    const remaining = dbQuery(`select
      (select count(*)::int from core.animals where notes like ${lit(`${TAG}%`)}) animals,
      (select count(*)::int from core.tanks where name like ${lit(`${TAG}%`)}) tanks,
      (select count(*)::int from core.feeding_logs where notes like ${lit(`${TAG}%`)}) feeding_logs,
      (select count(*)::int from core.star_treatments where notes like ${lit(`${TAG}%`)}) star_treatments,
      (select count(*)::int from core.operational_batch_requests where payload->>'notes' like ${lit(`${TAG}%`)}) ledger`)[0];
    const remainingCounts = Object.values(remaining).map(Number);
    cleanupStatus = remainingCounts.every((count) => count === 0)
      ? "all tagged fixture animals, tanks, logs, and ledger rows removed"
      : `tagged rows remain: ${JSON.stringify(remaining)}`;
    if (remainingCounts.some((count) => count > 0)) {
      console.warn(`Batch fixture cleanup: ${cleanupStatus}`);
    } else {
      console.info(`Batch fixture cleanup: ${cleanupStatus}`);
    }
  });
});

test.describe("Batch feeding UI", () => {
  test.describe.configure({ mode: "serial" });
  test("Admin saves a Graham-wide batch with a fixture exclusion and verifies rows plus ledger", async ({ page }) => {
    await openPage(page, ADMIN_EMAIL, ADMIN_PASSWORD, "feeding");
    await expect(page.getByRole("button", { name: "Select all" })).toBeVisible();
    await page.getByLabel("System", { exact: true }).selectOption(String(refs.systemId));
    await page.getByRole("button", { name: "Clear all" }).click();
    await page.getByRole("checkbox", { name: animals.middleStar.name }).check();
    await page.getByRole("checkbox", { name: animals.cohort.name }).check();
    await expect(page.getByText(/2 of \d+ selected · \d+ excluded/)).toBeVisible();
    await page.locator(`input[type="radio"][value="${refs.foodId}"]`).check();
    await page.getByLabel("Amount per animal (optional)").fill("2.5");
    await page.getByLabel("Unit", { exact: true }).selectOption("pieces");
    await page.getByLabel("Notes", { exact: true }).fill(notes("UI feeding"));
    await page.getByRole("button", { name: "Save 2 feedings" }).click();
    await expect(page.getByText(/2 feedings logged/i)).toBeVisible();
    const rows = dbQuery(`select id, animal_id, tank_id, food_catalog_id, amount_value, amount_unit, notes, recorded_by, data_source from core.feeding_logs where notes = ${lit(notes("UI feeding"))} order by animal_id`);
    expect(rows.map((item) => Number(item.animal_id))).toEqual([animals.middleStar.id, animals.cohort.id].sort((a, b) => a - b));
    for (const item of rows) {
      const expected = Object.values(animals).find((animal) => animal.id === Number(item.animal_id));
      expect(Number(item.tank_id)).toBe(expected?.tank_id);
      expect(Number(item.food_catalog_id)).toBe(refs.foodId);
      expect(Number(item.amount_value)).toBe(2.5);
      expect(item.amount_unit).toBe("pieces");
      expect(item.recorded_by).toBe(refs.adminProfileId);
      expect(item.data_source).toBe("live");
    }
    const ledger = dbQuery(`select scope_system_id, scope_tank_id, scope_animal_id, included_animal_ids, excluded_animal_ids, result from core.operational_batch_requests where payload->>'notes' = ${lit(notes("UI feeding"))}`);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].scope_system_id).toBe(refs.systemId);
    expect(ledger[0].scope_tank_id).toBeNull();
    expect(ledger[0].scope_animal_id).toBeNull();
    expect(JSON.stringify(ledger[0].result)).toContain(String(rows[0].id));
  });

  test("Middle-tank and single-animal scopes are represented by the UI", async ({ page }) => {
    await openPage(page, ADMIN_EMAIL, ADMIN_PASSWORD, "feeding");
    await page.getByLabel("System", { exact: true }).selectOption(String(refs.systemId));
    await page.getByLabel("Tank", { exact: true }).selectOption(String(refs.middleTankId));
    await expect(page.getByRole("checkbox", { name: animals.middleStar.name })).toBeVisible();
    await page.goto(`/protected/daily-operations?type=feeding&system=${refs.systemId}&tank=${refs.middleTankId}&animal=${animals.middleStar.id}`);
    await expect(page.getByLabel("Animal", { exact: true })).toHaveValue(String(animals.middleStar.id));
  });

  test("Clear all disables save, reload resets checks, and system changes clear tank/animal", async ({ page }) => {
    await openPage(page, ADMIN_EMAIL, ADMIN_PASSWORD, "feeding");
    await page.getByLabel("System", { exact: true }).selectOption(String(refs.systemId));
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(page.getByRole("button", { name: /Save \d+ feedings/ })).toBeDisabled();
    await expect(page.getByText(/0 of \d+ selected/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/\d+ of \d+ selected · 0 excluded/)).toBeVisible();
    await page.getByLabel("Tank", { exact: true }).selectOption(String(refs.middleTankId));
    await page.getByLabel("Animal", { exact: true }).selectOption(String(animals.middleStar.id));
    const otherSystem = dbQuery(`select id from core.systems where id <> ${refs.systemId} order by id limit 1`)[0];
    await page.getByLabel("System", { exact: true }).selectOption(String(otherSystem.id));
    await expect.poll(() => new URL(page.url()).searchParams.get("tank")).toBeNull();
    await expect.poll(() => new URL(page.url()).searchParams.get("animal")).toBeNull();
  });

  test("double-click writes only one batch and one ledger row", async ({ page }) => {
    await openPage(page, ADMIN_EMAIL, ADMIN_PASSWORD, "feeding");
    await page.getByLabel("System", { exact: true }).selectOption(String(refs.systemId));
    await page.getByRole("button", { name: "Clear all" }).click();
    await page.getByRole("checkbox", { name: animals.middleStar.name }).check();
    await page.getByLabel("Notes", { exact: true }).fill(notes("UI double"));
    await page.getByRole("button", { name: "Save 1 feeding" }).dblclick();
    await expect(page.getByText(/1 feeding logged/i)).toBeVisible();
    expect(dbQuery(`select id from core.feeding_logs where notes = ${lit(notes("UI double"))}`)).toHaveLength(1);
    expect(dbQuery(`select request_id from core.operational_batch_requests where payload->>'notes' = ${lit(notes("UI double"))}`)).toHaveLength(1);
  });
});

test.describe("Batch star-treatment UI", () => {
  test.describe.configure({ mode: "serial" });
  test("Admin sees eligible stars only and verifies treatment snapshots", async ({ page }) => {
    await openPage(page, ADMIN_EMAIL, ADMIN_PASSWORD, "star-treatment");
    await expect(page.getByRole("button", { name: "Select all" })).toBeVisible();
    await page.getByLabel("System", { exact: true }).selectOption(String(refs.systemId));
    await expect(page.getByRole("checkbox", { name: animals.cohort.name })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: animals.nonStar.name })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: animals.inactiveStar.name })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: animals.otherSystem.name })).toHaveCount(0);
    await page.getByRole("button", { name: "Clear all" }).click();
    await page.getByRole("checkbox", { name: animals.middleStar.name }).check();
    await page.locator(`input[type="radio"][value="${refs.catalogId}"]`).check();
    await page.getByLabel("Amount per star").fill("2.5");
    await page.getByLabel("Concentration", { exact: true }).fill("10");
    await page.getByLabel("Notes", { exact: true }).fill(notes("UI star"));
    await page.getByRole("button", { name: "Save 1 treatment" }).click();
    await expect(page.getByText(/1 treatment logged/i)).toBeVisible();
    const rows = dbQuery(`select id, animal_id, tank_id, amount, unit, concentration, concentration_unit, treatment_type, notes, recorded_by, data_source, catalog_id from core.star_treatments where notes = ${lit(notes("UI star"))}`);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].animal_id)).toBe(animals.middleStar.id);
    expect(Number(rows[0].tank_id)).toBe(refs.middleTankId);
    expect(Number(rows[0].amount)).toBe(2.5);
    expect(rows[0].unit).toBe("mL");
    expect(Number(rows[0].concentration)).toBe(10);
    expect(rows[0].concentration_unit).toBe("ppm");
    expect(rows[0].treatment_type).toBe("probiotics");
    expect(rows[0].recorded_by).toBe(refs.adminProfileId);
    expect(rows[0].data_source).toBe("live");
    expect(Number(rows[0].catalog_id)).toBe(refs.catalogId);
    const ledger = dbQuery(`select result, scope_system_id, scope_tank_id, scope_animal_id from core.operational_batch_requests where operation = 'star_treatment' and payload->>'notes' = ${lit(notes("UI star"))}`);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].scope_system_id).toBe(refs.systemId);
    expect(ledger[0].scope_tank_id).toBeNull();
    expect(ledger[0].scope_animal_id).toBeNull();
    expect(JSON.stringify(ledger[0].result)).toContain(String(rows[0].id));
  });
});

test.describe("Batch UI smoke and access", () => {
  test.describe.configure({ mode: "serial" });
  test("volunteer can save a small feeding batch", async ({ page }) => {
    await openPage(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD, "feeding");
    await expect(page.getByRole("button", { name: "Select all" })).toBeVisible();
    await page.getByLabel("System", { exact: true }).selectOption(String(refs.systemId));
    await page.getByRole("button", { name: "Clear all" }).click();
    await page.getByRole("checkbox", { name: animals.middleStar.name }).check();
    await page.getByLabel("Notes", { exact: true }).fill(notes("volunteer UI"));
    await page.getByRole("button", { name: "Save 1 feeding" }).click();
    await expect(page.getByText(/1 feeding logged/i)).toBeVisible();
    const profileId = dbQuery(`select id from core.profiles where email = ${lit(VOLUNTEER_EMAIL)}`)[0].id;
    expect(dbQuery(`select animal_id, recorded_by, data_source from core.feeding_logs where notes = ${lit(notes("volunteer UI"))}`)).toEqual([
      { animal_id: animals.middleStar.id, recorded_by: profileId, data_source: "live" },
    ]);
  });

  test("Viewer cannot access daily operations", async ({ page }) => {
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD);
    const response = await page.goto(`/protected/daily-operations?type=feeding&system=${refs.systemId}`);
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("button", { name: /Save .*feedings/ })).toHaveCount(0);
  });

  test("Home has no batch exclusion indicators and 390px batch form does not scroll horizontally", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/protected/home");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByText(/excluded|not fed/i)).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/protected/daily-operations?type=feeding&system=${refs.systemId}`);
    await expect(page.getByRole("button", { name: "Select all" })).toBeVisible();
    const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(size.scroll).toBeLessThanOrEqual(size.client);
  });
});

test.describe("Batch RPC behavior", () => {
  test.describe.configure({ mode: "serial" });

  test("identical request replays; payload or actor conflict writes nothing extra", async () => {
    const admin = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const tech = await signInRoleClient(TECH_EMAIL, TECH_PASSWORD);
    const eligibleIds = eligible("feeding", { systemId: refs.systemId });
    const selection = lists(eligibleIds, [animals.middleStar.id]);
    const requestId = newRequestId();
    const args = feedingArgs(requestId, selection.included, selection.excluded);
    const first = await admin.rpc("create_feeding_batch", args);
    expect(first.error).toBeNull();
    const replay = await admin.rpc("create_feeding_batch", args);
    expect(replay.error).toBeNull();
    expect(replay.data).toMatchObject({ ...(first.data as object), replayed: true });
    const conflict = await saveFeeding(admin, requestId, selection.included, selection.excluded, { p_notes: notes("conflicting payload") });
    expect(conflict.error?.code).toBe("SSL02");
    const otherActor = await saveFeeding(tech, requestId, selection.included, selection.excluded);
    expect(otherActor.error?.code).toBe("SSL02");
    expect(dbQuery(`select request_id from core.operational_batch_requests where request_id = ${lit(requestId)}::uuid`)).toHaveLength(1);
    expect(dbQuery(`select id from core.feeding_logs where notes = ${lit(notes("RPC feeding"))}`)).toHaveLength(1);
  });

  test("stale preview and null/duplicate lists are rejected without writes", async () => {
    const admin = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const oldIds = eligible("feeding", { systemId: refs.systemId });
    const oldSelection = lists(oldIds, [animals.middleStar.id]);
    const rejectedNotes = [notes("stale rejected"), notes("null list rejected"), notes("duplicate list rejected")];
    const staleId = newRequestId();
    const late = dbQuery(`insert into core.animals (tank_id, species_id, name, tracking_type, quantity, status, date_added, notes)
      values (${refs.smallTankId}, ${refs.starSpeciesId}, ${lit(`${TAG}_late`)}, 'individual', 1, 'active', current_date, ${lit(TAG)})
      returning id, name, tank_id, status, tracking_type`)[0];
    animals.late = { id: Number(late.id), name: String(late.name), tank_id: Number(late.tank_id), status: String(late.status), tracking_type: String(late.tracking_type) };
    const stale = await saveFeeding(admin, staleId, oldSelection.included, oldSelection.excluded, { p_notes: rejectedNotes[0] });
    expect(stale.error?.code).toBe("SSL01");
    const nullId = newRequestId();
    const nullList = await admin.rpc("create_feeding_batch", feedingArgs(nullId, [null] as unknown as number[], oldSelection.excluded, { p_notes: rejectedNotes[1] }));
    expect(nullList.error?.code).toBe("22023");
    const duplicateId = newRequestId();
    const duplicate = await saveFeeding(admin, duplicateId, [animals.middleStar.id, animals.middleStar.id], oldSelection.excluded, { p_notes: rejectedNotes[2] });
    expect(duplicate.error?.code).toBe("22023");
    expect(dbQuery(`select request_id from core.operational_batch_requests where request_id = any(array[${[staleId, nullId, duplicateId].map(lit).join(",")}]::uuid[])`)).toHaveLength(0);
    expect(dbQuery(`select id from core.feeding_logs where notes in (${rejectedNotes.map(lit).join(",")})`)).toHaveLength(0);
    dbQuery(`delete from core.animals where id = ${animals.late.id}`);
    delete animals.late;
  });

  test("empty eligibility, cross-system tank, and out-of-tank animal fail without ledger writes", async () => {
    const admin = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const emptyId = newRequestId();
    const empty = await saveFeeding(admin, emptyId, [animals.inactiveStar.id], [], { p_tank_id: refs.middleTankId, p_animal_id: animals.inactiveStar.id });
    expect(empty.error?.code).toBe("SSL03");
    const tankId = newRequestId();
    const wrongTank = await saveFeeding(admin, tankId, [animals.middleStar.id], [], { p_tank_id: refs.otherTankId });
    expect(wrongTank.error?.code).toBe("23514");
    const animalId = newRequestId();
    const wrongAnimal = await saveFeeding(admin, animalId, [animals.middleStar.id], [], { p_tank_id: refs.middleTankId, p_animal_id: animals.smallStar.id });
    expect(wrongAnimal.error?.code).toBe("SSL01");
    expect(dbQuery(`select request_id from core.operational_batch_requests where request_id = any(array[${[emptyId, tankId, animalId].map(lit).join(",")}]::uuid[])`)).toHaveLength(0);
  });

  test("concurrent same-ID calls create one set; invalid payloads roll back rows and ledger", async () => {
    const admin = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const all = eligible("feeding", { systemId: refs.systemId });
    const selection = lists(all, [animals.middleStar.id]);
    const concurrentId = newRequestId();
    const args = feedingArgs(concurrentId, selection.included, selection.excluded);
    const outcomes = await Promise.all(Array.from({ length: 3 }, () => admin.rpc("create_feeding_batch", args)));
    expect(outcomes.every((outcome) => !outcome.error)).toBe(true);
    expect(outcomes.filter((outcome) => !(outcome.data as { replayed: boolean }).replayed)).toHaveLength(1);
    expect(dbQuery(`select request_id from core.operational_batch_requests where request_id = ${lit(concurrentId)}::uuid`)).toHaveLength(1);

    const failureId = newRequestId();
    const invalidFood = await saveFeeding(admin, failureId, selection.included, selection.excluded, { p_food_catalog_id: 2147483647, p_notes: notes("rollback") });
    expect(invalidFood.error).not.toBeNull();
    expect(dbQuery(`select id from core.feeding_logs where notes = ${lit(notes("rollback"))}`)).toHaveLength(0);
    expect(dbQuery(`select request_id from core.operational_batch_requests where request_id = ${lit(failureId)}::uuid`)).toHaveLength(0);
    const stars = lists(eligible("star_treatment", { systemId: refs.systemId }), [animals.middleStar.id]);
    const invalidStarId = newRequestId();
    const invalidStar = await saveStar(admin, invalidStarId, stars.included, stars.excluded, { p_amount: -1, p_notes: notes("star rollback") });
    expect(invalidStar.error).not.toBeNull();
    expect(dbQuery(`select id from core.star_treatments where notes = ${lit(notes("star rollback"))}`)).toHaveLength(0);
    expect(dbQuery(`select request_id from core.operational_batch_requests where request_id = ${lit(invalidStarId)}::uuid`)).toHaveLength(0);
  });

  test("all contributor roles succeed, Viewer is rejected, and ledger grants are constrained", async () => {
    const allFeeding = eligible("feeding", { systemId: refs.systemId });
    const allStars = eligible("star_treatment", { systemId: refs.systemId });
    const successful = [] as string[];
    for (const [role, email, password] of [
      ["admin", ADMIN_EMAIL, ADMIN_PASSWORD], ["tech", TECH_EMAIL, TECH_PASSWORD],
      ["volunteer", VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD],
    ] as const) {
      const client = await signInRoleClient(email, password);
      const feedId = newRequestId(); successful.push(feedId);
      const feedLists = lists(allFeeding, [animals.middleStar.id]);
      expect((await saveFeeding(client, feedId, feedLists.included, feedLists.excluded, { p_notes: notes(`${role} feed`) })).error).toBeNull();
      const starId = newRequestId(); successful.push(starId);
      const starLists = lists(allStars, [animals.middleStar.id]);
      expect((await saveStar(client, starId, starLists.included, starLists.excluded, { p_notes: notes(`${role} star`) })).error).toBeNull();
    }
    const viewer = await signInRoleClient(VIEWER_EMAIL, VIEWER_PASSWORD);
    const viewerFeedId = newRequestId();
    const viewerFeed = lists(allFeeding, [animals.smallStar.id]);
    expect((await saveFeeding(viewer, viewerFeedId, viewerFeed.included, viewerFeed.excluded)).error?.code).toBe("42501");
    const viewerStarId = newRequestId();
    const viewerStars = lists(allStars, [animals.smallStar.id]);
    expect((await saveStar(viewer, viewerStarId, viewerStars.included, viewerStars.excluded)).error?.code).toBe("42501");
    expect(dbQuery(`select request_id from core.operational_batch_requests where request_id = any(array[${successful.map(lit).join(",")}]::uuid[])`)).toHaveLength(6);
    expect(dbQuery(`select request_id from core.operational_batch_requests where request_id = any(array[${[viewerFeedId, viewerStarId].map(lit).join(",")}]::uuid[])`)).toHaveLength(0);

    const admin = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const tech = await signInRoleClient(TECH_EMAIL, TECH_PASSWORD);
    const volunteer = await signInRoleClient(VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
    for (const client of [admin, tech]) {
      const result = await client.from("operational_batch_requests").select("request_id").eq("request_id", successful[0]);
      expect(result.error).toBeNull(); expect(result.data).toHaveLength(1);
    }
    for (const client of [volunteer, viewer]) {
      const result = await client.from("operational_batch_requests").select("request_id").eq("request_id", successful[0]);
      expect(result.error ? [] : result.data).toHaveLength(0);
    }
    for (const client of [admin, tech, volunteer, viewer]) {
      expect((await client.from("operational_batch_requests").insert({ request_id: randomUUID() })).error).not.toBeNull();
      const update = await client.from("operational_batch_requests").update({ result: {} }).eq("request_id", successful[0]).select("request_id");
      expect(update.error ? [] : update.data).toHaveLength(0);
      const deletion = await client.from("operational_batch_requests").delete().eq("request_id", successful[0]).select("request_id");
      expect(deletion.error ? [] : deletion.data).toHaveLength(0);
    }
  });

  test("native role mismatch cannot be safely minted by the shared test helper", async () => {
    test.skip(true, "helpers.ts only signs in the seeded role-matched accounts; a mismatched JWT/profile role would require changing a pre-existing profile or provisioning a disposable Auth account.");
  });
});
/**
 * Animal setup: Settings > Animal setup (components/settings/animal-setup-{manager,form}.tsx,
 * app/protected/settings/animal-setup/, lib/validation/animal-setup.ts). Tanks are found or created
 * from shelf position + size, animals move between them, and retiring records status + date.
 * Works on a throwaway system so real lab animals are never touched. Tier 3 per
 * docs/testing-strategy.md. Extend this file for further animal-setup changes.
 */
import { test, expect } from "@playwright/test";
import {
  cleanupStep,
  daysAgoDateString,
  dbQuery,
  login,
  gotoHydrated,
  loginAs,
  RUN_TAG,
  signInRoleClient,
  sqlLiteral,
  TECH_PASSWORD,
  todayDateString,
  VOLUNTEER_EMAIL,
  VOLUNTEER_PASSWORD,
} from "./helpers";

const SYSTEM_NAME = `E2E Animals ${RUN_TAG}`;
const SYSTEM_SLUG = `e2e-animals-${RUN_TAG}`;
const STAR = `E2E Star ${RUN_TAG}`;
const COHORT = `E2E Cohort ${RUN_TAG}`;

let systemId: number;

function tankRows() {
  return dbQuery(
    `select name, tank_type, shelf_position, size_liters from core.tanks where system_id = ${systemId} order by name`,
  );
}

function animalRow(name: string) {
  return dbQuery(
    `select a.status, a.retired_on::text, a.quantity, a.tracking_type, t.name as tank
     from core.animals a join core.tanks t on t.id = a.tank_id where a.name = ${sqlLiteral(name)}`,
  )[0];
}

test.describe("animal setup", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");
  test.skip(!VOLUNTEER_PASSWORD, "E2E_TEST_VOLUNTEER_PASSWORD not set");

  test.beforeAll(() => {
    systemId = Number(
      dbQuery(
        `insert into core.systems (slug, name, category) values (${sqlLiteral(SYSTEM_SLUG)}, ${sqlLiteral(SYSTEM_NAME)}, 'grow_out') returning id`,
      )[0].id,
    );
  });

  test.afterAll(async () => {
    await cleanupStep("delete animal setup fixtures", () => {
      dbQuery(
        `delete from core.animals where tank_id in (select id from core.tanks where system_id = ${systemId})`,
      );
      dbQuery(`delete from core.systems where id = ${systemId}`);
    });
  });

  test("a technician adds animals and the tank is created from position and size", async ({ page }) => {
    await login(page);
    await gotoHydrated(page, "/protected/settings/animal-setup");
    await expect(page.getByRole("heading", { name: "Animal setup", level: 1 })).toBeVisible();
    await page.getByLabel("System", { exact: true }).selectOption({ label: SYSTEM_NAME });
    await expect(page.getByText(`No tanks in ${SYSTEM_NAME} yet`)).toBeVisible();

    await page.getByRole("button", { name: "Add animal" }).click();
    const form = page.getByRole("form", { name: "Add animal" });
    await form.getByRole("button", { name: "Add animal" }).click();
    await expect(form.getByText("Enter the animal's name")).toBeVisible();
    await expect(form.getByLabel("Species")).toHaveAccessibleDescription("Select a species");
    await expect(form.getByText("Enter the size in liters, e.g. 9.6")).toBeVisible();

    await form.getByLabel("Name").fill(STAR);
    await form.getByLabel("Species").selectOption({ label: "Bat star" });
    await form.getByLabel("Shelf position (optional)").selectOption({ label: "Lower" });
    await form.getByLabel("Tank size (L)").fill("9.6");
    await expect(form.getByText("Tank name: Lower-9.6L (new tank)")).toBeVisible();
    await form.getByRole("button", { name: "Add animal" }).click();
    await expect(page.getByRole("status")).toContainText(`${STAR} added to Lower-9.6L.`);

    await page.getByRole("button", { name: "Add animal" }).click();
    await form.getByLabel("Name").fill(COHORT);
    await form.getByLabel("Species").selectOption({ label: "Bat star" });
    await form.getByLabel("Tracking").selectOption("cohort");
    await form.getByLabel("Quantity").fill("12");
    await form.getByLabel("Tank size (L)").fill("9.6");
    await expect(form.getByText("Tank name: 9.6L (new tank)")).toBeVisible();
    await form.getByRole("button", { name: "Add animal" }).click();
    await expect(page.getByRole("status")).toContainText(`${COHORT} added to 9.6L.`);

    expect(tankRows()).toEqual([
      { name: "9.6L", tank_type: "shelf", shelf_position: null, size_liters: "9.6" },
      { name: "Lower-9.6L", tank_type: "shelf", shelf_position: "lower", size_liters: "9.6" },
    ]);
    expect(animalRow(COHORT)).toMatchObject({ tracking_type: "cohort", quantity: 12, tank: "9.6L" });
  });

  test("names are unique across the lab", async ({ page }) => {
    await login(page);
    await gotoHydrated(page, "/protected/settings/animal-setup");
    await page.getByLabel("System", { exact: true }).selectOption({ label: SYSTEM_NAME });
    await page.getByRole("button", { name: "Add animal" }).click();
    const form = page.getByRole("form", { name: "Add animal" });
    await form.getByLabel("Name").fill(STAR);
    await form.getByLabel("Species").selectOption({ label: "Bat star" });
    await form.getByLabel("Tank size (L)").fill("5");
    await expect(form.getByText("Tank name: 5L (new tank)")).toBeVisible();
    await form.getByRole("button", { name: "Add animal" }).click();
    await expect(form.getByRole("alert")).toContainText(`An animal named ${STAR} already exists`);
    // The rejected save must not leave the new tank behind.
    expect(tankRows().map((tank) => tank.name)).toEqual(["9.6L", "Lower-9.6L"]);
  });

  test("moving an animal to a custom position reuses or creates the tank", async ({ page }) => {
    await login(page);
    await gotoHydrated(page, "/protected/settings/animal-setup");
    await page.getByLabel("System", { exact: true }).selectOption({ label: SYSTEM_NAME });
    await page.getByRole("button", { name: `Edit or move ${STAR}` }).click();

    const form = page.getByRole("form", { name: `Edit ${STAR}` });
    await expect(form.getByLabel("Shelf position (optional)")).toHaveValue("lower");
    await expect(form.getByLabel("Tank size (L)")).toHaveValue("9.6");
    await form.getByLabel("Shelf position (optional)").selectOption({ label: "Other" });
    await form.getByLabel("Other position (optional)").fill("Upper");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByText("Choose Upper from the list instead")).toBeVisible();

    await form.getByLabel("Other position (optional)").fill("mIDDLE");
    await expect(form.getByText("Tank name: Middle-9.6L (new tank)")).toBeVisible();
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText(`${STAR} moved to Middle-9.6L.`);

    expect(animalRow(STAR)).toMatchObject({ status: "active", tank: "Middle-9.6L" });
    expect(tankRows().find((tank) => tank.name === "Middle-9.6L")).toMatchObject({ shelf_position: null });
    await expect(page.getByRole("region", { name: "Lower-9.6L" })).toContainText("Empty");

    // Editing again prefills the custom label.
    await page.getByRole("button", { name: `Edit or move ${STAR}` }).click();
    await expect(form.getByLabel("Other position (optional)")).toHaveValue("Middle");
  });

  test("retiring records the reason and date, and reactivating clears them", async ({ page }) => {
    await login(page);
    await gotoHydrated(page, "/protected/settings/animal-setup");
    await page.getByLabel("System", { exact: true }).selectOption({ label: SYSTEM_NAME });
    await page.getByRole("button", { name: `Retire ${STAR}` }).click();

    const retireForm = page.getByRole("form", { name: `Retire ${STAR}` });
    await retireForm.getByLabel("Reason").selectOption({ label: "Transferred" });
    await retireForm.getByLabel("Date", { exact: true }).fill(daysAgoDateString(400));
    await retireForm.getByRole("button", { name: "Retire" }).click();
    await expect(retireForm.getByText("Date can't be before the date added")).toBeVisible();

    await retireForm.getByLabel("Date", { exact: true }).fill(todayDateString());
    await retireForm.getByRole("button", { name: "Retire" }).click();
    await expect(page.getByRole("status")).toContainText(`${STAR} retired (transferred).`);
    expect(animalRow(STAR)).toMatchObject({ status: "transferred", retired_on: todayDateString() });

    await page.getByText("Retired animals (1)").click();
    await page.getByRole("button", { name: `Reactivate ${STAR}` }).click();
    const reactivateForm = page.getByRole("form", { name: `Reactivate ${STAR}` });
    await reactivateForm.getByLabel("Shelf position (optional)").selectOption({ label: "Lower" });
    await reactivateForm.getByRole("button", { name: "Reactivate" }).click();
    await expect(page.getByRole("status")).toContainText(`${STAR} reactivated in Lower-9.6L.`);
    expect(animalRow(STAR)).toMatchObject({ status: "active", retired_on: null, tank: "Lower-9.6L" });
  });

  test("saving without changing the placement keeps an animal in a tank with an older name", async ({ page }) => {
    const legacy = `E2E Legacy ${RUN_TAG}`;
    dbQuery(`insert into core.tanks (system_id, name, tank_type, size_liters) values (${systemId}, 'Small', 'shelf', 3)`);
    dbQuery(
      `insert into core.animals (tank_id, species_id, name, tracking_type, quantity, status, date_added)
       select t.id, (select id from core.species where common_name = 'Bat star'), ${sqlLiteral(legacy)}, 'individual', 1, 'active', (now() at time zone 'America/Los_Angeles')::date
       from core.tanks t where t.system_id = ${systemId} and t.name = 'Small'`,
    );

    await login(page);
    await gotoHydrated(page, "/protected/settings/animal-setup");
    await page.getByLabel("System", { exact: true }).selectOption({ label: SYSTEM_NAME });
    await page.getByRole("button", { name: `Edit or move ${legacy}` }).click();
    const form = page.getByRole("form", { name: `Edit ${legacy}` });
    await form.getByLabel("Life stage (optional)").fill("Juvenile");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status")).toContainText(`${legacy} saved.`);

    expect(animalRow(legacy)).toMatchObject({ tank: "Small" });
    expect(tankRows().map((tank) => tank.name)).not.toContain("Small-3L");
  });

  test("a volunteer gets a 404 and cannot change animals or tanks", async ({ page }) => {
    await loginAs(page, VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
    await page.goto("/protected/settings/animal-setup");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();

    const client = await signInRoleClient(VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD);
    const { error: tankError } = await client
      .from("tanks")
      .insert({ system_id: systemId, name: "Left-5L", tank_type: "shelf", shelf_position: "left" });
    expect(tankError).not.toBeNull();
    const { data: updated } = await client
      .from("animals")
      .update({ status: "deceased", retired_on: todayDateString() })
      .eq("name", STAR)
      .select("id");
    expect(updated ?? []).toHaveLength(0);
  });

  test("the database ties retired_on to status and accepts the new positions", async () => {
    const id = Number(dbQuery(`select id from core.animals where name = ${sqlLiteral(STAR)}`)[0].id);
    expect(() => dbQuery(`update core.animals set retired_on = current_date where id = ${id}`)).toThrow();
    expect(() => dbQuery(`update core.animals set status = 'deceased' where id = ${id}`)).toThrow();
    expect(() =>
      dbQuery(`update core.animals set status = 'deceased', retired_on = date_added - 1 where id = ${id}`),
    ).toThrow();
    expect(() =>
      dbQuery(
        `insert into core.tanks (system_id, name, tank_type, shelf_position) values (${systemId}, 'Middle-5L', 'shelf', 'middle')`,
      ),
    ).toThrow();
    dbQuery(
      `insert into core.tanks (system_id, name, tank_type, shelf_position) values (${systemId}, 'Right-5L', 'shelf', 'right')`,
    );
  });
});

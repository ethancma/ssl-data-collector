/**
 * Star treatment verification: role visibility, RPC-only writes, current-row lifecycle,
 * correction/deletion permissions, list filters, and the Probiotics boundary.
 * Hosted writes are gated by a read-only schema probe and tagged for RPC cleanup.
 */
import { expect, test, type Page } from "@playwright/test";

import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TECH_EMAIL,
  TECH_PASSWORD,
  VIEWER_EMAIL,
  VIEWER_PASSWORD,
  VOLUNTEER_EMAIL,
  VOLUNTEER_PASSWORD,
  cleanupStep,
  collectBrowserFailures,
  dbQuery,
  loginAs,
  RUN_TAG,
  signInRoleClient,
} from "./helpers";

const TAG = `${RUN_TAG}-star-treatment-${Date.now()}`;
const LAB_TIME_ZONE = "America/Los_Angeles";
const PICKED_TIME = "05:37";
const EXPECTED_NEXT_REDIRECT_FAILURES = new Set([
  "pageerror: Failed to execute 'measure' on 'Performance': '\u200bDailyOperationsPage' cannot have a negative time stamp.",
  "pageerror: Router action dispatched before initialization",
  "pageerror: Internal Next.js error: Router action dispatched before initialization.",
  "console: Error: Router action dispatched before initialization",
  "console: Encountered a script tag while rendering React component. Scripts inside React components are never executed when rendering on the client. Consider using template tag instead (https://developer.mozilla.org/en-US/docs/Web/HTML/Element/template).",
]);

type EligibleStar = {
  id: number;
  name: string;
  tankId: number;
  tankName: string;
  systemId: number;
  systemName: string;
};

type SchemaStatus = {
  available: boolean;
  missing: string[];
};

type ProfileAccessState = {
  status: string;
  role: string | null;
};

let viewerProfileState: ProfileAccessState | undefined;

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

test.beforeAll(() => {
  const row = dbQuery(`select status, role
    from core.profiles where email = ${sqlLiteral(VIEWER_EMAIL)}`)[0];
  expect(row).toBeTruthy();
  viewerProfileState = {
    status: String(row.status),
    role: row.role === null ? null : String(row.role),
  };
  dbQuery(`update core.profiles
    set status = 'active', role = 'viewer'
    where email = ${sqlLiteral(VIEWER_EMAIL)}`);
});

test.afterAll(() => {
  return cleanupStep("restore Star-treatment viewer profile", () => {
    if (!viewerProfileState) return;
    const originalRole = viewerProfileState.role
      ? sqlLiteral(viewerProfileState.role)
      : "null";
    dbQuery(`update core.profiles
      set status = ${sqlLiteral(viewerProfileState.status)}, role = ${originalRole}
      where email = ${sqlLiteral(VIEWER_EMAIL)}`);
  });
});

function labDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LAB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`;
}

function labDateTime(timestamp: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LAB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

function labDisplayDateTime(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: LAB_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function probeStarSchema(): SchemaStatus {
  let row: Record<string, unknown> | undefined;
  try {
    row = dbQuery(`select
      to_regclass('core.star_treatments')::text as star_treatments,
      to_regclass('core.operational_log_audit')::text as operational_log_audit,
      to_regclass('core.star_treatment_catalog')::text as star_treatment_catalog,
      to_regprocedure('core.create_star_treatment(integer,integer,numeric,text,numeric,text,text,text,timestamp with time zone,integer)')::text as create_rpc,
      to_regprocedure('core.update_star_treatment(integer,text,numeric,text,numeric,text,text,integer)')::text as update_rpc,
      to_regprocedure('core.hard_delete_star_treatment(integer)')::text as delete_rpc,
      exists (
        select 1 from pg_trigger
        where tgname = 'chemical_additions_validate_mutation' and not tgisinternal
      ) as chemical_guard`)[0];
  } catch {
    return { available: false, missing: ["schema_probe_unavailable"] };
  }
  const required = {
    star_treatments: row?.star_treatments,
    operational_log_audit: row?.operational_log_audit,
    star_treatment_catalog: row?.star_treatment_catalog,
    create_rpc: row?.create_rpc,
    update_rpc: row?.update_rpc,
    delete_rpc: row?.delete_rpc,
    chemical_guard: row?.chemical_guard,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  return { available: missing.length === 0, missing };
}

async function blockRestMutations(page: Page) {
  const attempts: string[] = [];
  await page.route("**/rest/v1/**", async (route) => {
    const method = route.request().method();
    if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
      attempts.push(`${method} ${new URL(route.request().url()).pathname}`);
      await route.abort();
      return;
    }
    await route.continue();
  });
  return attempts;
}

async function openStarTreatmentForm(
  page: Page,
  email: string,
  password: string,
  star: EligibleStar,
) {
  await loginAs(page, email, password);
  await page.goto("/protected/daily-operations");
  await page.getByRole("link", { name: "Star treatment" }).click();
  await expect(page).toHaveURL(/type=star-treatment/);
  // A select change fired before hydration is dropped, so retry until Tank enables.
  await expect(async () => {
    await page.getByLabel("System", { exact: true }).selectOption(String(star.systemId));
    await expect(page.getByLabel("Tank", { exact: true })).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel("Tank", { exact: true }).selectOption(String(star.tankId));
  await page.getByLabel("Treated star").selectOption(String(star.id));
}

function treatmentArticle(page: Page, treatmentId: number) {
  return page.locator(`article[data-treatment-id="${treatmentId}"]`);
}

function expectNoUnexpectedRedirectFailures(failures: string[]) {
  const unexpected = unexpectedRedirectFailures(failures);
  expect(unexpected, failures.join("\n")).toEqual([]);
}

function unexpectedRedirectFailures(failures: string[]) {
  return failures.filter(
    (failure) => !EXPECTED_NEXT_REDIRECT_FAILURES.has(failure),
  );
}

test.describe("Star treatments: role visibility and no-access behavior", () => {
  const visibleRoles = [
    ["Admin", ADMIN_EMAIL, ADMIN_PASSWORD],
    ["Technician", TECH_EMAIL, TECH_PASSWORD],
    ["Volunteer", VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD],
  ] as const;

  for (const [role, email, password] of visibleRoles) {
    test(`${role} sees Star treatment and can open its list`, async ({ page }) => {
      test.skip(!password, `E2E_TEST_${role.toUpperCase()}_PASSWORD not set`);
      const browserFailures = collectBrowserFailures(page);
      await loginAs(page, email, password);
      await page.goto("/protected/daily-operations");
      await expect(page.getByRole("link", { name: "Star treatment" })).toBeVisible();
      const response = await page.goto("/protected/star-treatments");
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: "Star treatments" })).toBeVisible();
      expect(browserFailures, browserFailures.join("\n")).toEqual([]);
    });
  }

  test("Viewer has no Star treatment control and receives not-found on direct access", async ({
    page,
  }) => {
    test.skip(!VIEWER_PASSWORD, "E2E_TEST_VIEWER_PASSWORD not set");
    const browserFailures = collectBrowserFailures(page);
    await loginAs(page, VIEWER_EMAIL, VIEWER_PASSWORD);
    await page.goto("/protected/daily-operations");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Star treatment" })).toHaveCount(0);
    await page.goto("/protected/star-treatments");
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "This page could not be found." }),
    ).toBeVisible();
    const expectedNotFound = [
      /^response: 404 GET https?:\/\/[^/]+\/protected\/(daily-operations|star-treatments)/,
      /^console: Failed to load resource: the server responded with a status of 404/,
    ];
    expectNoUnexpectedRedirectFailures(
      browserFailures.filter((failure) => !expectedNotFound.some((pattern) => pattern.test(failure))),
    );
  });

  test("signed-out access redirects to login", async ({ page }) => {
    const browserFailures = collectBrowserFailures(page);
    await page.goto("/protected/star-treatments");
    await expect(page).toHaveURL(/\/auth\/login/);
    expectNoUnexpectedRedirectFailures(browserFailures);
  });
});

test.describe("Star treatments: URL controls and client validation", () => {
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");

  test("form filters persist in the URL and invalid input never attempts a write", async ({
    page,
  }) => {
    const mutationAttempts = await blockRestMutations(page);
    const browserFailures = collectBrowserFailures(page);
    const today = labDateString();

    await loginAs(page, TECH_EMAIL, TECH_PASSWORD);
    await page.goto("/protected/daily-operations?type=star-treatment");
    await expect(
      page.getByText(
        "Record a treatment for every individually tracked star in a system or tank, or for one star.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Administered date")).toHaveValue(today);
    await expect(page.getByLabel("Administered date")).toHaveAttribute("min", today);
    await expect(page.getByLabel("Administered date")).toHaveAttribute("max", today);
    await expect(page.locator("#star-treatment-time")).toHaveValue(/^\d{2}:\d{2}$/);
    await expect(page.getByLabel("Probiotics", { exact: true })).toBeChecked();
    await expect(page.locator("#star-treatment-unit")).toHaveValue("mL");
    await expect(page.locator("#star-treatment-concentration-unit")).toHaveValue("ppm");

    const system = page.getByLabel("System", { exact: true });
    const systemId = await system.locator("option:not([value=''])").first().getAttribute("value");
    expect(systemId).toBeTruthy();
    await system.selectOption(systemId ?? "");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("system"))
      .toBe(systemId);
    const tank = page.getByLabel("Tank", { exact: true });
    const tankId = await tank.locator("option:not([value=''])").first().getAttribute("value");
    expect(tankId).toBeTruthy();
    await tank.selectOption(tankId ?? "");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("tank"))
      .toBe(tankId);
    const treatedStar = page.getByLabel("Treated star");
    const animalId = await treatedStar
      .locator("option:not([value=''])")
      .first()
      .getAttribute("value");
    expect(animalId).toBeTruthy();
    await treatedStar.selectOption(animalId ?? "");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("animal"))
      .toBe(animalId);

    await page.getByLabel("Other", { exact: true }).check();
    await expect(page.getByLabel("Treatment name")).toBeVisible();
  await expect(page.locator("#star-treatment-unit")).toHaveValue("");
  await expect(page.locator("#star-treatment-concentration-unit")).toHaveValue("");
    await page.getByRole("button", { name: "Save 1 treatment" }).click();
    await expect(page.getByText("Enter the treatment name")).toBeVisible();
    await expect(page.getByText("Enter an amount or concentration")).toBeVisible();

    await page.getByLabel("Administered date").fill(addDays(today, -1));
    await page.locator("#star-treatment-amount").fill("-1");
    await page.getByRole("button", { name: "Save 1 treatment" }).click();
    await expect(page.getByText("Date must be today in the lab")).toBeVisible();
    await expect(page.getByText("Enter a positive number")).toBeVisible();

    await page.locator("#star-treatment-amount").fill("2.5");
    await expect(page.locator("#star-treatment-unit")).toHaveValue("");
    await page.getByRole("button", { name: "Save 1 treatment" }).click();
    await expect(page.getByText("Enter an amount unit")).toBeVisible();
    await page.locator("#star-treatment-unit").selectOption("mL");
    await page.locator("#star-treatment-amount").fill("");
    await page.locator("#star-treatment-concentration").fill("10");
    await expect(page.locator("#star-treatment-concentration-unit")).toHaveValue("");
    await page.getByRole("button", { name: "Save 1 treatment" }).click();
    await expect(page.getByText("Enter a concentration unit")).toBeVisible();
    expect(mutationAttempts).toEqual([]);

    await page.getByLabel("Administered date").fill(today);
    await page.locator("#star-treatment-concentration").fill("");
    await page.getByLabel("Reef Dip", { exact: true }).check();
    await expect(page.locator("#star-treatment-amount")).toHaveValue("");
    await expect(page.locator("#star-treatment-unit")).toHaveValue("");
    await expect(page.locator("#star-treatment-concentration")).toHaveValue("");
    await expect(page.locator("#star-treatment-concentration-unit")).toHaveValue("");
    await page.getByRole("button", { name: "Save 1 treatment" }).click();
    await expect.poll(() => mutationAttempts).toEqual([
      "POST /rest/v1/rpc/create_star_treatment_batch",
    ]);
    await expect(page.getByText("Enter an amount or concentration")).toHaveCount(0);
    await expect
      .poll(() => unexpectedRedirectFailures(browserFailures))
      .toEqual([
        expect.stringMatching(
          /^requestfailed: POST .*\/rest\/v1\/rpc\/create_star_treatment_batch /,
        ),
        "console: Failed to load resource: net::ERR_FAILED",
      ]);
  });
});

test.describe("Star treatments: Probiotics stays out of system chemical additions", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");

  test("chemical addition form rejects Probiotics without creating a row", async ({ page }) => {
    const reason = `${TAG} prohibited chemical`;
    const browserFailures = collectBrowserFailures(page);
    expect(
      dbQuery(`select id from core.chemical_additions
        where reason = ${sqlLiteral(reason)}`),
    ).toHaveLength(0);

    await loginAs(page, TECH_EMAIL, TECH_PASSWORD);
    await page.goto("/protected/daily-operations?type=chemical-addition");
    const system = page.getByLabel("System", { exact: true });
    const systemId = await system.locator("option:not([value=''])").first().getAttribute("value");
    expect(systemId).toBeTruthy();
    await system.selectOption(systemId ?? "");
    await page.getByRole("radio", { name: "Other", exact: true }).check();
    await page.getByLabel("Chemical/product name").fill("Probiotics");
    await page.getByLabel("Amount", { exact: true }).fill("10");
    await page.getByLabel("Unit", { exact: true }).selectOption("ppm");
    await page.getByLabel("Reason", { exact: true }).fill(reason);
    await system.selectOption(systemId ?? "");
    await expect(system).toHaveValue(systemId ?? "");
    const rejectedResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/rest/v1/chemical_additions",
    );
    await page.getByRole("button", { name: "Save system addition" }).click();
    const rejectedResponse = await rejectedResponsePromise;

    expect(rejectedResponse.status()).toBe(400);
    await expect(
      page.getByText("Record Probiotics as an individual Star treatment"),
    ).toBeVisible();
    await expect(page).toHaveURL(/type=chemical-addition/);
    expect(
      dbQuery(`select id from core.chemical_additions
        where reason = ${sqlLiteral(reason)}`),
    ).toHaveLength(0);
    await expect.poll(() => browserFailures).toEqual([
      expect.stringMatching(
        /^response: 400 POST .*\/rest\/v1\/chemical_additions/,
      ),
      // Status text is empty over hosted HTTP/2 and "Bad Request" on the local stack.
      expect.stringMatching(
        /^console: Failed to load resource: the server responded with a status of 400 \((Bad Request)?\)$/,
      ),
    ]);
  });
});

test.describe("Star treatments: hosted schema, RPC, and lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!ADMIN_PASSWORD, "E2E_TEST_ADMIN_PASSWORD not set");
  test.skip(!TECH_PASSWORD, "E2E_TEST_TECH_PASSWORD not set");
  test.skip(!VOLUNTEER_PASSWORD, "E2E_TEST_VOLUNTEER_PASSWORD not set");
  test.skip(!VIEWER_PASSWORD, "E2E_TEST_VIEWER_PASSWORD not set");

  let schemaStatus: SchemaStatus = { available: false, missing: [] };
  let star: EligibleStar;
  let technicianProfileId: number;
  let adminProfileId: number;
  let volunteerProfileId: number;
  let probioticsCatalogId: number;
  let reefDipCatalogId: number;
  let probioticsId: number;
  let probioticsAdministeredAt: string;
  let reefDipId: number;
  let customTreatmentId: number;
  let volunteerTreatmentId: number;

  test.beforeAll(() => {
    schemaStatus = probeStarSchema();
    if (!schemaStatus.available) return;

    const starRow = dbQuery(`select
      animal.id,
      animal.name,
      animal.tank_id,
      tank.name as tank_name,
      system.id as system_id,
      system.name as system_name
    from core.animals as animal
    join core.species as species on species.id = animal.species_id
    join core.tanks as tank on tank.id = animal.tank_id
    join core.systems as system on system.id = tank.system_id
    where animal.status = 'active'
      and animal.tracking_type = 'individual'
      and species.category = 'star'
    order by animal.name
    limit 1`)[0];
    expect(starRow).toBeTruthy();
    star = {
      id: Number(starRow.id),
      name: String(starRow.name),
      tankId: Number(starRow.tank_id),
      tankName: String(starRow.tank_name),
      systemId: Number(starRow.system_id),
      systemName: String(starRow.system_name),
    };
    technicianProfileId = Number(
      dbQuery(
        `select id from core.profiles where email = ${sqlLiteral(TECH_EMAIL)}`,
      )[0]?.id,
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
    expect(technicianProfileId).toBeGreaterThan(0);
    expect(adminProfileId).toBeGreaterThan(0);
    expect(volunteerProfileId).toBeGreaterThan(0);
    const catalog = dbQuery(`select id, name
      from core.star_treatment_catalog order by id`);
    probioticsCatalogId = Number(
      catalog.find((item) => item.name === "Probiotics")?.id,
    );
    reefDipCatalogId = Number(catalog.find((item) => item.name === "Reef Dip")?.id);
    expect(probioticsCatalogId).toBeGreaterThan(0);
    expect(reefDipCatalogId).toBeGreaterThan(0);
  });

  test.beforeEach(() => {
    test.skip(
      !schemaStatus.available,
      `Hosted Star treatment schema is unavailable: ${schemaStatus.missing.join(", ")}`,
    );
  });

  test.afterAll(async () => {
    if (!schemaStatus.available) return;
    await cleanupStep("restore Reef Dip catalog entry", () => {
      if (reefDipCatalogId > 0) {
        dbQuery(`update core.star_treatment_catalog
          set name = 'Reef Dip', is_active = true, default_amount_unit = null,
              default_concentration_unit = null
          where id = ${reefDipCatalogId}`);
      }
    });
    await cleanupStep("delete tagged Star treatments", () => dbQuery(
      `delete from core.star_treatments where notes like ${sqlLiteral(`${TAG}%`)}`,
    ));
  });

  test("exact Star Treatment seeds expose the approved defaults", () => {
    const catalog = dbQuery(`select name, default_amount_unit,
        default_concentration_unit
      from core.star_treatment_catalog order by id`);
    expect(catalog).toEqual([
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
  });

  test("Technician creates concentration-only Probiotics with provenance", async ({
    page,
  }) => {
    const notes = `${TAG} probiotics concentration-only`;
    await openStarTreatmentForm(page, TECH_EMAIL, TECH_PASSWORD, star);
    const today = labDateString();
    await expect(page.getByLabel("Administered date")).toHaveValue(today);
    await page.getByLabel("Time").fill(PICKED_TIME);
    await page.locator("#star-treatment-concentration").fill("10");
    await expect(page.locator("#star-treatment-concentration-unit")).toHaveValue("ppm");
    await page.getByLabel("Notes").fill(notes);

    await page.getByLabel("Administered date").fill(addDays(today, -1));
    await page.getByRole("button", { name: "Save 1 treatment" }).click();
    await expect(page.getByText("Date must be today in the lab")).toBeVisible();
    expect(
      dbQuery(`select id from core.star_treatments where notes = ${sqlLiteral(notes)}`),
    ).toHaveLength(0);

    await page.getByLabel("Administered date").fill(today);
    const submittedAfter = Date.now();
    await page.getByRole("button", { name: "Save 1 treatment" }).click();
    await expect(page.getByRole("heading", { name: "Star treatment saved" })).toBeVisible();

    const row = dbQuery(`select
      id, animal_id, tank_id, catalog_id, treatment_type, amount, unit, concentration,
      concentration_unit, notes, administered_at, recorded_by, data_source, entered_at
    from core.star_treatments
    where notes = ${sqlLiteral(notes)}`)[0];
    expect(row).toBeTruthy();
    probioticsId = Number(row.id);
    expect(Number(row.animal_id)).toBe(star.id);
    expect(Number(row.tank_id)).toBe(star.tankId);
    expect(Number(row.catalog_id)).toBe(probioticsCatalogId);
    expect(row.treatment_type).toBe("probiotics");
    expect(row.amount).toBeNull();
    expect(row.unit).toBeNull();
    expect(Number(row.concentration)).toBe(10);
    expect(row.concentration_unit).toBe("ppm");
    expect(Number(row.recorded_by)).toBe(technicianProfileId);
    expect(row.data_source).toBe("live");
    probioticsAdministeredAt = String(row.administered_at);
    expect(labDateTime(String(row.administered_at))).toEqual({
      date: today,
      time: PICKED_TIME,
    });
    const enteredAt = Date.parse(String(row.entered_at));
    expect(enteredAt).toBeGreaterThanOrEqual(submittedAfter - 5_000);
    expect(enteredAt).toBeLessThanOrEqual(Date.now() + 5_000);
  });

  test("Technician creates Reef Dip with neither amount nor concentration through the UI RPC", async ({
    page,
  }) => {
    const notes = `${TAG} Reef Dip empty measurements`;
    await openStarTreatmentForm(page, TECH_EMAIL, TECH_PASSWORD, star);
    await page.getByLabel("Reef Dip", { exact: true }).check();
    await expect(page.locator("#star-treatment-unit")).toHaveValue("");
    await expect(page.locator("#star-treatment-concentration-unit")).toHaveValue("");
    await page.getByLabel("Notes").fill(notes);
    await page.getByRole("button", { name: "Save 1 treatment" }).click();
    await expect(page.getByRole("heading", { name: "Star treatment saved" })).toBeVisible();

    const row = dbQuery(`select id, catalog_id, treatment_type, amount, unit,
        concentration, concentration_unit
      from core.star_treatments where notes = ${sqlLiteral(notes)}`)[0];
    reefDipId = Number(row.id);
    expect(reefDipId).toBeGreaterThan(0);
    expect(Number(row.catalog_id)).toBe(reefDipCatalogId);
    expect(row.treatment_type).toBe("reef_dip");
    expect(row.amount).toBeNull();
    expect(row.unit).toBeNull();
    expect(row.concentration).toBeNull();
    expect(row.concentration_unit).toBeNull();
  });

  test("RPC rejects empty non-Reef-Dip measurements and supplied values without units", async () => {
    const technicianClient = await signInRoleClient(TECH_EMAIL, TECH_PASSWORD);
    const base = {
      p_animal_id: star.id,
      p_tank_id: star.tankId,
      p_administered_at: new Date().toISOString(),
      p_catalog_id: null,
    };
    const invalidCases = [
      {
        ...base,
        p_treatment_type: "Custom bath",
        p_amount: null,
        p_unit: null,
        p_concentration: null,
        p_concentration_unit: null,
        p_notes: `${TAG} invalid empty custom`,
        message: "Amount or concentration is required unless the treatment is Reef Dip.",
      },
      {
        ...base,
        p_treatment_type: "Reef Dip",
        p_amount: 1,
        p_unit: null,
        p_concentration: null,
        p_concentration_unit: null,
        p_notes: `${TAG} invalid missing amount unit`,
        message: "Amount unit is required when amount is provided.",
      },
      {
        ...base,
        p_treatment_type: "Reef Dip",
        p_amount: null,
        p_unit: null,
        p_concentration: 2,
        p_concentration_unit: null,
        p_notes: `${TAG} invalid missing concentration unit`,
        message: "Concentration unit is required when concentration is provided.",
      },
    ];

    for (const { message, ...parameters } of invalidCases) {
      const { error } = await technicianClient.rpc("create_star_treatment", parameters);
      expect(error?.message).toContain(message);
    }
    expect(
      dbQuery(`select id from core.star_treatments
        where notes like ${sqlLiteral(`${TAG} invalid%`)}`),
    ).toHaveLength(0);
  });

  test("Technician creates an amount-only custom treatment with normalized type", async ({
    page,
  }) => {
    const notes = `${TAG} custom amount-only`;
    await openStarTreatmentForm(page, TECH_EMAIL, TECH_PASSWORD, star);
    await page.getByLabel("Time").fill("05:38");
    await page.getByLabel("Other").check();
    await page.getByLabel("Treatment name").fill("  E2E   Recovery   Bath  ");
    await page.locator("#star-treatment-amount").fill("2.5");
    await page.locator("#star-treatment-unit").selectOption("mL");
    await page.getByLabel("Notes").fill(notes);
    await page.getByRole("button", { name: "Save 1 treatment" }).click();
    await expect(page.getByRole("heading", { name: "Star treatment saved" })).toBeVisible();

    const row = dbQuery(`select
      id, animal_id, tank_id, catalog_id, treatment_type, amount, unit, concentration,
      concentration_unit, recorded_by, data_source, entered_at
    from core.star_treatments
    where notes = ${sqlLiteral(notes)}`)[0];
    customTreatmentId = Number(row.id);
    expect(Number(row.animal_id)).toBe(star.id);
    expect(Number(row.tank_id)).toBe(star.tankId);
    expect(row.catalog_id).toBeNull();
    expect(row.treatment_type).toBe("E2E Recovery Bath");
    expect(Number(row.amount)).toBe(2.5);
    expect(row.unit).toBe("mL");
    expect(row.concentration).toBeNull();
    expect(row.concentration_unit).toBeNull();
    expect(Number(row.recorded_by)).toBe(technicianProfileId);
    expect(row.data_source).toBe("live");
    expect(Date.parse(String(row.entered_at))).not.toBeNaN();
  });

  test("list display and filters isolate Probiotics, Other, and the selected star", async ({
    page,
  }) => {
    await loginAs(page, TECH_EMAIL, TECH_PASSWORD);
    await page.goto(
      `/protected/star-treatments?from=${labDateString()}&to=${labDateString()}&animal=${star.id}&treatment=other`,
    );
    const customArticle = treatmentArticle(page, customTreatmentId);
    await expect(customArticle).toBeVisible();
    await expect(customArticle).toContainText(`${star.name}: E2E Recovery Bath`);
    await expect(customArticle).toContainText("2.5 mL");
    await expect(treatmentArticle(page, probioticsId)).toHaveCount(0);
    await expect(page.getByLabel("Star")).toHaveValue(String(star.id));
    await expect(page.locator("#treatments-type")).toHaveValue("other");

    await page.locator("#treatments-type").selectOption("probiotics");
    await page.getByRole("button", { name: "Apply filters" }).click();
    const probioticsArticle = treatmentArticle(page, probioticsId);
    await expect(probioticsArticle).toBeVisible();
    await expect(probioticsArticle).toContainText(`${star.name}: Probiotics`);
    await expect(probioticsArticle).toContainText("No amount · 10 ppm");
    await expect(probioticsArticle).toContainText(
      labDisplayDateTime(probioticsAdministeredAt),
    );
    await expect(treatmentArticle(page, customTreatmentId)).toHaveCount(0);
  });

  test("built-in Star quick picks reject rename and delete but keep history and allow retirement", async ({
    page,
  }) => {
    const technicianClient = await signInRoleClient(TECH_EMAIL, TECH_PASSWORD);

    try {
      for (const [catalogId, name] of [
        [probioticsCatalogId, "Probiotics"],
        [reefDipCatalogId, "Reef Dip"],
      ] as const) {
        const { data: renamed, error: renameError } = await technicianClient
          .from("star_treatment_catalog")
          .update({ name: `${TAG} ${name} renamed` })
          .eq("id", catalogId)
          .select("id")
          .maybeSingle();
        expect(renameError?.code).toBe("23514");
        expect(renameError?.message).toContain("cannot be renamed");
        expect(renamed).toBeNull();

        const { data: deleted, error: deleteError } = await technicianClient
          .from("star_treatment_catalog")
          .delete()
          .eq("id", catalogId)
          .select("id")
          .maybeSingle();
        expect(deleteError?.code).toBe("23514");
        expect(deleteError?.message).toContain("cannot be deleted");
        expect(deleted).toBeNull();
      }

      const { data: retired, error: retireError } = await technicianClient
        .from("star_treatment_catalog")
        .update({ is_active: false, default_amount_unit: "mL" })
        .eq("id", reefDipCatalogId)
        .select("id, name, is_active, default_amount_unit")
        .single();
      expect(retireError).toBeNull();
      expect(retired).toEqual({
        id: reefDipCatalogId,
        name: "Reef Dip",
        is_active: false,
        default_amount_unit: "mL",
      });
      const { error: retiredCreateError } = await technicianClient.rpc(
        "create_star_treatment",
        {
          p_animal_id: star.id,
          p_tank_id: star.tankId,
          p_amount: null,
          p_unit: null,
          p_concentration: null,
          p_concentration_unit: null,
          p_treatment_type: "Reef Dip",
          p_notes: `${TAG} retired reef dip`,
          p_administered_at: new Date().toISOString(),
          p_catalog_id: reefDipCatalogId,
        },
      );
      expect(retiredCreateError?.code).toBe("23514");
      expect(retiredCreateError?.message).toContain(
        "Select an active star treatment quick pick.",
      );

      const historical = dbQuery(`select catalog_id, treatment_type, amount,
          unit, concentration, concentration_unit
        from core.star_treatments where id = ${reefDipId}`)[0];
      expect(Number(historical.catalog_id)).toBe(reefDipCatalogId);
      expect(historical.treatment_type).toBe("reef_dip");
      expect(historical.amount).toBeNull();
      expect(historical.unit).toBeNull();
    } finally {
      dbQuery(`update core.star_treatment_catalog
        set name = 'Reef Dip', is_active = true, default_amount_unit = null,
            default_concentration_unit = null
        where id = ${reefDipCatalogId}`);
    }
    expect(
      dbQuery(`select name, is_active, default_amount_unit, default_concentration_unit
        from core.star_treatment_catalog order by id`),
    ).toEqual([
      {
        name: "Probiotics",
        is_active: true,
        default_amount_unit: "mL",
        default_concentration_unit: "ppm",
      },
      {
        name: "Reef Dip",
        is_active: true,
        default_amount_unit: null,
        default_concentration_unit: null,
      },
    ]);

    await loginAs(page, TECH_EMAIL, TECH_PASSWORD);
    await page.goto("/protected/settings/quick-picks");
    const probioticsRow = page
      .locator(`#star-${probioticsCatalogId}-built-in-note`)
      .locator("..");
    await expect(probioticsRow.getByText("Probiotics", { exact: true })).toBeVisible();
    await expect(probioticsRow.getByRole("button", { name: "Delete" })).toBeDisabled();
    await expect(probioticsRow.getByRole("button", { name: "Retire" })).toBeEnabled();
    await probioticsRow.getByRole("button", { name: "Edit" }).click();
    await expect(page.locator(`#star-${probioticsCatalogId}-name`)).toBeDisabled();
    await expect(page.locator(`#star-${probioticsCatalogId}-name`)).toHaveValue("Probiotics");
    await page.getByRole("button", { name: "Cancel" }).click();
  });

  test("Volunteer corrects only their own treatment and cannot delete", async ({
    page,
  }) => {
    const ownNotes = `${TAG} volunteer owned`;
    const correctedNotes = `${TAG} volunteer corrected own`;
    const technicianTreatmentBefore = dbQuery(`select notes
      from core.star_treatments where id = ${probioticsId}`)[0];
    await openStarTreatmentForm(
      page,
      VOLUNTEER_EMAIL,
      VOLUNTEER_PASSWORD,
      star,
    );
    await page.getByLabel("Time").fill("05:39");
    await page.locator("#star-treatment-concentration").fill("11");
    await page.getByLabel("Notes").fill(ownNotes);
    await page.getByRole("button", { name: "Save 1 treatment" }).click();
    await expect(page.getByRole("heading", { name: "Star treatment saved" })).toBeVisible();

    const volunteerTreatment = dbQuery(`select
      id, animal_id, tank_id, administered_at, recorded_by, data_source, entered_at
      from core.star_treatments where notes = ${sqlLiteral(ownNotes)}`)[0];
    volunteerTreatmentId = Number(volunteerTreatment.id);
    expect(volunteerTreatmentId).toBeGreaterThan(0);
    expect(Number(volunteerTreatment.recorded_by)).toBe(volunteerProfileId);

    const volunteerClient = await signInRoleClient(
      VOLUNTEER_EMAIL,
      VOLUNTEER_PASSWORD,
    );
    const { error: otherUpdateError } = await volunteerClient.rpc(
      "update_star_treatment",
      {
        p_treatment_id: probioticsId,
        p_treatment_type: "probiotics",
        p_amount: null,
        p_unit: null,
        p_concentration: 12,
        p_concentration_unit: "ppm",
        p_notes: `${TAG} forbidden other-row correction`,
      },
    );
    expect(otherUpdateError).not.toBeNull();
    expect(otherUpdateError?.message).toContain(
      "Volunteers may update only their own operational rows.",
    );
    expect(
      dbQuery(`select notes from core.star_treatments where id = ${probioticsId}`)[0]
        ?.notes,
    ).toBe(technicianTreatmentBefore.notes);

    await page.goto(
      `/protected/star-treatments?from=${labDateString()}&to=${labDateString()}&animal=${star.id}&treatment=probiotics`,
    );
    const technicianArticle = treatmentArticle(page, probioticsId);
    await expect(technicianArticle).toBeVisible();
    await technicianArticle.getByText("View details", { exact: true }).click();
    await expect(
      technicianArticle.getByRole("button", { name: "Save correction" }),
    ).toHaveCount(0);
    await expect(
      technicianArticle.getByText("Delete treatment", { exact: true }),
    ).toHaveCount(0);

    const article = treatmentArticle(page, volunteerTreatmentId);
    await article.getByText("View details and correct").click();
    await article.locator(`#treatment-${volunteerTreatmentId}-concentration`).fill("12");
    await article.locator(`#treatment-${volunteerTreatmentId}-notes`).fill(correctedNotes);
    await article.getByRole("button", { name: "Save correction" }).click();
    await expect(article.getByText("Correction saved.")).toBeVisible();
    await expect(article.getByText("Delete treatment", { exact: true })).toHaveCount(0);

    const row = dbQuery(`select
      animal_id, tank_id, concentration, notes, administered_at, recorded_by, data_source, entered_at
      from core.star_treatments where id = ${volunteerTreatmentId}`)[0];
    expect(Number(row.concentration)).toBe(12);
    expect(row.notes).toBe(correctedNotes);
    expect(Number(row.animal_id)).toBe(Number(volunteerTreatment.animal_id));
    expect(Number(row.tank_id)).toBe(Number(volunteerTreatment.tank_id));
    expect(row.administered_at).toBe(volunteerTreatment.administered_at);
    expect(Number(row.recorded_by)).toBe(volunteerProfileId);
    expect(row.data_source).toBe(volunteerTreatment.data_source);
    expect(row.entered_at).toBe(volunteerTreatment.entered_at);

    const updateAudit = dbQuery(`select actor_profile_id,
        old_values ->> 'notes' as old_notes,
        new_values ->> 'notes' as new_notes
      from core.operational_log_audit
      where table_name = 'star_treatments'
        and row_id = ${volunteerTreatmentId}
        and action = 'UPDATE'
      order by id desc
      limit 1`)[0];
    expect(Number(updateAudit.actor_profile_id)).toBe(volunteerProfileId);
    expect(updateAudit.old_notes).toBe(ownNotes);
    expect(updateAudit.new_notes).toBe(correctedNotes);

    const { error: deleteError } = await volunteerClient.rpc("hard_delete_star_treatment", {
      p_treatment_id: volunteerTreatmentId,
    });
    expect(deleteError).not.toBeNull();
    expect(
      dbQuery(`select id from core.star_treatments where id = ${volunteerTreatmentId}`),
    ).toHaveLength(1);
  });

  test("Admin hard-deletes through the UI", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto(
      `/protected/star-treatments?from=${labDateString()}&to=${labDateString()}&animal=${star.id}&treatment=other`,
    );
    const article = treatmentArticle(page, customTreatmentId);
    await article.getByText("View details and correct").click();
    await article.getByText("Delete treatment", { exact: true }).click();
    await article.getByRole("button", { name: "Permanently delete treatment" }).click();
    await expect(article).toHaveCount(0);

    expect(
      dbQuery(`select id from core.star_treatments where id = ${customTreatmentId}`),
    ).toHaveLength(0);
    const deleteAudit = dbQuery(`select actor_profile_id,
        old_values ->> 'notes' as old_notes,
        new_values
      from core.operational_log_audit
      where table_name = 'star_treatments'
        and row_id = ${customTreatmentId}
        and action = 'DELETE'
      order by id desc
      limit 1`)[0];
    expect(Number(deleteAudit.actor_profile_id)).toBe(adminProfileId);
    expect(deleteAudit.old_notes).toBe(`${TAG} custom amount-only`);
    expect(deleteAudit.new_values).toBeNull();
  });

  test("direct table insert and Viewer SELECT are denied", async () => {
    const directNotes = `${TAG} forbidden direct insert`;
    const adminClient = await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD);
    const { error: insertError } = await adminClient.from("star_treatments").insert({
      animal_id: star.id,
      tank_id: star.tankId,
      treatment_type: "probiotics",
      concentration: 10,
      concentration_unit: "ppm",
      notes: directNotes,
      administered_at: new Date().toISOString(),
      recorded_by: adminProfileId,
      data_source: "live",
    });
    expect(insertError).not.toBeNull();
    expect(
      dbQuery(`select id from core.star_treatments where notes = ${sqlLiteral(directNotes)}`),
    ).toHaveLength(0);

    const viewerClient = await signInRoleClient(VIEWER_EMAIL, VIEWER_PASSWORD);
    const { data, error: selectError } = await viewerClient
      .from("star_treatments")
      .select("id")
      .eq("id", probioticsId)
      .maybeSingle();
    expect(selectError).not.toBeNull();
    expect(data).toBeNull();
  });

  test("RPC role matrix permits only the designed roles", async () => {
    const roleClients = {
      admin: await signInRoleClient(ADMIN_EMAIL, ADMIN_PASSWORD),
      technician: await signInRoleClient(TECH_EMAIL, TECH_PASSWORD),
      volunteer: await signInRoleClient(VOLUNTEER_EMAIL, VOLUNTEER_PASSWORD),
      viewer: await signInRoleClient(VIEWER_EMAIL, VIEWER_PASSWORD),
    };

    for (const [role, client] of Object.entries(roleClients)) {
      const { error: createError } = await client.rpc("create_star_treatment", {
        p_animal_id: star.id,
        p_tank_id: 0,
        p_amount: 1,
        p_unit: "mL",
        p_treatment_type: "reef_dip",
        p_notes: `${TAG} ${role} create matrix probe`,
      });
      expect(createError).not.toBeNull();
      if (role !== "viewer") {
        expect(createError?.message).toContain(
          "The selected tank does not match the star's current tank.",
        );
      }

      const { error: updateError } = await client.rpc("update_star_treatment", {
        p_treatment_id: 2_147_483_647,
        p_treatment_type: "reef_dip",
        p_amount: 1,
        p_unit: "mL",
        p_concentration: null,
        p_concentration_unit: null,
        p_notes: `${TAG} ${role} update matrix probe`,
      });
      expect(updateError).not.toBeNull();
      if (role !== "viewer") {
        expect(updateError?.message).toContain("does not exist");
      }

      const { error: deleteError } = await client.rpc("hard_delete_star_treatment", {
        p_treatment_id: 2_147_483_647,
      });
      expect(deleteError).not.toBeNull();
      if (role === "admin" || role === "technician") {
        expect(deleteError?.message).toContain("does not exist");
      } else {
        expect(deleteError?.message).not.toContain("does not exist");
      }
    }

    expect(
      dbQuery(`select id from core.star_treatments where notes like ${sqlLiteral(`${TAG}%matrix probe`)}`),
    ).toHaveLength(0);
  });
});
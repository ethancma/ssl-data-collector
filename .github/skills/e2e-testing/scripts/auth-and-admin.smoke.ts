/**
 * Auth & admin flows: sign-up lands as a pending profile, admin approves/denies it,
 * and role changes take effect. Covers app/protected/layout.tsx's ApprovalGate and
 * the /protected/admin user-management page. Extend this file for onboarding/approval
 * changes; see ../SKILL.md for the full procedure.
 */
import { test, expect, type Page } from "@playwright/test";
import { db, dbQuery, loginAs, RUN_TAG, ADMIN_EMAIL, ADMIN_PASSWORD } from "./helpers";

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

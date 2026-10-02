/**
 * App-managed invitation, reset-link, access-removal, restore, and Admin RBAC smoke tests.
 * See ../SKILL.md for the full procedure.
 */
import { test, expect, type Page } from "@playwright/test";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  cleanupStep,
  db,
  dbQuery,
  loginAs,
  RUN_TAG,
} from "./helpers";
import { getExpectedAuthRole, getRoleClaimAction, isPublicPath } from "../../../../lib/supabase/proxy";

const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const inviteEmail = `${RUN_TAG}-invite@example.test`;
const revokedEmail = `${RUN_TAG}-revoked@example.test`;
const invitePassword = "Invite-password-123!";
const resetPassword = "Reset-password-123!";
let inviteLink = "";

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function profile(email: string) {
  const rows = dbQuery(`select id, auth_user_id, email, status, role from core.profiles
    where email = ${sqlLiteral(email)}`);
  expect(rows).toHaveLength(1);
  return rows[0];
}

function invitation(email: string) {
  const rows = dbQuery(`select id, email, role, revoked_at, accepted_at from core.invitations
    where email = ${sqlLiteral(email)} order by id desc`);
  expect(rows.length).toBeGreaterThan(0);
  return rows[0];
}

function userRow(page: Page, email: string) {
  return page.locator("div.divide-y > div").filter({ hasText: email });
}

async function createInvite(page: Page, email: string, role: "admin" | "technician" | "volunteer" | "viewer") {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Role", { exact: true }).selectOption(role);
  if (role === "admin") page.once("dialog", (dialog) => dialog.accept());
  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/admin/invitations") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Create invite" }).click();
  expect((await responsePromise).status()).toBe(200);
  await expect(page.getByRole("status")).toContainText("shown only once");
  return page.getByLabel("Invite link").inputValue();
}

async function acceptInvite(page: Page, link: string, password = invitePassword) {
  await page.goto(link);
  await expect(page.getByText("Invited email", { exact: true })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/protected\/home/);
}

test.use({ trace: "off" });

test.describe("proxy role claim refresh policy", () => {
  test("uses only active valid profile roles for JWT claims", () => {
    for (const role of ["admin", "technician", "volunteer", "viewer"] as const) {
      expect(getExpectedAuthRole({ role, status: "active" })).toBe(role);
    }
    expect(getExpectedAuthRole({ role: "admin", status: "pending" })).toBe("authenticated");
    expect(getExpectedAuthRole({ role: "admin", status: "denied" })).toBe("authenticated");
    expect(getExpectedAuthRole({ role: null, status: "active" })).toBe("authenticated");
    expect(getExpectedAuthRole({ role: "owner", status: "active" })).toBe("authenticated");
    expect(getExpectedAuthRole(null)).toBe("authenticated");
  });

  test("refreshes one mismatch and signs out if the refreshed claim still differs", () => {
    expect(getRoleClaimAction("viewer", "admin")).toBe("refresh");
    expect(getRoleClaimAction("admin", "admin", true)).toBe("continue");
    expect(getRoleClaimAction("viewer", "admin", true)).toBe("sign-out");
  });

  test("keeps only the root, auth, and invite route trees public", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/auth/login")).toBe(true);
    expect(isPublicPath("/invite/some-token")).toBe(true);
    expect(isPublicPath("/invitations")).toBe(false);
    expect(isPublicPath("/authenticated-preview")).toBe(false);
    expect(isPublicPath("/protected")).toBe(false);
  });
});

test.describe("Google sign-in", () => {
  test("login button redirects to the Supabase Google authorize endpoint", async ({ page }) => {
    let authorizeUrl: URL | undefined;
    // Stops at Supabase's authorize endpoint so the test never reaches Google.
    await page.route("**/auth/v1/authorize**", async (route) => {
      authorizeUrl = new URL(route.request().url());
      await route.abort();
    });
    await page.goto("/auth/login");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect.poll(() => authorizeUrl?.searchParams.get("provider")).toBe("google");
    expect(authorizeUrl?.searchParams.get("redirect_to")).toMatch(/\/auth\/callback$/);
  });
});

test.describe("current invitation and Admin access lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!SECRET_KEY || !db, "requires SUPABASE_SECRET_KEY for cleanup and DB assertions");

  test.afterAll(async () => {
    if (!SECRET_KEY || !db) {
      console.warn("Auth-test cleanup skipped Auth user removal: db client is null.");
    }
    const createdEmails = [inviteEmail, revokedEmail];
    if (SECRET_KEY && db) {
      await cleanupStep("delete auth-and-admin test users", async () => {
        let pageNumber = 1;
        while (true) {
          const { data, error } = await db.auth.admin.listUsers({ page: pageNumber, perPage: 1000 });
          if (error) throw error;
          for (const user of data.users.filter((candidate) =>
            createdEmails.includes(candidate.email?.toLowerCase() ?? ""),
          )) {
            await cleanupStep(`delete auth user ${user.id}`, async () => {
              const { error: deleteError } = await db.auth.admin.deleteUser(user.id);
              if (deleteError) throw deleteError;
            });
          }
          if (data.users.length < 1000) break;
          pageNumber += 1;
        }
      });
    }
    await cleanupStep("delete auth-and-admin profiles", () => dbQuery(
      `delete from core.profiles where email in (${createdEmails.map(sqlLiteral).join(", ")}) returning id`,
    ));
    await cleanupStep("delete auth-and-admin invitation rows", () => dbQuery(
      `delete from core.invitations where email in (${createdEmails.map(sqlLiteral).join(", ")}) returning id`,
    ));
    await cleanupStep("report remaining auth-and-admin invitations", () => {
      const remaining = dbQuery(`select id, email from core.invitations
        where email in (${createdEmails.map(sqlLiteral).join(", ")}) order by id`);
      if (remaining.length > 0) {
        console.warn("Auth-test invitation rows remain after cleanup:", JSON.stringify(remaining));
      }
    });
  });

  test("Admin creates an invite, public GET does not consume it, and Google controls render", async ({ page, browser }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/protected/admin");
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    inviteLink = await createInvite(page, inviteEmail, "viewer");
    expect(invitation(inviteEmail)).toMatchObject({ email: inviteEmail, role: "viewer", revoked_at: null, accepted_at: null });
    expect(inviteLink).toMatch(new RegExp(`/invite/[^/]+$`));
    const inviteeContext = await browser.newContext();
    const invitee = await inviteeContext.newPage();
    try {
      await invitee.goto(inviteLink);
      await expect(invitee.getByText(inviteEmail)).toBeVisible();
      await expect(invitee.getByText("viewer", { exact: true })).toBeVisible();
      await expect(invitee.getByRole("button", { name: "Continue with Google" })).toBeVisible();
      await invitee.reload();
      expect(invitation(inviteEmail)).toMatchObject({ accepted_at: null, revoked_at: null });
      await invitee.goto("/invite/not-a-real-token");
      await expect(invitee.getByText(/invalid|expired|revoked|already/i)).toBeVisible();
    } finally {
      await invitee.close();
      await inviteeContext.close();
    }
  });

  test("accepts the password invite once and records the active invited role", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await acceptInvite(page, inviteLink);
      expect(profile(inviteEmail)).toMatchObject({ email: inviteEmail, status: "active", role: "viewer" });
      expect(invitation(inviteEmail).accepted_at).toBeTruthy();
      const replay = await context.newPage();
      await replay.goto(inviteLink);
      await expect(replay.getByText(/invalid|expired|revoked|already/i)).toBeVisible();
      await replay.close();
    } finally {
      await context.close();
    }
  });

  test("shows the login Google option and rejects Admin APIs for a technician", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await loginAs(page, process.env.E2E_TEST_TECH_EMAIL ?? "test-tech@ssl.dev", process.env.E2E_TEST_TECH_PASSWORD ?? "password");
    expect((await page.request.get("/api/admin/invitations")).status()).toBe(403);
    expect((await page.request.post(`/api/admin/users/${profile(inviteEmail).id}/reset-link`)).status()).toBe(403);
  });

  test("revokes an unused invite and leaves a generic public error", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/protected/admin");
    const link = await createInvite(page, revokedEmail, "technician");
    const id = Number(invitation(revokedEmail).id);
    page.once("dialog", (dialog) => dialog.accept());
    await userRow(page, revokedEmail).getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByText(revokedEmail)).toHaveCount(0);
    expect(invitation(revokedEmail).revoked_at).toBeTruthy();
    await page.goto(link);
    await expect(page.getByText(/invalid|expired|revoked|already/i)).toBeVisible();
    expect(id).toBeGreaterThan(0);
  });

  test("copies a reset link for an active user, does not consume on GET, and rejects replay", async ({ page, browser }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/protected/admin");
    const target = userRow(page, inviteEmail);
    const responsePromise = page.waitForResponse((response) => response.url().includes("/reset-link") && response.request().method() === "POST");
    await target.getByRole("button", { name: "Copy reset link" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const resetLink = (await response.json() as { link: string }).link;
    expect(resetLink).toContain("/auth/reset?token_hash=");
    const resetContext = await browser.newContext();
    const resetPage = await resetContext.newPage();
    try {
      await resetPage.goto(resetLink);
      await expect(resetPage.getByRole("button", { name: "Set password and continue" })).toBeVisible();
      await resetPage.reload();
      await resetPage.getByLabel("New password", { exact: true }).fill(resetPassword);
      await resetPage.getByLabel("Confirm new password").fill(resetPassword);
      await resetPage.getByRole("button", { name: "Set password and continue" }).click();
      await expect(resetPage).toHaveURL(/\/protected\/home/);
      await resetPage.goto(resetLink);
      await resetPage.getByLabel("New password", { exact: true }).fill("Another-password-123!");
      await resetPage.getByLabel("Confirm new password").fill("Another-password-123!");
      await resetPage.getByRole("button", { name: "Set password and continue" }).click();
      await expect(resetPage.locator("p[role='alert']")).toContainText(/invalid|already used/i);
    } finally {
      await resetContext.close();
    }
  });

  test("removes access for a stale session and restores the chosen role", async ({ page, browser }) => {
    const inviteeContext = await browser.newContext();
    const invitee = await inviteeContext.newPage();
    try {
      await loginAs(invitee, inviteEmail, resetPassword);
      await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await page.goto("/protected/admin");
      page.once("dialog", (dialog) => dialog.accept());
      await userRow(page, inviteEmail).getByRole("button", { name: "Remove access" }).click();
      await expect(userRow(page, inviteEmail).getByText("denied", { exact: true })).toBeVisible();
      expect(profile(inviteEmail)).toMatchObject({ status: "denied", role: "viewer" });
      await invitee.goto("/protected/home");
      await expect(invitee.getByText(/does not have access|not authorized/i)).toBeVisible();
      await userRow(page, inviteEmail).getByLabel(`Role for ${inviteEmail}`).selectOption("technician");
      page.once("dialog", (dialog) => dialog.accept());
      await userRow(page, inviteEmail).getByRole("button", { name: "Restore access" }).click();
      await expect(userRow(page, inviteEmail).getByText("active", { exact: true })).toBeVisible();
      expect(profile(inviteEmail)).toMatchObject({ status: "active", role: "technician" });
      await loginAs(invitee, inviteEmail, resetPassword);
      await expect(invitee.getByRole("link", { name: "Daily Operations" })).toBeVisible();
    } finally {
      await inviteeContext.close();
    }
  });
});

/**
 * Invite-only onboarding, Admin user management, and role enforcement.
 * See ../SKILL.md for the full procedure.
 */
import { execFileSync } from "node:child_process";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import {
  collectBrowserFailures,
  loginAs,
  RUN_TAG,
} from "./helpers";
import {
  getExpectedAuthRole,
  getRoleClaimAction,
  isPublicPath,
} from "../../../../lib/supabase/proxy";

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function localQuery(sql: string): Record<string, unknown>[] {
  const { rows } = JSON.parse(execFileSync("supabase", [
    "db", "query", "--local", "--output-format", "json", sql,
  ], { encoding: "utf8" }));
  return rows;
}

test.use({ trace: "off" });

test.describe("local invitation auth", () => {
  test.skip(process.env.E2E_RUN_LOCAL_INVITE_AUTH !== "1", "requires the migrated local Supabase stack");

  test("local Auth denies direct public sign-up", async () => {
    const local = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" }));
    expect(local.API_URL).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):54321$/);
    const client = createSupabaseClient(local.API_URL, local.ANON_KEY, {
      auth: { persistSession: false },
    });
    const email = `e2e-direct-signup-${RUN_TAG}@ssl.dev`;
    const { data, error } = await client.auth.signUp({
      email,
      password: "Test-password-123!",
    });
    expect(error).toBeTruthy();
    expect(data.user).toBeNull();
    expect(localQuery(`select count(*)::int as total from auth.users where email = ${sqlLiteral(email)}`))
      .toEqual([{ total: 0 }]);
  });

  test("registration without an active Admin leaves the local profile pending", async () => {
    const local = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" }));
    expect(local.API_URL).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):54321$/);
    const privileged = createSupabaseClient(local.API_URL, local.SERVICE_ROLE_KEY, {
      db: { schema: "core" }, auth: { persistSession: false },
    });
    const email = `e2e-rejected-invite-${RUN_TAG}@ssl.dev`;
    let inviteeId: string | undefined;
    const profileRows = () => localQuery(
      `select status, role, invited_at from core.profiles where auth_user_id = ${sqlLiteral(inviteeId!)}`,
    );

    try {
      const { data, error } = await privileged.auth.admin.createUser({
        email, password: "Test-password-123!", email_confirm: true,
        app_metadata: { ssl_invited_by_admin: true },
      });
      expect(error).toBeNull();
      expect(data.user).toBeTruthy();
      inviteeId = data.user!.id;
      expect(profileRows()).toEqual([{ status: "pending", role: null, invited_at: null }]);

      const { error: registerError } = await privileged.rpc("register_invitation", {
        p_admin_auth_user_id: "00000000-0000-0000-0000-000000000000",
        p_invitee_auth_user_id: inviteeId,
        p_role: "viewer",
      });
      expect(registerError?.code).toBe("42501");
      expect(profileRows()).toEqual([{ status: "pending", role: null, invited_at: null }]);
    } finally {
      if (inviteeId) {
        const { error } = await privileged.auth.admin.deleteUser(inviteeId);
        expect(error).toBeNull();
        expect(profileRows()).toEqual([]);
      }
    }
  });
});

test.describe("proxy role claim refresh policy", () => {
  test("uses only active valid profile roles for JWT claims", () => {
    for (const role of ["admin", "technician", "volunteer", "viewer"] as const) {
      expect(getExpectedAuthRole({ role, status: "active" })).toBe(role);
    }

    expect(getExpectedAuthRole({ role: "admin", status: "pending" })).toBe(
      "authenticated",
    );
    expect(getExpectedAuthRole({ role: "admin", status: "denied" })).toBe(
      "authenticated",
    );
    expect(getExpectedAuthRole({ role: null, status: "active" })).toBe(
      "authenticated",
    );
    expect(getExpectedAuthRole({ role: "owner", status: "active" })).toBe(
      "authenticated",
    );
    expect(getExpectedAuthRole(null)).toBe("authenticated");
  });

  test("refreshes one mismatch and signs out if the refreshed claim still differs", () => {
    expect(getRoleClaimAction("viewer", "admin")).toBe("refresh");
    expect(getRoleClaimAction("admin", "admin", true)).toBe("continue");
    expect(getRoleClaimAction("viewer", "admin", true)).toBe("sign-out");
  });

  test("keeps only the root and auth route tree public", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/auth/login")).toBe(true);
    expect(isPublicPath("/authenticated-preview")).toBe(false);
    expect(isPublicPath("/protected")).toBe(false);
  });
});

// Explicit opt-in only with a migrated local Supabase and a port-3000 app using
// the same local URL/key. Never exercise the hosted invitation API here.
test.describe("local Admin invitation lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(process.env.E2E_RUN_LOCAL_INVITE_UI !== "1", "requires an explicitly configured local app and Admin");

  const adminEmail = process.env.E2E_LOCAL_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_LOCAL_ADMIN_PASSWORD;
  const viewerEmail = `e2e-invite-viewer-${RUN_TAG}@ssl.dev`;
  const reissueEmail = `e2e-invite-reissue-${RUN_TAG}@ssl.dev`;
  const adminInviteEmail = `e2e-invite-admin-${RUN_TAG}@ssl.dev`;
  const disposableEmails = [viewerEmail, reissueEmail, adminInviteEmail];
  const newPassword = "New-local-password-123!";
  let local: { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
  let adminProfileId: number;

  function profile(email: string) {
    const rows = localQuery(`select id, auth_user_id, status, role, invited_by, invited_at, credential_changed_at
      from core.profiles where email = ${sqlLiteral(email)}`);
    expect(rows).toHaveLength(1);
    return rows[0];
  }

  function row(page: Page, email: string) {
    return page.locator("div.divide-y > div").filter({ hasText: email });
  }

  async function loginLocalAdmin(page: Page) {
    let localAuthRequests = 0;
    page.on("request", (request) => {
      if (request.url().startsWith(`${local.API_URL}/auth/v1/token`)) localAuthRequests++;
    });
    await loginAs(page, adminEmail!, adminPassword!);
    expect(localAuthRequests).toBeGreaterThan(0);
    await page.goto("/protected/admin");
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    await expect(page.getByText("Users", { exact: true })).toBeVisible();
  }

  async function invite(page: Page, email: string, role: "viewer" | "technician" | "admin") {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Role", { exact: true }).selectOption(role);
    if (role === "admin") page.once("dialog", (dialog) => dialog.accept());
    const responsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/admin/invitations") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const password = await page.getByLabel("One-time temporary password").inputValue();
    expect(password.length).toBeGreaterThan(32);
    expect((await response.json()).password === password).toBe(true);
    return password;
  }

  function localRoleClient() {
    return createSupabaseClient(local.API_URL, local.ANON_KEY, {
      db: { schema: "core" }, auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  test.beforeAll(async () => {
    local = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" }));
    expect(local.API_URL).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):54321$/);
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(local.API_URL);
    expect(Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY === local.SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY)).toBe(true);
    expect(Boolean(adminEmail && adminPassword)).toBe(true);
    const { data, error } = await localRoleClient().auth.signInWithPassword({
      email: adminEmail!, password: adminPassword!,
    });
    expect(error).toBeNull();
    expect(data.user).toBeTruthy();
    const rows = localQuery(`select id, role, status from core.profiles
      where auth_user_id = ${sqlLiteral(data.user!.id)}`);
    expect(rows).toMatchObject([{ role: "admin", status: "active" }]);
    adminProfileId = Number(rows[0].id);
  });

  test.afterAll(async () => {
    if (!adminProfileId) return;
    const privileged = createSupabaseClient(local.API_URL, local.SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    for (const email of disposableEmails) {
      const rows = localQuery(`select auth_user_id from core.profiles where email = ${sqlLiteral(email)}`);
      for (const record of rows) {
        const { error } = await privileged.auth.admin.deleteUser(String(record.auth_user_id));
        expect(error).toBeNull();
      }
      expect(localQuery(`select id from core.profiles where email = ${sqlLiteral(email)}`)).toEqual([]);
    }
  });

  test("Admin invites Viewer once; first password change activates and retires temporary credentials", async ({ page, browser }) => {
    const failures = collectBrowserFailures(page);
    await loginLocalAdmin(page);
    const temporaryPassword = await invite(page, viewerEmail, "viewer");
    const invited = profile(viewerEmail);
    expect(invited).toMatchObject({ status: "invited", role: "viewer", invited_by: adminProfileId, credential_changed_at: null });
    expect(invited.invited_at).toBeTruthy();
    await expect(row(page, viewerEmail).getByText("invited", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("One-time temporary password")).toHaveCount(0);

    const invitee = await browser.newPage();
    try {
      await loginAs(invitee, viewerEmail, temporaryPassword);
      await expect(invitee.getByText("Set your password", { exact: true })).toBeVisible();
      await invitee.goto("/protected/home");
      await expect(invitee.getByText("Set your password", { exact: true })).toBeVisible();
      await expect(invitee.getByRole("heading", { name: "Home" })).toHaveCount(0);
      await invitee.goto("/protected/admin");
      await expect(invitee.getByText("Set your password", { exact: true })).toBeVisible();
      await expect(invitee.getByRole("heading", { name: "Admin" })).toHaveCount(0);
      await invitee.getByLabel("Temporary password").fill(temporaryPassword);
      await invitee.getByLabel("New password", { exact: true }).fill(newPassword);
      await invitee.getByLabel("Confirm new password").fill(newPassword);
      await invitee.getByRole("button", { name: "Set password and continue" }).click();
      await expect(invitee.getByRole("heading", { name: "Home" })).toBeVisible();
      await expect(invitee.getByRole("link", { name: "Admin" })).toHaveCount(0);
      await invitee.goto("/protected/admin");
      await expect(invitee.getByText(/not authorized/i)).toBeVisible();
    } finally {
      await invitee.close();
    }
    const active = profile(viewerEmail);
    expect(active).toMatchObject({ id: invited.id, status: "active", role: "viewer", invited_by: adminProfileId });
    expect(active.credential_changed_at).toBeTruthy();
    const { data, error } = await localRoleClient().auth.signInWithPassword({ email: viewerEmail, password: temporaryPassword });
    expect(Boolean(error)).toBe(true);
    expect(data.session).toBeNull();
    expect(failures, failures.join("\n")).toEqual([]);
  });

  test("Admin denies and reissues invited and denied accounts with a new role and password", async ({ page, browser }) => {
    await loginLocalAdmin(page);
    const firstPassword = await invite(page, reissueEmail, "viewer");
    const first = profile(reissueEmail);
    await expect(row(page, reissueEmail).getByText("invited", { exact: true })).toBeVisible();
    await row(page, reissueEmail).getByLabel(`Role for ${reissueEmail}`).selectOption("technician");
    await row(page, reissueEmail).getByRole("button", { name: "Reissue invite" }).click();
    const secondPassword = await page.getByLabel("One-time temporary password").inputValue();
    expect(secondPassword.length).toBeGreaterThan(32);
    expect(secondPassword === firstPassword).toBe(false);
    expect(profile(reissueEmail)).toMatchObject({ id: first.id, status: "invited", role: "technician", invited_by: adminProfileId });
    const { error: obsoleteError } = await localRoleClient().auth.signInWithPassword({ email: reissueEmail, password: firstPassword });
    expect(Boolean(obsoleteError)).toBe(true);

    await row(page, reissueEmail).getByRole("button", { name: "Deny" }).click();
    await expect(row(page, reissueEmail).getByText("denied", { exact: true })).toBeVisible();
    expect(profile(reissueEmail)).toMatchObject({ id: first.id, status: "denied", role: "technician" });
    const deniedInvitee = await browser.newPage();
    try {
      await loginAs(deniedInvitee, reissueEmail, secondPassword);
      await expect(deniedInvitee.getByText(/does not have access/i)).toBeVisible();
      await expect(deniedInvitee.getByRole("heading", { name: "Home" })).toHaveCount(0);
    } finally {
      await deniedInvitee.close();
    }

    await row(page, reissueEmail).getByRole("button", { name: "Reissue invite" }).click();
    const thirdPassword = await page.getByLabel("One-time temporary password").inputValue();
    expect(thirdPassword.length).toBeGreaterThan(32);
    expect(thirdPassword === secondPassword).toBe(false);
    await expect(row(page, reissueEmail).getByText("invited", { exact: true })).toBeVisible();
    expect(profile(reissueEmail)).toMatchObject({ id: first.id, status: "invited", role: "technician", invited_by: adminProfileId, credential_changed_at: null });
    const { error: deniedPasswordError } = await localRoleClient().auth.signInWithPassword({ email: reissueEmail, password: secondPassword });
    expect(Boolean(deniedPasswordError)).toBe(true);
    const technician = await browser.newPage();
    try {
      await loginAs(technician, reissueEmail, thirdPassword);
      await technician.getByLabel("Temporary password").fill(thirdPassword);
      await technician.getByLabel("New password", { exact: true }).fill(newPassword);
      await technician.getByLabel("Confirm new password").fill(newPassword);
      await technician.getByRole("button", { name: "Set password and continue" }).click();
      await expect(technician.getByRole("heading", { name: "Home" })).toBeVisible();
      await expect(technician.getByRole("link", { name: "Daily Operations" })).toBeVisible();
      await expect(technician.getByRole("link", { name: "Admin" })).toHaveCount(0);
    } finally {
      await technician.close();
    }
    expect(profile(reissueEmail)).toMatchObject({ id: first.id, status: "active", role: "technician", invited_by: adminProfileId });
    expect(profile(reissueEmail).credential_changed_at).toBeTruthy();
  });

  test("stale Admin and Viewer tokens lose direct PostgREST access after role change and denial", async ({ page }) => {
    await loginLocalAdmin(page);
    const temporaryPassword = await invite(page, adminInviteEmail, "admin");
    const invited = profile(adminInviteEmail);
    expect(invited).toMatchObject({ status: "invited", role: "admin", invited_by: adminProfileId });
    const invitee = await page.context().browser()!.newPage();
    try {
      await loginAs(invitee, adminInviteEmail, temporaryPassword);
      await expect(invitee.getByText("Set your password", { exact: true })).toBeVisible();
      await invitee.getByLabel("Temporary password").fill(temporaryPassword);
      await invitee.getByLabel("New password", { exact: true }).fill(newPassword);
      await invitee.getByLabel("Confirm new password").fill(newPassword);
      await invitee.getByRole("button", { name: "Set password and continue" }).click();
      await expect(invitee.getByRole("link", { name: "Admin" })).toBeVisible();
      expect(profile(adminInviteEmail)).toMatchObject({ id: invited.id, status: "active", role: "admin" });

      const staleAdmin = localRoleClient();
      const { data: signedIn, error: signInError } = await staleAdmin.auth.signInWithPassword({
        email: adminInviteEmail, password: newPassword,
      });
      expect(signInError).toBeNull();
      expect(signedIn.session).toBeTruthy();
      const ownProfile = () => staleAdmin.from("profiles").select("id").eq("auth_user_id", String(invited.auth_user_id));
      const before = await ownProfile();
      expect(before.error).toBeNull();
      expect(before.data).toEqual([{ id: invited.id }]);

      await page.reload();
      await expect(row(page, adminInviteEmail).getByText("active", { exact: true })).toBeVisible();
      await row(page, adminInviteEmail).getByLabel(`Role for ${adminInviteEmail}`).selectOption("viewer");
      await row(page, adminInviteEmail).getByRole("button", { name: "Save role" }).click();
      await expect(row(page, adminInviteEmail).getByText("active", { exact: true })).toBeVisible();
      expect(profile(adminInviteEmail)).toMatchObject({ id: invited.id, status: "active", role: "viewer" });
      const downgraded = await ownProfile();
      expect(downgraded.error).toBeNull();
      expect(downgraded.data).toEqual([]);
      await invitee.goto("/protected/home");
      await expect(invitee.getByRole("heading", { name: "Home" })).toBeVisible();
      await expect(invitee.getByRole("link", { name: "Admin" })).toHaveCount(0);

      const freshViewer = localRoleClient();
      const { error: viewerError } = await freshViewer.auth.signInWithPassword({ email: adminInviteEmail, password: newPassword });
      expect(viewerError).toBeNull();
      const visible = await freshViewer.from("profiles").select("id").eq("auth_user_id", String(invited.auth_user_id));
      expect(visible.error).toBeNull();
      expect(visible.data).toEqual([{ id: invited.id }]);
      expect(localQuery(`update core.profiles set status = 'denied'
        where auth_user_id = ${sqlLiteral(String(invited.auth_user_id))} returning status`))
        .toEqual([{ status: "denied" }]);
      const denied = await freshViewer.from("profiles").select("id").eq("auth_user_id", String(invited.auth_user_id));
      expect(denied.error).toBeNull();
      expect(denied.data).toEqual([]);
      await invitee.goto("/protected/home");
      await expect(invitee.getByText(/does not have access/i)).toBeVisible();
      expect(profile(adminInviteEmail)).toMatchObject({ id: invited.id, status: "denied", role: "viewer" });
    } finally {
      await invitee.close();
    }
  });
});

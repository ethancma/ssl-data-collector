/**
 * Invite-only onboarding, Admin user management, and role enforcement.
 * See ../SKILL.md for the full procedure.
 */
import { execFileSync } from "node:child_process";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { test, expect, type Browser, type Page } from "@playwright/test";
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

// Explicit opt-in only with a migrated local Supabase, Mailpit, and a port-3000
// app using the same local URL/key. Never exercise the hosted invitation API here.
test.describe("local Admin invitation lifecycle", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(process.env.E2E_RUN_LOCAL_INVITE_UI !== "1", "requires an explicitly configured local app, Mailpit, and Admin");

  const adminEmail = process.env.E2E_LOCAL_ADMIN_EMAIL;
  const adminPassword = process.env.E2E_LOCAL_ADMIN_PASSWORD;
  const viewerEmail = `e2e-invite-viewer-${RUN_TAG}@ssl.dev`;
  const reissueEmail = `e2e-invite-reissue-${RUN_TAG}@ssl.dev`;
  const adminInviteEmail = `e2e-invite-admin-${RUN_TAG}@ssl.dev`;
  const disposableEmails = [viewerEmail, reissueEmail, adminInviteEmail];
  const newPassword = "New-local-password-123!";
  let local: { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string; SECRET_KEY: string; MAILPIT_URL: string };
  let adminProfileId: number;

  function profile(email: string) {
    const rows = localQuery(`select id, auth_user_id, status, role, invited_by, invited_at,
      invite_auth_sent_at, credential_changed_at
      from core.profiles where email = ${sqlLiteral(email)}`);
    expect(rows).toHaveLength(1);
    return rows[0];
  }

  function authUser(email: string) {
    const rows = localQuery(`select id, invited_at, email_confirmed_at is not null as confirmed,
      nullif(encrypted_password, '') is not null as has_password
      from auth.users where email = ${sqlLiteral(email)}`);
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
    await page.getByRole("button", { name: "Send invite" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toEqual({
      ok: true, message: "Invitation accepted for email delivery. Receipt is not guaranteed.",
    });
    await expect(page.getByRole("status")).toContainText(email);
  }

  async function reissue(page: Page, email: string, button: "Reissue email" | "Try reissue") {
    const responsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/admin/invitations") && response.request().method() === "POST");
    await row(page, email).getByRole("button", { name: button }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      ok: true, message: "Invitation accepted for email delivery. Receipt is not guaranteed.",
    });
  }

  async function capturedInvite(browser: Browser, email: string, previousId?: string) {
    let messageId = "";
    await expect.poll(async () => {
      const response = await fetch(`${local.MAILPIT_URL}/api/v1/messages?limit=100`);
      expect(response.ok).toBe(true);
      const inbox = await response.json() as {
        messages: { ID: string; To: { Address: string }[] }[];
      };
      messageId = inbox.messages.find((message) => message.ID !== previousId
        && message.To.some((recipient) => recipient.Address.toLowerCase() === email))?.ID ?? "";
      return messageId;
    }, { timeout: 10_000 }).not.toBe("");

    const response = await fetch(`${local.MAILPIT_URL}/api/v1/message/${messageId}`);
    expect(response.ok).toBe(true);
    const message = await response.json() as { HTML: string };
    const mailPage = await browser.newPage();
    try {
      await mailPage.setContent(message.HTML);
      const href = await mailPage.getByRole("link", { name: "Accept invitation" }).getAttribute("href");
      expect(href).toBeTruthy();
      const url = new URL(href!, "http://localhost:3000");
      expect(url.origin).toBe("http://localhost:3000");
      expect(url.pathname).toBe("/auth/accept");
      expect(url.searchParams.get("type")).toBe("invite");
      expect(url.searchParams.get("token_hash")).toMatch(/^[a-zA-Z0-9_-]{20,256}$/);
      return { url: url.toString(), messageId };
    } finally {
      await mailPage.close();
    }
  }

  async function acceptInvite(page: Page, url: string) {
    await page.goto(url);
    await expect(page.getByRole("button", { name: "Accept invitation" })).toBeVisible();
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page.getByText("Set your password", { exact: true })).toBeVisible();
  }

  async function setPassword(page: Page) {
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill(newPassword);
    await page.getByRole("button", { name: "Set password and continue" }).click();
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  }

  function localRoleClient() {
    return createSupabaseClient(local.API_URL, local.ANON_KEY, {
      db: { schema: "core" }, auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  test.beforeAll(async () => {
    local = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" }));
    expect(local.API_URL).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):54321$/);
    expect(local.MAILPIT_URL).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):54324$/);
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(local.API_URL);
    expect(Boolean((process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_SECRET_KEY === local.SECRET_KEY)
      || (process.env.SUPABASE_SERVICE_ROLE_KEY
        && process.env.SUPABASE_SERVICE_ROLE_KEY === local.SERVICE_ROLE_KEY))).toBe(true);
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
      const rows = localQuery(`select id from auth.users where email = ${sqlLiteral(email)}`);
      for (const record of rows) {
        const { error } = await privileged.auth.admin.deleteUser(String(record.id));
        expect(error).toBeNull();
      }
      expect(localQuery(`select id from core.profiles where email = ${sqlLiteral(email)}`)).toEqual([]);
      expect(localQuery(`select id from auth.users where email = ${sqlLiteral(email)}`)).toEqual([]);
    }
  });

  test("Admin email invite stays blocked until explicit acceptance and recipient password", async ({ page, browser }) => {
    const failures = collectBrowserFailures(page);
    await loginLocalAdmin(page);
    await invite(page, viewerEmail, "viewer");
    const link = await capturedInvite(browser, viewerEmail);
    const invited = profile(viewerEmail);
    expect(invited).toMatchObject({ status: "invited", role: "viewer", invited_by: adminProfileId,
      credential_changed_at: null });
    expect(invited.invited_at).toBeTruthy();
    expect(invited.invite_auth_sent_at).toBeTruthy();
    expect(authUser(viewerEmail)).toMatchObject({ id: invited.auth_user_id, confirmed: false, has_password: false });
    await expect(row(page, viewerEmail).getByText("invited", { exact: true })).toBeVisible();

    const invitee = await browser.newPage();
    try {
      await invitee.goto("/protected/home");
      await expect(invitee).toHaveURL(/\/auth\/login/);
      await invitee.goto(link.url);
      await expect(invitee.getByRole("button", { name: "Accept invitation" })).toBeVisible();
      await invitee.reload();
      expect(profile(viewerEmail)).toMatchObject({ id: invited.id, status: "invited", credential_changed_at: null });
      expect(authUser(viewerEmail)).toMatchObject({ confirmed: false, has_password: false });
      await acceptInvite(invitee, link.url);
      expect(profile(viewerEmail)).toMatchObject({ id: invited.id, status: "invited", credential_changed_at: null });
      expect(authUser(viewerEmail)).toMatchObject({ confirmed: true, has_password: false });
      await expect(invitee.getByText("Set your password", { exact: true })).toBeVisible();
      await invitee.goto("/protected/home");
      await expect(invitee.getByText("Set your password", { exact: true })).toBeVisible();
      await expect(invitee.getByRole("heading", { name: "Home" })).toHaveCount(0);
      await invitee.goto("/protected/admin");
      await expect(invitee.getByText("Set your password", { exact: true })).toBeVisible();
      await expect(invitee.getByRole("heading", { name: "Admin" })).toHaveCount(0);
      await setPassword(invitee);
      await expect(invitee.getByRole("link", { name: "Admin" })).toHaveCount(0);
      await invitee.goto("/protected/admin");
      await expect(invitee.getByText(/not authorized/i)).toBeVisible();
    } finally {
      await invitee.close();
    }
    const active = profile(viewerEmail);
    expect(active).toMatchObject({ id: invited.id, status: "active", role: "viewer", invited_by: adminProfileId });
    expect(active.credential_changed_at).toBeTruthy();
    expect(authUser(viewerEmail)).toMatchObject({ confirmed: true, has_password: true });
    const { error } = await localRoleClient().auth.signInWithPassword({ email: viewerEmail, password: newPassword });
    expect(error).toBeNull();
    const replay = await browser.newPage();
    try {
      await replay.goto(link.url);
      await replay.getByRole("button", { name: "Accept invitation" }).click();
      await expect(replay).toHaveURL(/\/auth\/error/);
    } finally {
      await replay.close();
    }
    expect(profile(adminEmail!)).toMatchObject({ id: adminProfileId, status: "active", role: "admin" });
    await page.reload();
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    expect(failures, failures.join("\n")).toEqual([]);
  });

  test("reissue invalidates old links; denied unconfirmed invite can be reissued", async ({ page, browser }) => {
    await loginLocalAdmin(page);
    await invite(page, reissueEmail, "viewer");
    const firstLink = await capturedInvite(browser, reissueEmail);
    const first = profile(reissueEmail);
    await expect(row(page, reissueEmail).getByText("invited", { exact: true })).toBeVisible();
    await row(page, reissueEmail).getByLabel(`Role for ${reissueEmail}`).selectOption("technician");
    await reissue(page, reissueEmail, "Reissue email");
    const secondLink = await capturedInvite(browser, reissueEmail, firstLink.messageId);
    expect(secondLink.url).not.toBe(firstLink.url);
    expect(profile(reissueEmail)).toMatchObject({ id: first.id, status: "invited", role: "technician", invited_by: adminProfileId });
    const stale = await browser.newPage();
    try {
      await stale.goto(firstLink.url);
      await stale.getByRole("button", { name: "Accept invitation" }).click();
      await expect(stale).toHaveURL(/\/auth\/error/);
    } finally {
      await stale.close();
    }
    expect(authUser(reissueEmail)).toMatchObject({ confirmed: false, has_password: false });

    await row(page, reissueEmail).getByRole("button", { name: "Deny" }).click();
    await expect(row(page, reissueEmail).getByText("denied", { exact: true })).toBeVisible();
    expect(profile(reissueEmail)).toMatchObject({ id: first.id, status: "denied", role: "technician" });
    await reissue(page, reissueEmail, "Try reissue");
    const thirdLink = await capturedInvite(browser, reissueEmail, secondLink.messageId);
    expect(thirdLink.url).not.toBe(secondLink.url);
    await expect(row(page, reissueEmail).getByText("invited", { exact: true })).toBeVisible();
    expect(profile(reissueEmail)).toMatchObject({ id: first.id, status: "invited", role: "technician", invited_by: adminProfileId, credential_changed_at: null });
    const obsolete = await browser.newPage();
    try {
      await obsolete.goto(secondLink.url);
      await obsolete.getByRole("button", { name: "Accept invitation" }).click();
      await expect(obsolete).toHaveURL(/\/auth\/error/);
    } finally {
      await obsolete.close();
    }
    const technician = await browser.newPage();
    try {
      await acceptInvite(technician, thirdLink.url);
      await setPassword(technician);
      await expect(technician.getByRole("link", { name: "Daily Operations" })).toBeVisible();
      await expect(technician.getByRole("link", { name: "Admin" })).toHaveCount(0);
    } finally {
      await technician.close();
    }
    expect(profile(reissueEmail)).toMatchObject({ id: first.id, status: "active", role: "technician", invited_by: adminProfileId });
    expect(profile(reissueEmail).credential_changed_at).toBeTruthy();
    await page.reload();
    await expect(row(page, reissueEmail).getByText("active", { exact: true })).toBeVisible();
    const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/admin/invitations")
      && response.request().method() === "POST");
    await page.getByLabel("Email").fill(reissueEmail);
    await page.getByRole("button", { name: "Send invite" }).click();
    expect((await responsePromise).status()).toBe(400);
    await expect(page.getByRole("alert")).toContainText("already active");
    expect(profile(reissueEmail)).toMatchObject({ id: first.id, status: "active", role: "technician" });
  });

  test("active Admin invite, role downgrade, and removal revoke stale PostgREST access", async ({ page, browser }) => {
    await loginLocalAdmin(page);
    await invite(page, adminInviteEmail, "admin");
    const link = await capturedInvite(browser, adminInviteEmail);
    const invited = profile(adminInviteEmail);
    expect(invited).toMatchObject({ status: "invited", role: "admin", invited_by: adminProfileId });
    const invitee = await browser.newPage();
    try {
      await acceptInvite(invitee, link.url);
      await setPassword(invitee);
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
      page.once("dialog", (dialog) => dialog.accept());
      await row(page, adminInviteEmail).getByRole("button", { name: "Remove access" }).click();
      await expect(row(page, adminInviteEmail).getByText("denied", { exact: true })).toBeVisible();
      const denied = await freshViewer.from("profiles").select("id").eq("auth_user_id", String(invited.auth_user_id));
      expect(denied.error).toBeNull();
      expect(denied.data).toEqual([]);
      await invitee.goto("/protected/home");
      await expect(invitee.getByText(/does not have access/i)).toBeVisible();
      expect(profile(adminInviteEmail)).toMatchObject({ id: invited.id, status: "denied", role: "viewer" });
      await row(page, adminInviteEmail).getByRole("button", { name: "Try reissue" }).click();
      await expect(row(page, adminInviteEmail).getByRole("alert")).toContainText("already confirmed");
      expect(profile(adminInviteEmail)).toMatchObject({ id: invited.id, status: "denied", role: "viewer" });
      expect(profile(adminEmail!)).toMatchObject({ id: adminProfileId, status: "active", role: "admin" });
    } finally {
      await invitee.close();
    }
  });
});

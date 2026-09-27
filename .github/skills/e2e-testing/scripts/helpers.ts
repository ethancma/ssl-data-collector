/**
 * Shared helpers for the e2e-testing skill's section scripts (../SKILL.md).
 * Not matched by playwright.config.ts's testMatch (no spec/test/smoke suffix) —
 * imported by the *.smoke.ts files in this directory, never run directly.
 *
 * Assumes: dev server already running on http://localhost:3000 (never started/stopped
 * by this script — see AGENTS.md).
 *
 * DB verification uses a service-role Supabase client (bypasses RLS) rather than
 * trusting the UI alone. Committed dev/test account defaults target the hosted test
 * accounts and may be overridden via env:
 *   SUPABASE_URL                  (defaults to the app's hosted project URL)
 *   SUPABASE_SERVICE_ROLE_KEY     (required only for service-role Supabase-js
 *                                  assertions; linked dbQuery still works without it)
 *   E2E_TEST_TECH_EMAIL / E2E_TEST_TECH_PASSWORD — seeded technician test account
 *   (see ../references/test-accounts.md)
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

export const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://bqylxmsifagnztxhixyl.supabase.co";
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const TECH_EMAIL = process.env.E2E_TEST_TECH_EMAIL ?? "test-tech@ssl.dev";
export const TECH_PASSWORD = process.env.E2E_TEST_TECH_PASSWORD ?? "password";
export const ADMIN_EMAIL = process.env.E2E_TEST_ADMIN_EMAIL ?? "test-admin@ssl.dev";
export const ADMIN_PASSWORD = process.env.E2E_TEST_ADMIN_PASSWORD ?? "password";
// Seeded volunteer test account (core.profiles.role = 'volunteer').
export const VOLUNTEER_EMAIL = process.env.E2E_TEST_VOLUNTEER_EMAIL ?? "test-volunteer@ssl.dev";
export const VOLUNTEER_PASSWORD = process.env.E2E_TEST_VOLUNTEER_PASSWORD ?? "password";
export const VIEWER_EMAIL = process.env.E2E_TEST_VIEWER_EMAIL ?? "test-viewer@ssl.dev";
export const VIEWER_PASSWORD = process.env.E2E_TEST_VIEWER_PASSWORD ?? "password";
// Public anon/publishable key — safe to default here the same way SUPABASE_URL is above.
export const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_KTInkuFFvOLUgENAzAul1w_o0MfJmX3";

if (!SERVICE_ROLE_KEY) {
  console.warn(
    "SUPABASE_SERVICE_ROLE_KEY not set — service-role Supabase-js assertions " +
      "will be skipped; linked dbQuery assertions remain available.",
  );
}

// Unique tag stamped into every row a run creates, so DB assertions can find exactly
// the row just written instead of guessing "most recent". Shared across section files
// so cross-referencing tags (e.g. auth-and-admin's pending-user email) stay consistent.
export const RUN_TAG = `e2e-${Date.now()}`;
const LAB_TIME_ZONE = "America/Los_Angeles";

function pacificDateTimeParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: LAB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

// Retains the existing helper name while matching the forms' Pacific date contract.
export function localDateString(d: Date): string {
  return pacificDateTimeParts(d).date;
}

export function todayDateString(): string {
  return localDateString(new Date());
}

// Same offset used by the picked-date-in-the-past test below.
export function daysAgoDateString(days: number): string {
  const [year, month, day] = todayDateString().split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day - days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

// Converts a timestamptz value read back from the DB to the Pacific YYYY-MM-DD it
// represents, so it can be compared against the date string typed into the form.
export function localDateOf(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  return localDateString(new Date(timestamp));
}

// Converts a timestamptz value read back from the DB to the Pacific HH:mm it
// represents, so it can be compared against the time string typed into the form.
export function localTimeOf(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  return pacificDateTimeParts(new Date(timestamp)).time;
}

export const db = SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      db: { schema: "core" },
      auth: { persistSession: false },
    })
  : null;

export async function login(page: Page) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(TECH_EMAIL);
  await page.getByLabel("Password").fill(TECH_PASSWORD);
  await page.getByRole("button", { name: /login/i }).click();
  // Generous timeout: the first sign-in of a run can hit Next dev's cold-compile
  // latency for the /protected route, well past the default 5s expect timeout.
  await expect(page).toHaveURL(/\/protected/, { timeout: 15_000 });
}

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /login/i }).click();
  await expect(page).toHaveURL(/\/protected/, { timeout: 15_000 });
}

// Authenticated (RLS-respecting, NOT service-role) client for a given role, used to
// verify UPDATE/DELETE/SELECT permissions directly — the app currently has no edit/delete
// UI for any operational log (only */new create routes exist), so those tiers can only be
// exercised this way rather than by clicking through the app. See rbac-tiers.smoke.ts.
export async function signInRoleClient(email: string, password: string) {
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    db: { schema: "core" },
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

// No session at all — mirrors a signed-out visitor hitting PostgREST directly.
export function anonRoleClient() {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    db: { schema: "core" },
    auth: { persistSession: false },
  });
}

export function collectBrowserFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      failures.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "unknown";
    const url = new URL(request.url());
    if (
      errorText === "net::ERR_ABORTED" &&
      url.origin === "http://localhost:3000" &&
      url.searchParams.has("_rsc")
    ) {
      return;
    }
    failures.push(
      `requestfailed: ${request.method()} ${request.url()} (${errorText})`,
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failures.push(
        `response: ${response.status()} ${response.request().method()} ${response.url()}`,
      );
    }
  });
  return failures;
}

// A fixed clock time, chosen to be unambiguously different from "now" whenever this
// runs, for the picked-time (not just default-to-now) assertions below.
export const PICKED_TIME = "05:37";

// Every form's date/time box defaults to today + "now" (see each component's
// getTodayDateString()/getCurrentTimeString()). Allow a couple minutes of slack for
// page-load time rather than asserting an exact clock match.
export async function expectDefaultDateAndTime(page: Page) {
  await expect(page.getByLabel("Date")).toHaveValue(todayDateString());
  const timeValue = await page.getByLabel("Time").inputValue();
  expect(timeValue).toMatch(/^\d{2}:\d{2}$/);
  const [h, m] = timeValue.split(":").map(Number);
  const [nowHour, nowMinute] = pacificDateTimeParts(new Date()).time
    .split(":")
    .map(Number);
  const valueMinutes = h * 60 + m;
  const nowMinutes = nowHour * 60 + nowMinute;
  const difference = Math.abs(valueMinutes - nowMinutes);
  expect(Math.min(difference, 24 * 60 - difference)).toBeLessThanOrEqual(5);
}

// Runs verification SQL directly against the linked hosted project via the Supabase CLI
// (connects as the `postgres` role). Required for any query against schema `core` — the
// service-role supabase-js client above has no USAGE grant on schema `core` on the hosted
// project (only `authenticated` does — see
// supabase/migrations/20260907200000_core_foundation.sql) and 403s with "permission denied
// for schema core". Always use this helper for core-schema assertions, never `db.from(...)`.
export function dbQuery(sql: string): Record<string, unknown>[] {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "e2e-sql-")), "query.sql");
  writeFileSync(file, sql);
  const out = execFileSync(
    "supabase",
    ["db", "query", "-f", file, "--linked", "-o", "json"],
    { encoding: "utf8" },
  );
  return (JSON.parse(out).rows as Record<string, unknown>[]) ?? [];
}

/**
 * Shared helpers for the e2e-testing skill's section scripts (../SKILL.md).
 * Not matched by playwright.config.ts's testMatch (no spec/test/smoke suffix) —
 * imported by the *.smoke.ts files in this directory, never run directly.
 *
 * Assumes: dev server already running at E2E_BASE_URL (default http://localhost:$PORT or
 * :3000; never started/stopped by this script — see AGENTS.md).
 *
 * DB verification uses a service-role Supabase client (bypasses RLS) rather than
 * trusting the UI alone. Committed dev/test account defaults target the hosted test
 * accounts and may be overridden via env:
 *   SUPABASE_URL                  (defaults to the app's hosted project URL)
 *   SUPABASE_SECRET_KEY           (required only for service-role Supabase-js
 *                                  assertions; linked dbQuery still works without it)
 *   E2E_TEST_TECH_EMAIL / E2E_TEST_TECH_PASSWORD — seeded technician test account
 *   (see ../references/test-accounts.md)
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  MessageChannel,
  type MessagePort,
  receiveMessageOnPort,
  Worker,
} from "node:worker_threads";
import { expect, type Page, type Request } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://bqylxmsifagnztxhixyl.supabase.co";
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
// Direct Postgres URL (set by `npm run wt -- setup` for the local stack); unset falls back to the linked CLI.
const E2E_DB_URL = process.env.E2E_DB_URL;
export const BASE_URL =
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
export const TECH_EMAIL = process.env.E2E_TEST_TECH_EMAIL ?? "test-tech@ssl.dev";
export const TECH_PASSWORD = process.env.E2E_TEST_TECH_PASSWORD ?? "password";
export const ADMIN_EMAIL = process.env.E2E_TEST_ADMIN_EMAIL ?? "test-admin@ssl.dev";
export const ADMIN_PASSWORD = process.env.E2E_TEST_ADMIN_PASSWORD ?? "password";
// Seeded volunteer test account (core.profiles.role = 'volunteer').
export const VOLUNTEER_EMAIL = process.env.E2E_TEST_VOLUNTEER_EMAIL ?? "test-volunteer@ssl.dev";
export const VOLUNTEER_PASSWORD = process.env.E2E_TEST_VOLUNTEER_PASSWORD ?? "password";
export const VIEWER_EMAIL = process.env.E2E_TEST_VIEWER_EMAIL ?? "test-viewer@ssl.dev";
export const VIEWER_PASSWORD = process.env.E2E_TEST_VIEWER_PASSWORD ?? "Password123!";
// Public anon/publishable key — safe to default here the same way SUPABASE_URL is above.
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_KTInkuFFvOLUgENAzAul1w_o0MfJmX3";

if (!SECRET_KEY) {
  console.warn(
    "SUPABASE_SECRET_KEY not set — service-role Supabase-js assertions " +
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
function localDateString(d: Date): string {
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

export const db = SECRET_KEY
  ? createClient(SUPABASE_URL, SECRET_KEY, {
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

// Form events fired before hydration are dropped, so wait for the page to go idle first.
export async function gotoHydrated(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

// A select change fired before hydration is dropped, so retry until Tank enables.
export async function selectBatchScope(
  page: Page,
  { systemId, tankId, animalId }: { systemId: number; tankId: number; animalId: number },
) {
  await expect(async () => {
    await page.getByLabel("System", { exact: true }).selectOption(String(systemId));
    await expect(page.getByLabel("Tank", { exact: true })).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel("Tank", { exact: true }).selectOption(String(tankId));
  await page.getByLabel("Animal", { exact: true }).selectOption(String(animalId));
}

export async function logSingleFeeding(
  page: Page,
  {
    systemId,
    tankId,
    animalId,
    food,
    amount,
    notes,
  }: {
    systemId: number;
    tankId: number;
    animalId: number;
    food: string;
    amount: string;
    notes: string;
  },
) {
  await selectBatchScope(page, { systemId, tankId, animalId });
  await page.getByRole("radio", { name: food, exact: true }).check();
  await page.getByLabel("Amount per animal (optional)", { exact: true }).fill(amount);
  await page.getByLabel("Notes", { exact: true }).fill(notes);
  await page.getByRole("button", { name: "Save 1 feeding", exact: true }).click();
  await expect(page.getByText("1 feeding logged.", { exact: true })).toBeVisible();
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

// Production builds prefetch links; navigating away aborts those requests.
export function isAbortedRscPrefetch(request: Request): boolean {
  const url = new URL(request.url());
  return (
    request.failure()?.errorText === "net::ERR_ABORTED" &&
    url.origin === new URL(BASE_URL).origin &&
    url.searchParams.has("_rsc")
  );
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
    if (isAbortedRscPrefetch(request)) return;
    const errorText = request.failure()?.errorText ?? "unknown";
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
  if (E2E_DB_URL) return dbQueryDirect(sql);
  const file = path.join(mkdtempSync(path.join(tmpdir(), "e2e-sql-")), "query.sql");
  writeFileSync(file, sql);
  let out = "";
  for (let attempt = 1; ; attempt++) {
    try {
      out = execFileSync(
        "supabase",
        ["db", "query", "-f", file, "--linked", "-o", "json"],
        { encoding: "utf8" },
      );
      break;
    } catch (error) {
      // The login-role handshake fails before any SQL runs, so a retry is safe.
      if (attempt >= 3 || !String(error).includes("TransportError")) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_000);
    }
  }
  return (JSON.parse(out).rows as Record<string, unknown>[]) ?? [];
}

let dbWorker: { port: MessagePort; signal: Int32Array } | null = null;

// Blocks on a worker-held connection so dbQuery stays synchronous for existing callers.
function dbQueryDirect(sql: string): Record<string, unknown>[] {
  if (!dbWorker) {
    const { port1, port2 } = new MessageChannel();
    const signal = new Int32Array(new SharedArrayBuffer(4));
    const worker = new Worker(
      path.resolve(".github/skills/e2e-testing/scripts/db-worker.mjs"),
      { workerData: { url: E2E_DB_URL, port: port2, signal }, transferList: [port2] },
    );
    worker.unref();
    port1.unref();
    dbWorker = { port: port1, signal };
  }
  Atomics.store(dbWorker.signal, 0, 0);
  dbWorker.port.postMessage(sql);
  if (Atomics.wait(dbWorker.signal, 0, 0, 60_000) === "timed-out") {
    throw new Error("dbQuery timed out after 60s");
  }
  const reply = receiveMessageOnPort(dbWorker.port)?.message as
    | { rows: Record<string, unknown>[]; error?: undefined }
    | { error: string }
    | undefined;
  if (!reply) throw new Error("dbQuery worker returned no reply");
  if (reply.error !== undefined) throw new Error(reply.error);
  return reply.rows;
}

export function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

// Cleanup actions are idempotent deletes, so retry transient CLI transport errors.
async function retryTransient<T>(action: () => T | Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
}

export async function cleanupStep<T>(
  label: string,
  action: () => T | Promise<T>,
): Promise<void> {
  try {
    await retryTransient(action);
  } catch (error) {
    console.warn(`E2E cleanup failed (${label}); continuing:`, error);
  }
}

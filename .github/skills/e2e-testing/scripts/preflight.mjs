import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import pg from "pg";

const DEV_PROJECT_REF = "hcaopgzlvuyuyjcjxuvy";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
export const E2E_LOCK_DIR = path.join(tmpdir(), "ssl-e2e.lock");

/** @param {NodeJS.ProcessEnv} env */
export function validateE2eTarget(env) {
  /** @param {string} name */
  const url = (name) => {
    if (!env[name]) throw new Error(`${name} is required for E2E; load Local or Dev configuration.`);
    try {
      return new URL(env[name]);
    } catch {
      throw new Error(`${name} must be a valid URL (value omitted).`);
    }
  };
  const app = url("E2E_BASE_URL");
  const site = url("NEXT_PUBLIC_SITE_URL");
  const api = url("NEXT_PUBLIC_SUPABASE_URL");
  const assertions = url("SUPABASE_URL");
  const database = url("E2E_DB_URL");
  for (const [name, value] of [
    ["E2E_BASE_URL", app], ["NEXT_PUBLIC_SITE_URL", site],
    ["NEXT_PUBLIC_SUPABASE_URL", api], ["SUPABASE_URL", assertions],
  ]) {
    if (!["http:", "https:"].includes(value.protocol) || value.username || value.password ||
        value.search || value.hash || value.pathname !== "/") {
      throw new Error(`${name} must be an HTTP(S) origin without credentials, path, query, or fragment.`);
    }
  }
  if (!LOOPBACK.has(app.hostname)) throw new Error("E2E requires a loopback app server, never a hosted app.");
  if (app.origin !== site.origin) throw new Error("E2E_BASE_URL and NEXT_PUBLIC_SITE_URL must agree.");
  if (api.origin !== assertions.origin) throw new Error("App and assertion Supabase origins must agree.");
  if (!["postgres:", "postgresql:"].includes(database.protocol) ||
      database.pathname !== "/postgres" || database.search || database.hash) {
    throw new Error("E2E_DB_URL must identify the postgres database without query overrides.");
  }
  const local = LOOPBACK.has(api.hostname) && LOOPBACK.has(database.hostname);
  const dev = api.origin === `https://${DEV_PROJECT_REF}.supabase.co` &&
    (database.hostname === `db.${DEV_PROJECT_REF}.supabase.co` ||
      (database.hostname.endsWith(".pooler.supabase.com") &&
        decodeURIComponent(database.username) === `postgres.${DEV_PROJECT_REF}`));
  if (!local && !dev) {
    throw new Error("E2E allows matching Local or designated Dev targets only; Production and unknown projects are forbidden.");
  }
  if (local && (api.port !== "54321" || database.port !== "54322")) {
    throw new Error("Local E2E must use the shared Supabase stack on API 54321 and Postgres 54322.");
  }
  if (env.E2E_RESET_DB && !["0", "1"].includes(env.E2E_RESET_DB)) {
    throw new Error("E2E_RESET_DB must be unset, 0, or 1.");
  }
  if (!local && env.E2E_RESET_DB === "1") throw new Error("Database reset is Local-only, never hosted Dev.");
  if (!env.SUPABASE_SECRET_KEY || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("E2E requires both Supabase keys so Auth/Storage assertions cannot be silently skipped.");
  }
  return { appOrigin: app.origin, apiOrigin: api.origin, target: local ? "Local" : "Dev" };
}

/** @param {string[]} args */
function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** @param {string} output
 *  @param {string} port */
export function listenerPidsFromSs(output, port) {
  const lines = output.split("\n").filter((line) => line.trim());
  if (!lines.length) throw new Error(`Cannot inspect app listener on port ${port}: ss found no visible listener.`);
  /** @type {Set<string>} */
  const pids = new Set();
  for (const line of lines) {
    if (!/^\s*LISTEN\s/.test(line)) throw new Error(`Unexpected ss listener output on port ${port}.`);
    const owners = [...line.matchAll(/\bpid=([1-9]\d*)(?=,|\))/g)].map((match) => match[1]);
    if (!owners.length || owners.some((pid) => !Number.isSafeInteger(Number(pid)))) {
      throw new Error(`Cannot inspect app listener on port ${port}: ss found a listener without a visible owner. Check process permissions.`);
    }
    for (const pid of owners) pids.add(pid);
  }
  return [...pids];
}

/** @param {NodeJS.ProcessEnv} env
 *  @param {boolean} checkFixtures */
export async function runPreflight(env = process.env, checkFixtures = true) {
  const target = validateE2eTarget(env);
  const root = git(["rev-parse", "--show-toplevel"]);
  console.log(`Checkout: ${root}`);
  console.log(`Branch: ${git(["branch", "--show-current"]) || "detached"}; HEAD: ${git(["rev-parse", "--short", "HEAD"])}`);
  console.log(`Changes:\n${git(["status", "--short", "--untracked-files=all"]) || "(clean)"}`);
  console.log(`App: ${target.appOrigin}; Supabase: ${target.apiOrigin} (${target.target})`);
  console.log(`Reset: ${env.E2E_RESET_DB === "1" ? "Local reset + synthetic fixtures" : "disabled"}; cleanup: tagged E2E rows`);

  const appUrl = new URL(target.appOrigin);
  const port = appUrl.port || (appUrl.protocol === "https:" ? "443" : "80");
  const linux = process.platform === "linux";
  const tool = linux ? "ss" : "lsof";
  let listeners;
  try {
    listeners = execFileSync(tool,
      linux ? ["-H", "-ltnp", `( sport = :${port} )`] : ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const missingTool = error instanceof Error && "code" in error && error.code === "ENOENT";
    throw new Error(missingTool
      ? `Cannot inspect app listener: ${tool} is not installed.`
      : `Cannot inspect app listener on port ${port}: ${tool} found no visible listener or failed. Check the app and process permissions.`);
  }
  const pids = linux ? listenerPidsFromSs(listeners, port) : listeners.trim().split(/\s+/).filter(Boolean);
  if (!pids.length) throw new Error(`Cannot inspect app listener on port ${port}: ${tool} found no visible listener.`);
  const expected = realpathSync(env.E2E_SERVER_CWD || root);
  for (const pid of new Set(pids)) {
    const cwd = linux ? realpathSync(`/proc/${pid}/cwd`) : execFileSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      .split("\n").find((line) => line.startsWith("n"))?.slice(1);
    if (!cwd || realpathSync(cwd) !== expected) {
      throw new Error(`App listener ${pid} is not running from the expected checkout. Confirm its owner; never restart port 3000.`);
    }
    console.log(`Listener PID ${pid}; checkout: ${cwd} (not owned or stopped by preflight)`);
  }
  try {
    const holder = readFileSync(path.join(E2E_LOCK_DIR, "pid"), "utf8").trim();
    console.log(`E2E lock holder PID: ${holder}; setup waits for exclusive access.`);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    console.log("E2E lock: no holder recorded.");
  }
  let response;
  try {
    response = await fetch(`${target.appOrigin}/auth/login`, {
      redirect: "manual", signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("The explicit app origin is not responsive at /auth/login.");
  }
  if (!response.ok) throw new Error(`App /auth/login returned HTTP ${response.status}.`);
  await response.body?.cancel();

  const client = new pg.Client({
    connectionString: env.E2E_DB_URL,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 10_000,
    options: "-c default_transaction_read_only=on",
  });
  let fixturesReady = !checkFixtures;
  try {
    await client.connect();
    if (checkFixtures) {
      const { rows: [fixtures] } = await client.query(`
        select
          (select count(distinct role) from core.profiles
            where status = 'active' and
              (role, email) in (('admin', $1), ('technician', $2), ('volunteer', $3), ('viewer', $4))) as roles,
          exists(select 1 from core.animals a
            join core.tanks t on t.id = a.tank_id
            join core.systems s on s.id = t.system_id
            join core.species sp on sp.id = a.species_id
            where s.name = 'Graham' and a.status = 'active'
              and a.tracking_type = 'individual' and sp.category = 'star') as star`,
        [env.E2E_TEST_ADMIN_EMAIL || "test-admin@ssl.dev",
          env.E2E_TEST_TECH_EMAIL || "test-tech@ssl.dev",
          env.E2E_TEST_VOLUNTEER_EMAIL || "test-volunteer@ssl.dev",
          env.E2E_TEST_VIEWER_EMAIL || "test-viewer@ssl.dev"]);
      fixturesReady = Number(fixtures.roles) === 4 && fixtures.star === true;
    } else {
      await client.query("select 1");
      console.log("Database connected read-only; fixture check follows Local reset and seeding.");
    }
  } catch (error) {
    const code = error && typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
      ? ` (${error.code})` : "";
    throw new Error(`Read-only database/fixture check failed${code}. Check connectivity and migrations; connection details omitted.`);
  } finally {
    await client.end();
  }
  if (!fixturesReady) {
    throw new Error("Fixtures missing: four active test roles and an active Graham star are required. Use the Local/Dev seed workflow.");
  }
  if (checkFixtures) console.log("Fixtures: four active test roles and an active Graham star ready.");
  console.log("Preflight passed. Configuration agrees; confirm the server's launch/build used it before E2E writes.");
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  nextEnv.loadEnvConfig(process.cwd());
  runPreflight().catch((error) => {
    console.error(error instanceof Error ? error.message : "E2E preflight failed.");
    process.exitCode = 1;
  });
}

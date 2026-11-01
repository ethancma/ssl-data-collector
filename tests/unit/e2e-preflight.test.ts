import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { runPreflight, validateE2eTarget } from "@/.github/skills/e2e-testing/scripts/preflight.mjs";

const DEV = "hcaopgzlvuyuyjcjxuvy";
const SECRET = "test-only-secret-not-a-credential";
const execFileAsync = promisify(execFile);
function local(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    E2E_BASE_URL: "http://localhost:3101",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3101",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_URL: "http://127.0.0.1:54321",
    E2E_DB_URL: `postgresql://postgres:${SECRET}@127.0.0.1:54322/postgres`,
    SUPABASE_SECRET_KEY: SECRET,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
    ...overrides,
  };
}
function dev(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return local({
    NEXT_PUBLIC_SUPABASE_URL: `https://${DEV}.supabase.co`,
    SUPABASE_URL: `https://${DEV}.supabase.co`,
    E2E_DB_URL: `postgres://postgres:${SECRET}@db.${DEV}.supabase.co:5432/postgres`,
    ...overrides,
  });
}

test("accepts matching explicit Local and hosted Dev targets without returning secrets", () => {
  assert.deepEqual(validateE2eTarget(local({ E2E_RESET_DB: "1" })), {
    appOrigin: "http://localhost:3101",
    apiOrigin: "http://127.0.0.1:54321",
    target: "Local",
  });
  assert.equal(validateE2eTarget(dev()).target, "Dev");
  assert.equal(validateE2eTarget(dev({
    E2E_DB_URL: `postgres://postgres.${DEV}:${SECRET}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
  })).target, "Dev");
  assert.ok(!JSON.stringify(validateE2eTarget(local())).includes(SECRET));
});

test("fails closed on absent origins or keys instead of defaulting to port 3000 or Production", () => {
  for (const key of ["E2E_BASE_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL", "E2E_DB_URL", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) {
    assert.throws(() => validateE2eTarget(local({ [key]: undefined })), /required|requires/);
  }
});

test("rejects mismatched app, API, and database targets", () => {
  assert.throws(() => validateE2eTarget(local({
    NEXT_PUBLIC_SITE_URL: "http://localhost:3102",
  })), /must agree/);
  assert.throws(() => validateE2eTarget(local({
    SUPABASE_URL: "http://localhost:54321",
  })), /must agree/);
  assert.throws(() => validateE2eTarget(dev({
    E2E_DB_URL: local().E2E_DB_URL,
  })), /matching Local/);
  assert.throws(() => validateE2eTarget(local({
    E2E_DB_URL: dev().E2E_DB_URL,
  })), /matching Local/);
});

test("rejects Production, unknown projects, pooler spoofing, and hosted app servers", () => {
  for (const ref of ["bqylxmsifagnztxhixyl", "unknown-project"]) {
    assert.throws(() => validateE2eTarget(dev({
      NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
      SUPABASE_URL: `https://${ref}.supabase.co`,
      E2E_DB_URL: `postgres://postgres:${SECRET}@db.${ref}.supabase.co/postgres`,
    })), /forbidden/);
  }
  for (const connection of [
    `postgres://postgres.${DEV}:${SECRET}@pooler.supabase.com.attacker.test/postgres`,
    `postgres://postgres.other:${SECRET}@aws-0-us-west-1.pooler.supabase.com/postgres`,
  ]) {
    assert.throws(() => validateE2eTarget(dev({ E2E_DB_URL: connection })), /forbidden/);
  }
  assert.throws(() => validateE2eTarget(local({
    E2E_BASE_URL: "https://ssl-data-collector.ssl-lab.workers.dev",
  })), /loopback app server/);
});

test("reset is explicit, Local-only, and uses the shared local ports", () => {
  assert.throws(() => validateE2eTarget(dev({ E2E_RESET_DB: "1" })), /Local-only/);
  assert.throws(() => validateE2eTarget(local({ E2E_RESET_DB: "yes" })), /unset, 0, or 1/);
  assert.throws(() => validateE2eTarget(local({
    E2E_DB_URL: `postgres://postgres:${SECRET}@localhost:54323/postgres`,
  })), /54322/);
});

test("rejects malformed URLs, credential-bearing origins, and Postgres query overrides without leaking values", () => {
  for (const overrides of [
    { E2E_DB_URL: `not-a-url-${SECRET}` },
    { E2E_DB_URL: `postgres://postgres:${SECRET}@127.0.0.1:54322/postgres?host=other` },
    { E2E_BASE_URL: `http://user:${SECRET}@localhost:3101` },
    { E2E_BASE_URL: "http://localhost:3101/path" },
  ]) {
    assert.throws(() => validateE2eTarget(local(overrides)), (error: unknown) =>
      error instanceof Error && !error.message.includes(SECRET));
  }
});

test("listener checkout and HTTP failures stop preflight before database access", async (context) => {
  context.mock.method(console, "log", () => {});
  const server = createServer((_request, response) => {
    response.writeHead(503);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP listener");
  const origin = `http://127.0.0.1:${address.port}`;
  const env = local({ E2E_BASE_URL: origin, NEXT_PUBLIC_SITE_URL: origin });
  try {
    await assert.rejects(runPreflight({ ...env, E2E_SERVER_CWD: tmpdir() }), /expected checkout/);
    await assert.rejects(runPreflight(env), /HTTP 503/);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
  }
});

test("failed setup cannot run global cleanup, even if its process owns a lock", () => {
  const temp = mkdtempSync(path.join(tmpdir(), "e2e-failed-setup-"));
  const script = `
    import { createServer } from "node:http";
    const server = createServer((_request, response) => response.end());
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const origin = "http://127.0.0.1:" + server.address().port;
      process.env.E2E_BASE_URL = origin;
      process.env.NEXT_PUBLIC_SITE_URL = origin;
      const { default: setup, acquireE2eLock, ownsE2eLock, releaseE2eLock } =
        await import("./.github/skills/e2e-testing/scripts/global-setup.ts");
      const { default: teardown } = await import("./.github/skills/e2e-testing/scripts/global-teardown.ts");
      await teardown();
      try {
        await setup();
        throw new Error("Expected preflight to reject the listener checkout");
      } catch (error) {
        if (!error.message.includes("expected checkout")) throw error;
      }
      await teardown();
      await acquireE2eLock();
      try {
        await teardown();
        if (!ownsE2eLock()) throw new Error("Failed-setup teardown released the owned lock");
      } finally {
        releaseE2eLock();
      }
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  `;
  try {
    const output = execFileSync(process.execPath, [
      "--import", createRequire(import.meta.url).resolve("tsx"),
      "--input-type=module", "-e", script,
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, ...local(), TMPDIR: temp, E2E_SERVER_CWD: temp },
      timeout: 15_000,
    });
    assert.match(output, /global cleanup skipped: this process does not own the E2E lock/);
    assert.match(output, /global cleanup skipped: global setup failed/);
    assert.doesNotMatch(output, /E2E cleanup summary/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("concurrent contenders fail closed without removing a stale E2E lock", async () => {
  const temp = mkdtempSync(path.join(tmpdir(), "e2e-stale-lock-"));
  const lock = path.join(temp, "ssl-e2e.lock");
  const deadPid = 2_147_483_647;
  assert.throws(() => process.kill(deadPid, 0), (error: unknown) =>
    error instanceof Error && "code" in error && error.code === "ESRCH");
  mkdirSync(lock);
  writeFileSync(path.join(lock, "pid"), String(deadPid));
  const script = `
    const { acquireE2eLock } = await import("./.github/skills/e2e-testing/scripts/global-setup.ts");
    try {
      await acquireE2eLock();
      throw new Error("A stale lock was acquired");
    } catch (error) {
      if (!error.message.includes("dead PID")) throw error;
      console.log("stale lock preserved");
    }
  `;
  const args = [
    "--import", createRequire(import.meta.url).resolve("tsx"),
    "--input-type=module", "-e", script,
  ];
  try {
    const results = await Promise.all([0, 1].map(() => execFileAsync(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, TMPDIR: temp },
      timeout: 15_000,
    })));
    for (const result of results) assert.match(result.stdout, /stale lock preserved/);
    assert.equal(readFileSync(path.join(lock, "pid"), "utf8"), String(deadPid));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("an E2E lock with an unverifiable PID fails closed", async () => {
  const temp = mkdtempSync(path.join(tmpdir(), "e2e-invalid-lock-"));
  const lock = path.join(temp, "ssl-e2e.lock");
  mkdirSync(lock);
  writeFileSync(path.join(lock, "pid"), "invalid");
  const script = `
    const { acquireE2eLock } = await import("./.github/skills/e2e-testing/scripts/global-setup.ts");
    try {
      await acquireE2eLock();
      throw new Error("An unverifiable lock was acquired");
    } catch (error) {
      if (!error.message.includes("no verifiable PID")) throw error;
      console.log("unverifiable lock preserved");
    }
  `;
  try {
    const result = await execFileAsync(process.execPath, [
      "--import", createRequire(import.meta.url).resolve("tsx"),
      "--input-type=module", "-e", script,
    ], {
      cwd: process.cwd(),
      env: { ...process.env, TMPDIR: temp },
      timeout: 15_000,
    });
    assert.match(result.stdout, /unverifiable lock preserved/);
    assert.equal(readFileSync(path.join(lock, "pid"), "utf8"), "invalid");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("concurrent E2E runs serialize access to the shared lock", async () => {
  const temp = mkdtempSync(path.join(tmpdir(), "e2e-lock-serialization-"));
  const script = `
    import { unlinkSync, writeFileSync } from "node:fs";
    import path from "node:path";
    const { acquireE2eLock, releaseE2eLock } =
      await import("./.github/skills/e2e-testing/scripts/global-setup.ts");
    await acquireE2eLock();
    try {
      const critical = path.join(process.env.TMPDIR, "critical-section");
      writeFileSync(critical, String(process.pid), { flag: "wx" });
      await new Promise((resolve) => setTimeout(resolve, 250));
      unlinkSync(critical);
      console.log("completed exclusive section");
    } finally {
      releaseE2eLock();
    }
  `;
  const args = [
    "--import", createRequire(import.meta.url).resolve("tsx"),
    "--input-type=module", "-e", script,
  ];
  try {
    const results = await Promise.all([0, 1].map(() => execFileAsync(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, TMPDIR: temp },
      timeout: 15_000,
    })));
    for (const result of results) assert.match(result.stdout, /completed exclusive section/);
    assert.equal(existsSync(path.join(temp, "ssl-e2e.lock")), false);
    assert.equal(existsSync(path.join(temp, "critical-section")), false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

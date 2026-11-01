import assert from "node:assert/strict";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import test from "node:test";
import { runPreflight, validateE2eTarget } from "@/.github/skills/e2e-testing/scripts/preflight.mjs";

const DEV = "hcaopgzlvuyuyjcjxuvy";
const SECRET = "test-only-secret-not-a-credential";
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

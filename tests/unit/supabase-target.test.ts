import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { NextRequest } from "next/server";
import { RequestCookiesAdapter } from "next/dist/server/web/spec-extension/adapters/request-cookies";

import { createClient as createBrowserClient } from "../../lib/supabase/client";
import { updateSession } from "../../lib/supabase/proxy";
import {
  assertSafeSupabaseTarget,
  hostFromHostHeader,
  localSupabaseTargetError,
  LOCAL_SUPABASE_TARGET_ERROR,
} from "../../lib/supabase/target";

const DEV = "https://hcaopgzlvuyuyjcjxuvy.supabase.co";
const PRODUCTION = "https://bqylxmsifagnztxhixyl.supabase.co";

function restoreEnvironment() {
  const keys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SITE_URL",
    "SUPABASE_SECRET_KEY",
    "NODE_ENV",
  ] as const;
  const previous = keys.map((key) => [key, process.env[key]] as const);
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else Object.assign(process.env, { [key]: value });
    }
  };
}

test("local apps allow only the designated Dev project or loopback Docker API", () => {
  const targets = [
    DEV,
    `${DEV}/`,
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://[::1]:54321",
  ];
  for (const host of ["localhost", "localhost.", "app.localhost", "127.0.0.1", "127.1.2.3", "[::1]"]) {
    for (const supabaseUrl of targets) {
      assert.equal(localSupabaseTargetError(supabaseUrl, { host, nodeEnv: "production" }), null);
    }
  }
  assert.equal(localSupabaseTargetError(DEV, { host: "192.168.1.2", nodeEnv: "development" }), null);
});

test("local and development apps reject Production, unknown, and malformed targets", () => {
  const targets = [
    PRODUCTION,
    "https://other-project.supabase.co",
    `http://${new URL(DEV).hostname}`,
    `${DEV}.example.com`,
    `${DEV}/rest/v1`,
    `${DEV}?token=test`,
    "http://user:password@localhost:54321",
    "http://localhost:54322",
    "https://localhost:54321",
    "not-a-url",
    undefined,
  ];
  for (const context of [
    { host: "localhost", nodeEnv: "production" },
    { host: "192.168.1.2", nodeEnv: "development" },
    { host: "192.168.1.2", siteOrigin: "https://192.168.1.2", nodeEnv: "production" },
    { host: "computer.local", siteOrigin: "https://computer.local", nodeEnv: "production" },
    { host: "computer", siteOrigin: "https://computer", nodeEnv: "production" },
    { host: "[fd00::1]", siteOrigin: "https://[fd00::1]", nodeEnv: "production" },
    { host: "[::ffff:7f00:1]", siteOrigin: "https://[::ffff:127.0.0.1]", nodeEnv: "production" },
    { host: null, nodeEnv: "production" },
    { host: "other.example", siteOrigin: "https://app.example", nodeEnv: "production" },
    { host: "app.example:3000", siteOrigin: "https://app.example", nodeEnv: "production" },
    { host: "hosted.example", siteOrigin: "http://localhost:3000", nodeEnv: "production" },
    { host: "hosted.example", nodeEnv: "production" },
  ]) {
    for (const target of targets) {
      assert.equal(localSupabaseTargetError(target, context), LOCAL_SUPABASE_TARGET_ERROR);
      assert.throws(() => assertSafeSupabaseTarget(target, context), /Supabase target blocked/);
    }
  }
});

test("hosted production can still use its production Supabase project", () => {
  assert.equal(localSupabaseTargetError(PRODUCTION, {
    host: "ssl-data-collector.ssl-lab.workers.dev",
    siteOrigin: "https://ssl-data-collector.ssl-lab.workers.dev",
    nodeEnv: "production",
  }), null);
});

test("request host parsing fails closed without exposing invalid header contents", () => {
  assert.equal(hostFromHostHeader("localhost:3000"), "localhost:3000");
  assert.equal(hostFromHostHeader("[::1]:3000"), "[::1]:3000");
  assert.equal(hostFromHostHeader("APP.example:443"), "app.example");
  for (const host of [null, "", "user:secret@localhost", "localhost/", "localhost?",
    "localhost#", "localhost?token=secret", "bad host"]) {
    assert.equal(hostFromHostHeader(host), null);
  }
});

test("proxy and browser clients block Production before making a request", async (t) => {
  const restore = restoreEnvironment();
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected network request");
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-public-key";
  process.env.NEXT_PUBLIC_SITE_URL = "https://ssl-data-collector.ssl-lab.workers.dev";
  Object.assign(process.env, { NODE_ENV: "production" });

  try {
    const response = await updateSession(new NextRequest("http://localhost:3000/auth/login", {
      headers: { host: "localhost:3000" },
    }));
    assert.equal(response.status, 503);
    assert.equal(await response.text(), LOCAL_SUPABASE_TARGET_ERROR);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: new URL("http://localhost:3000") },
    });
    assert.throws(() => createBrowserClient(), /Supabase target blocked/);
    for (const target of [DEV, "http://127.0.0.1:54321"]) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = target;
      assert.equal(typeof createBrowserClient().from, "function");
    }
    assert.equal(fetch.mock.callCount(), 0);
  } finally {
    restore();
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("proxy accepts the canonical host even when Next uses an internal request URL", async (t) => {
  const restore = restoreEnvironment();
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected network request");
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION;
  process.env.NEXT_PUBLIC_SITE_URL = "https://ssl-data-collector.ssl-lab.workers.dev";
  Object.assign(process.env, { NODE_ENV: "production" });

  try {
    const response = await updateSession(new NextRequest("http://127.0.0.1:3211/auth/login", {
      headers: { host: "ssl-data-collector.ssl-lab.workers.dev" },
    }));
    assert.equal(response.status, 200);
    assert.equal(fetch.mock.callCount(), 0);
  } finally {
    restore();
  }
});

test("server and privileged clients enforce the target before creating Supabase clients", async (t) => {
  const restore = restoreEnvironment();
  const require = createRequire(import.meta.url);
  const nextHeaders: typeof import("next/headers") = require("next/headers");
  let host = "localhost:3000";
  t.mock.method(nextHeaders, "headers", async () => new Headers({ host }));
  const cookieStore = RequestCookiesAdapter.seal(new NextRequest("http://localhost:3000").cookies);
  t.mock.method(nextHeaders, "cookies", async () => cookieStore);
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Unexpected network request");
  });

  process.env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-public-key";
  process.env.SUPABASE_SECRET_KEY = "test-secret-key";
  process.env.NEXT_PUBLIC_SITE_URL = "https://ssl-data-collector.ssl-lab.workers.dev";
  Object.assign(process.env, { NODE_ENV: "production" });

  try {
    const { createClient: createServerClient } = await import("../../lib/supabase/server");
    const { createServiceRoleClient } = await import("../../lib/invitations");
    await assert.rejects(createServerClient(), /Supabase target blocked/);
    await assert.rejects(createServiceRoleClient(), /Supabase target blocked/);

    for (const target of [DEV, "http://127.0.0.1:54321"]) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = target;
      assert.equal(typeof (await createServerClient()).from, "function");
      assert.equal(typeof (await createServiceRoleClient()).auth.admin.listUsers, "function");
    }

    host = "ssl-data-collector.ssl-lab.workers.dev";
    process.env.NEXT_PUBLIC_SUPABASE_URL = PRODUCTION;
    assert.equal(typeof (await createServerClient()).from, "function");
    assert.equal(typeof (await createServiceRoleClient()).auth.admin.listUsers, "function");
    assert.equal(fetch.mock.callCount(), 0);
  } finally {
    restore();
  }
});

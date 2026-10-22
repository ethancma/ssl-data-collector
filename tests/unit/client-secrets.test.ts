import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../../scripts/check-client-secrets.mjs", import.meta.url));
const sentinel = "unit-test-server-secret-sentinel";

test("client secret scan checks nested output and fails on the exact secret", () => {
  const directory = mkdtempSync(join(tmpdir(), "ssl-client-secret-test-"));
  try {
    const nested = join(directory, "assets");
    mkdirSync(nested);
    const file = join(nested, "app.js");
    writeFileSync(file, "public browser code");
    const run = () => spawnSync(process.execPath, [script, directory], {
      env: { ...process.env, SUPABASE_SECRET_KEY: sentinel },
      encoding: "utf8",
    });
    const clean = run();
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, /Checked 1 client files/);

    writeFileSync(file, `const leaked = "${sentinel}";`);
    const leaked = run();
    assert.notEqual(leaked.status, 0);
    assert.match(leaked.stderr, /Server secret found in client output/);
    assert.equal(leaked.stderr.includes(sentinel), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("client secret scan rejects empty output and missing configuration", () => {
  const directory = mkdtempSync(join(tmpdir(), "ssl-client-secret-test-"));
  try {
    const empty = spawnSync(process.execPath, [script, directory], {
      env: { ...process.env, SUPABASE_SECRET_KEY: sentinel },
      encoding: "utf8",
    });
    assert.notEqual(empty.status, 0);
    assert.match(empty.stderr, /No client files were scanned/);

    const missing = spawnSync(process.execPath, [script], {
      env: { ...process.env, SUPABASE_SECRET_KEY: "" },
      encoding: "utf8",
    });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Provide SUPABASE_SECRET_KEY/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

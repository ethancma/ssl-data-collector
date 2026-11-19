import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const hook = fileURLToPath(new URL("../../.github/hooks/agent-hook.mjs", import.meta.url));

function runHook(event: "pre" | "post", cwd: string, toolArgs: object) {
  return spawnSync(process.execPath, [hook, event], {
    input: JSON.stringify({ cwd, toolName: "editFile", toolArgs }),
    encoding: "utf8",
    env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(cwd) },
  });
}

test("the edit guard blocks environment files inside and outside the repository", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ssl-agent-hook-test-"));
  const repo = path.join(directory, "repo");
  try {
    mkdirSync(repo);
    for (const filePath of [
      path.join(repo, ".env.local"),
      path.join(directory, "outside", ".env.local"),
      path.join("..", "outside", ".env.local"),
    ]) {
      const result = runHook("pre", repo, { filePath });
      assert.equal(result.status, 2, `Expected ${filePath} to be blocked`);
      assert.match(result.stderr, /Blocked by repo guardrail/);
    }

    const example = runHook("pre", repo, { filePath: path.join(repo, ".env.example") });
    assert.equal(example.status, 0, example.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("post-edit lint skips outside paths and reports errors for in-repo files", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ssl-agent-hook-test-"));
  const repo = path.join(directory, "repo");
  const sibling = path.join(directory, "repo-sibling");
  const bin = path.join(repo, "node_modules", ".bin");
  const lintLog = path.join(directory, "eslint-args.json");
  const inside = path.join(repo, "src", "inside.ts");
  const outside = path.join(sibling, "outside.ts");
  try {
    mkdirSync(bin, { recursive: true });
    mkdirSync(path.dirname(inside), { recursive: true });
    mkdirSync(sibling);
    writeFileSync(inside, "");
    writeFileSync(outside, "");
    writeFileSync(path.join(bin, "eslint"), [
      "#!/usr/bin/env node",
      'const fs = require("node:fs");',
      `fs.writeFileSync(${JSON.stringify(lintLog)}, JSON.stringify(process.argv.slice(2)));`,
      'process.stderr.write("simulated ESLint failure");',
      "process.exitCode = 1;",
      "",
    ].join("\n"), { mode: 0o755 });

    const externalOnly = runHook("post", repo, { filePath: outside });
    assert.equal(externalOnly.status, 0, externalOnly.stderr);
    assert.equal(existsSync(lintLog), false);

    const mixed = runHook("post", repo, { files: [{ filePath: outside }, { filePath: inside }] });
    assert.equal(mixed.status, 0, mixed.stderr);
    assert.deepEqual(JSON.parse(readFileSync(lintLog, "utf8")), [
      "--quiet",
      "--no-warn-ignored",
      "--cache",
      "--cache-location",
      path.join(repo, "node_modules", ".cache", "agent-hook-eslint"),
      path.join("src", "inside.ts"),
    ]);
    assert.match(JSON.parse(mixed.stdout).additionalContext, /simulated ESLint failure/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const hook = fileURLToPath(new URL("../../.github/hooks/agent-hook.mjs", import.meta.url));
const repoRoot = path.resolve(path.dirname(hook), "../..");
const config = JSON.parse(readFileSync(path.join(repoRoot, ".github/hooks/guardrails.json"), "utf8"));

test("configured hook commands run with a minimal PATH and preserve pre-tool protections", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "ssl-agent-hook-test-"));
  // Expose only the running Node so the test does not depend on how Node is installed on the host.
  const bin = path.join(directory, "bin");
  mkdirSync(bin);
  symlinkSync(process.execPath, path.join(bin, "node"));
  const invoke = (command: string, toolName: string, toolArgs: object = {}) =>
    spawnSync("/bin/bash", ["-c", command], {
      cwd: repoRoot,
      input: JSON.stringify({ cwd: directory, toolName, toolArgs }),
      encoding: "utf8",
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, GIT_CEILING_DIRECTORIES: path.dirname(directory) },
    });
  try {
    for (const entries of Object.values(config.hooks) as { bash: string; command: string }[][]) {
      for (const entry of entries) {
        for (const command of new Set([entry.bash, entry.command])) {
          const result = invoke(command, "view");
          assert.equal(result.status, 0, result.stderr);
        }
      }
    }

    assert.equal(config.hooks.preToolUse.length, 1);
    for (const command of new Set<string>([
      config.hooks.preToolUse[0].bash,
      config.hooks.preToolUse[0].command,
    ])) {
      for (const [toolName, toolArgs] of [
        ["view", { path: "README.md" }],
        ["glob", { pattern: "supabase/migrations/*.sql" }],
        ["skill", { skill: "supabase-migrations" }],
        ["bash", { command: "git --no-pager status --short --branch" }],
      ] as const) {
        const result = invoke(command, toolName, toolArgs);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stdout, "");
      }
      const push = invoke(command, "bash", { command: "git push" });
      assert.equal(push.status, 0, push.stderr);
      assert.equal(JSON.parse(push.stdout).permissionDecision, "ask");
      for (const [toolName, toolArgs] of [
        ["bash", { command: "git push --force" }],
        ["bash", { command: "supabase db push" }],
        ["editFile", { filePath: ".env.local" }],
      ] as const) {
        const result = invoke(command, toolName, toolArgs);
        assert.equal(result.status, 2, result.stderr);
        assert.match(result.stderr, /Blocked by repo guardrail/);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

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

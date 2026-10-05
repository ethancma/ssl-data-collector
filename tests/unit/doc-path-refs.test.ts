import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const ROOTS = ["components", "lib", "app", "tests", "docs", "supabase"];
const SEGMENT = String.raw`(?:[\w.@-]|\[[\w-]+\])+`;
const PATH_PATTERN = new RegExp(
  String.raw`(?<![\w/.-])(?:${ROOTS.join("|")})(?:/${SEGMENT})+`,
  "g",
);

// Vendored third-party skills and one-off prompts mention paths outside this repo.
const OWNED_GITHUB_DIRS = ["agents", "skills/e2e-testing", "skills/supabase-migrations"];

function markdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return markdownFiles(full);
    return full.endsWith(".md") ? [full] : [];
  });
}

function referencedPaths(file: string) {
  const text = readFileSync(file, "utf8");
  const found = new Set<string>();
  for (const match of text.matchAll(PATH_PATTERN)) {
    const cleaned = match[0].replace(/[.,:;]+$/, "").replace(/\/$/, "");
    if (cleaned.includes("*")) continue;
    found.add(cleaned);
  }
  return [...found];
}

test("repo paths mentioned in markdown docs still exist", () => {
  const files = [
    path.join(repoRoot, "README.md"),
    path.join(repoRoot, "AGENTS.md"),
    ...markdownFiles(path.join(repoRoot, "docs")),
    path.join(repoRoot, ".github/PULL_REQUEST_TEMPLATE.md"),
    ...OWNED_GITHUB_DIRS.flatMap((dir) => markdownFiles(path.join(repoRoot, ".github", dir))),
  ].filter((file) => existsSync(file));

  const stale: string[] = [];
  for (const file of files) {
    for (const ref of referencedPaths(file)) {
      if (!existsSync(path.join(repoRoot, ref))) {
        stale.push(`${path.relative(repoRoot, file)} -> ${ref}`);
      }
    }
  }

  assert.deepEqual(stale, []);
});

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { E2E_LOCK_DIR, runPreflight, validateE2eTarget } from "./preflight.mjs";

// Worktrees share one Supabase stack and the teardown sweeps every e2e-tagged row, so runs take turns.
const LOCK_DIR = E2E_LOCK_DIR;

function lockHolderAlive(): boolean {
  try {
    process.kill(Number(readFileSync(path.join(LOCK_DIR, "pid"), "utf8")), 0);
    return true;
  } catch {
    return false;
  }
}

export function releaseE2eLock(): void {
  try {
    if (readFileSync(path.join(LOCK_DIR, "pid"), "utf8") === String(process.pid)) {
      rmSync(LOCK_DIR, { recursive: true, force: true });
    }
  } catch {
    // Not holding the lock (e.g. standalone cleanup run).
  }
}

export async function acquireE2eLock(): Promise<void> {
  const deadline = Date.now() + 20 * 60_000;
  let announced = false;
  for (;;) {
    const candidate = mkdtempSync(path.join(tmpdir(), "ssl-e2e-"));
    writeFileSync(path.join(candidate, "pid"), String(process.pid));
    try {
      renameSync(candidate, LOCK_DIR);
      break;
    } catch {
      rmSync(candidate, { recursive: true, force: true });
      if (!lockHolderAlive()) {
        rmSync(LOCK_DIR, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error(`Timed out waiting for e2e lock ${LOCK_DIR}`);
      if (!announced) console.log(`Waiting for another e2e run to release ${LOCK_DIR}...`);
      announced = true;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
}

export default async function globalSetup(): Promise<void> {
  validateE2eTarget(process.env);
  await acquireE2eLock();
  try {
    const reset = process.env.E2E_RESET_DB === "1";
    await runPreflight(process.env, !reset);
    if (reset) {
      execFileSync("npx", ["supabase", "db", "reset"], { stdio: "inherit" });
      execFileSync(process.execPath, ["scripts/seed-dev-fixtures.mjs", "--local"], { stdio: "inherit" });
      await runPreflight();
    }
  } catch (error) {
    releaseE2eLock();
    throw error;
  }
}

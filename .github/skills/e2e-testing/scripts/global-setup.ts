import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Worktrees share one Supabase stack and the teardown sweeps every e2e-tagged row, so runs take turns.
const LOCK_DIR = path.join(tmpdir(), "ssl-e2e.lock");

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

export default async function globalSetup(): Promise<void> {
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
  if (process.env.E2E_RESET_DB === "1") {
    execFileSync("npx", ["supabase", "db", "reset"], { stdio: "inherit" });
  }
}

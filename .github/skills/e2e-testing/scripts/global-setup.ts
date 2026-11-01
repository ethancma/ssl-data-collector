import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { E2E_LOCK_DIR, runPreflight, validateE2eTarget } from "./preflight.mjs";

// Worktrees share one Supabase stack and the teardown sweeps every e2e-tagged row, so runs take turns.
const LOCK_DIR = E2E_LOCK_DIR;
let setupFailed = false;

function lockProblem(reason: string): Error {
  return new Error(`E2E lock ${LOCK_DIR} ${reason}. Confirm no E2E run or cleanup is active before removing the stale lock manually.`);
}

function lockHolderState(): "absent" | "starting" | "active" {
  let contents: string;
  try {
    contents = readFileSync(path.join(LOCK_DIR, "pid"), "utf8").trim();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return existsSync(LOCK_DIR) ? "starting" : "absent";
    }
    throw error;
  }
  const pid = Number(contents);
  if (!Number.isSafeInteger(pid) || pid <= 0) return "starting";
  try {
    process.kill(pid, 0);
    return "active";
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      throw lockProblem(`records dead PID ${pid}`);
    }
    if (error instanceof Error && "code" in error && error.code === "EPERM") return "active";
    throw error;
  }
}

export function didE2eSetupFail(): boolean {
  return setupFailed;
}

export function ownsE2eLock(): boolean {
  try {
    return readFileSync(path.join(LOCK_DIR, "pid"), "utf8") === String(process.pid);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

export function releaseE2eLock(): void {
  if (ownsE2eLock()) rmSync(LOCK_DIR, { recursive: true, force: true });
}

export async function acquireE2eLock(): Promise<void> {
  const deadline = Date.now() + 20 * 60_000;
  let announced = false;
  let startingSince: number | undefined;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for e2e lock ${LOCK_DIR}`);
    try {
      mkdirSync(LOCK_DIR, { mode: 0o700 });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
      const state = lockHolderState();
      if (state === "absent") {
        startingSince = undefined;
        continue;
      }
      if (state === "starting") {
        startingSince ??= Date.now();
        if (Date.now() - startingSince > 2_000) throw lockProblem("has no verifiable PID");
      } else {
        startingSince = undefined;
      }
      if (!announced) console.log(`Waiting for another e2e run to release ${LOCK_DIR}...`);
      announced = true;
      await new Promise((resolve) => setTimeout(resolve, state === "starting" ? 100 : 2_000));
      continue;
    }
    try {
      writeFileSync(path.join(LOCK_DIR, "pid"), String(process.pid), { flag: "wx" });
    } catch (error) {
      try {
        rmdirSync(LOCK_DIR);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], `Could not initialize or remove E2E lock ${LOCK_DIR}.`);
      }
      throw error;
    }
    return;
  }
}

export default async function globalSetup(): Promise<void> {
  setupFailed = false;
  let acquired = false;
  try {
    validateE2eTarget(process.env);
    await acquireE2eLock();
    acquired = true;
    const reset = process.env.E2E_RESET_DB === "1";
    await runPreflight(process.env, !reset);
    if (reset) {
      execFileSync("npx", ["supabase", "db", "reset"], { stdio: "inherit" });
      execFileSync(process.execPath, ["scripts/seed-dev-fixtures.mjs", "--local"], { stdio: "inherit" });
      await runPreflight();
    }
  } catch (error) {
    setupFailed = true;
    if (acquired) {
      try {
        releaseE2eLock();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "E2E setup failed and its lock could not be released.");
      }
    }
    throw error;
  }
}

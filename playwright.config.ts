import { defineConfig } from "@playwright/test";

// Minimal config for the e2e-testing skill's smoke script. Reuses the always-on
// dev server on :3000 — never starts/stops it (see AGENTS.md).
export default defineConfig({
  testDir: "./.github/skills/e2e-testing/scripts",
  // Default testMatch only picks up *.spec.ts/*.test.ts; the smoke script is
  // named playwright.smoke.ts, so it needs to be matched explicitly.
  testMatch: "**/*.@(spec|test|smoke).?(c|m)[jt]s?(x)",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    trace: "retain-on-failure",
  },
});

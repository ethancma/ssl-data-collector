import { defineConfig } from "@playwright/test";

// Minimal config for the e2e-testing skill's smoke script. Reuses the always-on
// dev server on :3000 — never starts/stops it (see AGENTS.md).
export default defineConfig({
  testDir: "./.github/skills/e2e-testing/scripts",
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

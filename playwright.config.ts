import nextEnv from "@next/env";
import { defineConfig } from "@playwright/test";

nextEnv.loadEnvConfig(process.cwd());

// Reuses the explicitly chosen server; preflight validates it before writes (see AGENTS.md).
export default defineConfig({
  testDir: "./.github/skills/e2e-testing/scripts",
  // Default testMatch only picks up *.spec.ts/*.test.ts; the section scripts are
  // named *.smoke.ts, so that suffix needs to be matched explicitly.
  testMatch: "**/*.@(spec|test|smoke).?(c|m)[jt]s?(x)",
  globalSetup: "./.github/skills/e2e-testing/scripts/global-setup.ts",
  globalTeardown: "./.github/skills/e2e-testing/scripts/global-teardown.ts",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    headless: true,
    trace: "retain-on-failure",
  },
});

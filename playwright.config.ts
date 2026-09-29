import { defineConfig, devices } from "@playwright/test";

import { loadLocalSupabaseEnv } from "./src/lib/e2e/local-supabase-env";

loadLocalSupabaseEnv(process.env);

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  /**
   * Playwright's default is five seconds, which is right for a suite that
   * asserts on markup already on the page. Almost nothing here does: an
   * assertion in this suite is usually waiting on a real upload to storage, a
   * server-side extraction, or an analysis writing its run — work that takes
   * a second alone and several under load.
   *
   * That mismatch has produced the same fake bug four times now, always
   * looking like flake and always being a missing timeout: whichever spec
   * happened to run while the machine was busy. Fifteen seconds matches what
   * this suite actually waits for. The upload navigations keep their explicit
   * 60s — those wait on storage *and* extraction, which is a longer thing
   * again, and saying so at the call site is worth the line.
   */
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
      },
});

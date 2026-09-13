import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config. The Next.js server and the Mongo/RustFS test stack are
 * started/stopped by scripts/test-e2e.sh (not Playwright's `webServer`),
 * because the app also needs the Docker stack up before it can even boot —
 * see AGENTS.md for the full lifecycle. Run with `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Tests share one ephemeral backend (Mongo + RustFS) and mutate the same
  // recordings list, so keep them sequential rather than parallel.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

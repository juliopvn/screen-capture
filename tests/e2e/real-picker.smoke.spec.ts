import { test } from "@playwright/test";

/**
 * Optional, non-blocking smoke test against the *real* getDisplayMedia
 * picker (no mock), per PROMT.md Fase 9 point 2. Requires launching
 * Chromium with fake-media flags under a virtual display, which this
 * project's default `npm run test:e2e` does not set up:
 *
 *   npx playwright test real-picker.smoke --project=chromium-real-picker
 *
 * with a project in playwright.config.ts (or a one-off launch) adding:
 *   args: [
 *     "--use-fake-ui-for-media-stream",
 *     '--auto-select-desktop-capture-source=Entire screen',
 *   ]
 * and run under Xvfb in CI (e.g. `xvfb-run -- npx playwright test ...`).
 *
 * Skipped by default: it depends on OS-level screen capture support that
 * is flaky in containerized CI, so it must never block the pipeline.
 */
test.skip(
  !process.env.RUN_REAL_PICKER_SMOKE,
  "Opt-in only: set RUN_REAL_PICKER_SMOKE=1 and run under Xvfb with fake-ui-for-media-stream.",
);

test("real picker: start and stop a recording end to end", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-button").click();
  await page.getByTestId("viewfinder").waitFor({ state: "visible" });
  await page.waitForTimeout(1500);
  await page.getByTestId("stop-button").click();
  await page.getByTestId("capture-video").waitFor({ state: "visible" });
});

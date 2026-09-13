import { expect, test } from "@playwright/test";
import { mockGetDisplayMedia } from "./support/mock-display-media";

test.describe.serial("full recording flow", () => {
  const description = `E2E recording ${Date.now()}`;

  test("loads the main page with idle state", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("viewfinder")).toHaveAttribute("data-status", "idle");
    await expect(page.getByTestId("rec-indicator")).toContainText("STANDBY");
    await expect(page.getByTestId("start-button")).toBeVisible();
    await expect(page.getByTestId("stop-button")).toHaveCount(0);
  });

  test("records, previews, saves and appears in the list without reload", async ({ page }) => {
    await mockGetDisplayMedia(page);
    await page.goto("/");

    await page.getByTestId("start-button").click();
    await expect(page.getByTestId("viewfinder")).toHaveAttribute("data-status", "recording");
    await expect(page.getByTestId("rec-indicator")).toContainText("REC");

    // Let MediaRecorder collect at least one timesliced chunk before stopping.
    await page.waitForTimeout(1500);

    await page.getByTestId("stop-button").click();
    await expect(page.getByTestId("viewfinder")).toHaveAttribute("data-status", "preview");
    await expect(page.getByTestId("capture-video")).toBeVisible();

    await page.getByTestId("description-input").fill(description);
    await page.getByTestId("save-button").click();

    await expect(page.getByTestId("viewfinder")).toHaveAttribute("data-status", "idle", {
      timeout: 15_000,
    });

    const savedCard = page.getByTestId("recording-card").filter({ hasText: description });
    await expect(savedCard).toBeVisible();
    await expect(savedCard.getByTestId("recording-player")).toHaveAttribute("src", /.+/);
  });

  test("plays the saved recording from the reel", async ({ page }) => {
    await page.goto("/");

    const savedCard = page.getByTestId("recording-card").filter({ hasText: description });
    await expect(savedCard).toBeVisible();

    const player = savedCard.getByTestId("recording-player");
    const src = await player.getAttribute("src");
    expect(src).toBeTruthy();

    // The video element should be able to load metadata from the real
    // storage backend (readyState reaches HAVE_METADATA or beyond).
    await page.waitForFunction(
      (el) => (el as HTMLVideoElement).readyState >= 1,
      await player.elementHandle(),
      { timeout: 15_000 },
    );
  });
});

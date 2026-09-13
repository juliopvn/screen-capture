import { expect, test } from "@playwright/test";
import { mockGetDisplayMedia } from "./support/mock-display-media";
import type { RecordingDto } from "../../lib/types";

test("shows a clear error when the user cancels the screen picker", async ({ page }) => {
  await mockGetDisplayMedia(page, { rejectWith: "NotAllowedError" });
  await page.goto("/");

  await page.getByTestId("start-button").click();

  await expect(page.getByTestId("error-message")).toBeVisible();
  await expect(page.getByTestId("error-message")).toContainText(/cancelado|permiso/i);
  // The UI must stay usable — the user can try again.
  await expect(page.getByTestId("start-button")).toBeEnabled();
});

test("shows an error and creates no orphan metadata when the upload fails", async ({ page }) => {
  const description = `Upload failure ${Date.now()}`;

  await mockGetDisplayMedia(page);
  // Only the binary PUT to storage fails; the app's own API routes (GET/POST
  // /api/*) pass through untouched so we can assert no metadata was created.
  await page.route("**/*", async (route) => {
    if (route.request().method() === "PUT") {
      await route.fulfill({ status: 500, body: "mock storage failure" });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await page.getByTestId("start-button").click();
  await expect(page.getByTestId("viewfinder")).toHaveAttribute("data-status", "recording");
  await page.waitForTimeout(1200);
  await page.getByTestId("stop-button").click();
  await expect(page.getByTestId("viewfinder")).toHaveAttribute("data-status", "preview");

  await page.getByTestId("description-input").fill(description);
  await page.getByTestId("save-button").click();

  await expect(page.getByTestId("error-message")).toBeVisible();
  await expect(page.getByTestId("error-message")).toContainText(/subida/i);
  // Stays in preview (not reset to idle) so the user can retry the save.
  await expect(page.getByTestId("viewfinder")).toHaveAttribute("data-status", "preview");

  const response = await page.request.get("/api/recordings");
  expect(response.ok()).toBeTruthy();
  const { recordings } = (await response.json()) as { recordings: RecordingDto[] };
  expect(recordings.some((recording) => recording.description === description)).toBe(false);
});

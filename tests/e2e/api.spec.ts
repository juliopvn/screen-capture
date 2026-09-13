import { expect, test } from "@playwright/test";
import type { RecordingDto } from "../../lib/types";

/**
 * Integration-level checks for /api/recordings directly, complementing the
 * UI-driven E2E specs. Runs against the same ephemeral test backend.
 */
test.describe("GET/POST /api/recordings", () => {
  test("rejects a payload missing required fields", async ({ request }) => {
    const response = await request.post("/api/recordings", {
      data: { description: "missing s3 fields" },
    });
    expect(response.status()).toBe(400);
  });

  test("creates a recording and lists it back, newest first", async ({ request }) => {
    const payload = {
      description: `API integration ${Date.now()}`,
      s3Key: `api-test-${Date.now()}.webm`,
      s3Url: "http://localhost:9101/recordings-e2e/api-test.webm",
    };

    const createResponse = await request.post("/api/recordings", { data: payload });
    expect(createResponse.status()).toBe(201);
    const { recording } = (await createResponse.json()) as { recording: RecordingDto };
    expect(recording._id).toBeTruthy();
    expect(recording.description).toBe(payload.description);

    const listResponse = await request.get("/api/recordings");
    expect(listResponse.ok()).toBeTruthy();
    const { recordings } = (await listResponse.json()) as { recordings: RecordingDto[] };
    expect(recordings[0]._id).toBe(recording._id);
  });
});

test.describe("POST /api/upload-url", () => {
  test("returns a presigned URL and a unique key", async ({ request }) => {
    const response = await request.post("/api/upload-url", {
      data: { contentType: "video/webm" },
    });
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { uploadUrl: string; key: string; publicUrl: string };
    expect(body.uploadUrl).toContain("http");
    expect(body.key).toMatch(/\.webm$/);
    expect(body.publicUrl).toContain(body.key);
  });
});

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildRecordingKey, createUploadUrl } from "@/lib/s3";

const requestSchema = z.object({
  contentType: z.string().min(1).default("video/webm"),
});

/**
 * POST /api/upload-url — mints a presigned PUT URL so the browser can
 * upload the recording binary straight to S3-compatible storage. This is
 * the only server involvement in the upload path; the video bytes never
 * pass through Next.js.
 */
export async function POST(request: NextRequest) {
  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const key = buildRecordingKey("webm");
    const { uploadUrl, publicUrl } = await createUploadUrl(key, parsed.data.contentType);
    return NextResponse.json({ uploadUrl, key, publicUrl });
  } catch (error) {
    console.error("Failed to create upload URL", error);
    return NextResponse.json({ error: "Storage backend unavailable" }, { status: 502 });
  }
}

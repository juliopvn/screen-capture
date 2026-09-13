import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRecordingsCollection } from "@/lib/mongodb";
import type { RecordingDto } from "@/lib/types";

const createRecordingSchema = z.object({
  description: z.string().trim().max(500).default(""),
  s3Key: z.string().min(1, "s3Key is required"),
  s3Url: z.url({ message: "s3Url must be a valid URL" }),
});

/** GET /api/recordings — list recordings, newest first. */
export async function GET() {
  const collection = await getRecordingsCollection();
  const documents = await collection.find().sort({ createdAt: -1 }).toArray();

  const recordings: RecordingDto[] = documents.map((doc) => ({
    _id: doc._id.toString(),
    description: doc.description,
    s3Key: doc.s3Key,
    s3Url: doc.s3Url,
    createdAt: doc.createdAt.toISOString(),
  }));

  return NextResponse.json({ recordings });
}

/**
 * POST /api/recordings — persist metadata for a video already uploaded
 * directly to S3-compatible storage by the client. The binary never
 * passes through this route.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createRecordingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const collection = await getRecordingsCollection();
  const createdAt = new Date();
  const { insertedId } = await collection.insertOne({
    ...parsed.data,
    createdAt,
  });

  const recording: RecordingDto = {
    _id: insertedId.toString(),
    ...parsed.data,
    createdAt: createdAt.toISOString(),
  };

  return NextResponse.json({ recording }, { status: 201 });
}

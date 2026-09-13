import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { env } from "./env";

/**
 * S3-compatible client. Works unchanged against RustFS locally and
 * Cloudflare R2 in production — only the env vars differ (see .env.example).
 */
export const s3Client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

const UPLOAD_URL_EXPIRY_SECONDS = 5 * 60;

let bucketReadyPromise: Promise<void> | null = null;

/**
 * Auto-provisions the bucket on first use (HeadBucket → CreateBucket on
 * miss). Memoized per server process so repeated uploads don't re-check.
 */
export function ensureBucketExists(): Promise<void> {
  if (!bucketReadyPromise) {
    bucketReadyPromise = (async () => {
      try {
        await s3Client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
      } catch {
        await s3Client.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
      }
      // The browser uploads the video directly to this bucket (see
      // createUploadUrl below), which makes it a cross-origin PUT — without
      // a CORS policy the browser's preflight rejects it before it's sent.
      await s3Client.send(
        new PutBucketCorsCommand({
          Bucket: env.S3_BUCKET,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: [env.S3_CORS_ORIGIN],
                AllowedMethods: ["GET", "PUT", "HEAD"],
                AllowedHeaders: ["*"],
                ExposeHeaders: ["ETag"],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      );
      // Recordings are played back with a plain <video src>, so the bucket
      // needs anonymous read access. Fine for local RustFS; production
      // (Fase 10, Cloudflare R2) should revisit public-read vs. presigned
      // GET URLs per its own access-control requirements.
      await s3Client.send(
        new PutBucketPolicyCommand({
          Bucket: env.S3_BUCKET,
          Policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Sid: "PublicReadGetObject",
                Effect: "Allow",
                Principal: "*",
                Action: "s3:GetObject",
                Resource: `arn:aws:s3:::${env.S3_BUCKET}/*`,
              },
            ],
          }),
        }),
      );
    })().catch((error) => {
      // Allow retrying on the next call instead of caching a permanent failure.
      bucketReadyPromise = null;
      throw error;
    });
  }

  return bucketReadyPromise;
}

export function buildRecordingKey(extension = "webm"): string {
  return `${Date.now()}-${randomUUID()}.${extension}`;
}

export function buildPublicUrl(key: string): string {
  return `${env.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
}

/**
 * Presigned PUT URL so the browser uploads the recording binary directly to
 * the storage backend — the Next.js server never touches the video bytes.
 */
export async function createUploadUrl(
  key: string,
  contentType: string,
): Promise<{ uploadUrl: string; publicUrl: string }> {
  await ensureBucketExists();

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: UPLOAD_URL_EXPIRY_SECONDS,
  });

  return { uploadUrl, publicUrl: buildPublicUrl(key) };
}

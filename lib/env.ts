import { z } from "zod";

/**
 * Central environment configuration. Import this module (not `process.env`
 * directly) anywhere server-side code needs config — it validates once at
 * module load time and fails fast with a readable error instead of letting
 * `undefined` leak into an S3/Mongo client at request time.
 */

const boolFromString = z
  .string()
  .optional()
  .transform((value) => value === "true")
  .pipe(z.boolean());

const envSchema = z.object({
  S3_ENDPOINT: z.url({ message: "S3_ENDPOINT must be a valid URL, e.g. http://localhost:9001" }),
  S3_ACCESS_KEY: z.string().min(1, "S3_ACCESS_KEY is required"),
  S3_SECRET_KEY: z.string().min(1, "S3_SECRET_KEY is required"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET is required"),
  S3_REGION: z.string().min(1).default("auto"),
  S3_FORCE_PATH_STYLE: boolFromString,
  S3_PUBLIC_URL: z.url({ message: "S3_PUBLIC_URL must be a valid URL" }),
  // Origin allowed to PUT/GET directly against the bucket (browser upload
  // is cross-origin from the storage host). "*" is fine for local dev;
  // production should scope this to the deployed app's real origin.
  S3_CORS_ORIGIN: z.string().min(1).default("*"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid or missing environment variables.\n${issues}\n\nCheck .env.local against .env.example.`,
    );
  }

  return parsed.data;
}

export const env = loadEnv();

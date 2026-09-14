import { Collection, Db, MongoClient } from "mongodb";
import { env } from "./env";
import type { RecordingDocument } from "./types";

const RECORDINGS_COLLECTION = "recordings";

// Cache the client (and the connect promise) on the Node global object so
// hot-reload in dev and repeated serverless invocations reuse one
// connection pool instead of opening a new one per request.
declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

function getClientPromise(): Promise<MongoClient> {
  if (!global._mongoClientPromise) {
    const client = new MongoClient(env.MONGODB_URI);
    global._mongoClientPromise = client.connect();
  }
  return global._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  // No name passed: the driver defaults to whichever database is in the
  // MONGODB_URI path (e.g. ".../screen-capture" locally,
  // ".../screen-capture-prod" in production) instead of a name hardcoded
  // here — a scoped Atlas user only granted access to one specific
  // database name would otherwise get an authorization error.
  return client.db();
}

export async function getRecordingsCollection(): Promise<Collection<RecordingDocument>> {
  const db = await getDb();
  return db.collection<RecordingDocument>(RECORDINGS_COLLECTION);
}

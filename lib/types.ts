/** Shape stored in MongoDB — never includes the video binary. */
export interface RecordingDocument {
  description: string;
  s3Key: string;
  s3Url: string;
  createdAt: Date;
}

/** Wire shape returned by the API (dates serialize to ISO strings over JSON). */
export interface RecordingDto {
  _id: string;
  description: string;
  s3Key: string;
  s3Url: string;
  createdAt: string;
}

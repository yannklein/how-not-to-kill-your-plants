import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

let client: S3Client | undefined;

function s3(): S3Client {
  client ??= new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
  });
  return client;
}

export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObjectBytes(key: string): Promise<Buffer> {
  const res = await s3().send(
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
  );
  if (!res.Body) throw new Error(`Empty object body for ${key}`);
  return Buffer.from(await res.Body.transformToByteArray());
}

export async function signedUrl(key: string, ttlSeconds = 3600): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    { expiresIn: ttlSeconds },
  );
}

export function photoKey(plantIdOrDraft: string): string {
  return `photos/${plantIdOrDraft}/${randomUUID()}.jpg`;
}

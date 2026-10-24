import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

const clients = new Map<string, S3Client>();

function s3(endpoint: string = env.S3_ENDPOINT): S3Client {
  let client = clients.get(endpoint);
  if (client) return client;
  client = new S3Client({
    endpoint,
    region: "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY,
      secretAccessKey: env.S3_SECRET_KEY,
    },
  });
  clients.set(endpoint, client);
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

// Signed URLs are opened by the phones' browsers, so they are presigned against
// S3_PUBLIC_ENDPOINT when set (the server itself talks to S3_ENDPOINT).
export async function signedUrl(key: string, ttlSeconds = 3600): Promise<string> {
  return getSignedUrl(
    s3(env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT),
    new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
    { expiresIn: ttlSeconds },
  );
}

export function photoKey(plantIdOrDraft: string): string {
  return `photos/${plantIdOrDraft}/${randomUUID()}.jpg`;
}

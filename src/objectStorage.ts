import * as Minio from "minio";
import { createHash } from "node:crypto";

const minioClient = new Minio.Client({
  endPoint: process.env["OBJECT_STORAGE_ENDPOINT"]!,
  accessKey: process.env["OBJECT_STORAGE_AK"]!,
  secretKey: process.env["OBJECT_STORAGE_SK"]!,
  useSSL: true,
});

const bucket = process.env["OBJECT_STORAGE_BUCKET"]!;

export async function saveToStorage(
  text: string,
  contentType: string,
  extname: `.${string}`
) {
  const hash = createHash("sha256").update(text).digest("hex");
  const objectName = `bac-portal/${hash}${extname}`;
  await minioClient.putObject(bucket, objectName, text, undefined, {
    "x-amz-acl": "public-read",
    "Content-Type": contentType,
  });
  return objectName;
}

import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

export async function computeChecksumOrThrow(absolutePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(absolutePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

export async function computeChecksum(absolutePath: string): Promise<string | null> {
  try {
    return await computeChecksumOrThrow(absolutePath);
  } catch {
    return null;
  }
}
